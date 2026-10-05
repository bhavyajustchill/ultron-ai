import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Server half of the Windows desktop host (Phase 15): one long-lived Windows PowerShell 5.1 process
 * running bin/win-desktop-host.ps1, driven with one JSON line per request. Windows, keyboard and
 * mouse input, the focused control, and Word / Excel / PowerPoint all go through it, so nothing has
 * to be installed and each call costs milliseconds once the host has started (about a second).
 * A call that times out restarts the host, so a hung app (or Office dialog) cannot wedge it.
 */

const HOST_SCRIPT = path.join(/*turbopackIgnore: true*/ process.cwd(), 'bin', 'win-desktop-host.ps1');
const START_TIMEOUT_MS = 20000;
const DEFAULT_TIMEOUT_MS = 10000;

export class WinHostError extends Error {}

// Route handlers are bundled separately, so the host lives on globalThis to be shared
const state = globalThis.__jarvisWinHost || (globalThis.__jarvisWinHost = { child: null, ready: null, pending: new Map(), nextId: 1 });

function failAll(message) {
  for (const { reject, timer } of state.pending.values()) {
    clearTimeout(timer);
    reject(new WinHostError(message));
  }
  state.pending.clear();
}

function stopHost(reason) {
  const { child } = state;
  state.child = null;
  state.ready = null;
  failAll(reason);
  if (child && child.exitCode === null) {
    try {
      child.kill();
    } catch {
      // Already gone
    }
  }
}

function startHost() {
  if (state.ready) return state.ready;
  if (!fs.existsSync(/*turbopackIgnore: true*/ HOST_SCRIPT)) {
    return Promise.reject(new WinHostError('The Windows desktop helper (bin/win-desktop-host.ps1) is missing.'));
  }

  state.ready = new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', HOST_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    state.child = child;
    let buffer = '';
    let started = false;
    const startTimer = setTimeout(() => {
      if (!started) {
        stopHost('The Windows desktop helper did not start.');
        reject(new WinHostError('The Windows desktop helper did not start within 20 seconds.'));
      }
    }, START_TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          console.warn('[win-desktop-host] Unreadable line:', line.slice(0, 200));
          continue;
        }
        if (message.ready) {
          started = true;
          clearTimeout(startTimer);
          resolve(child);
          continue;
        }
        const waiting = state.pending.get(message.id);
        if (!waiting) continue;
        state.pending.delete(message.id);
        clearTimeout(waiting.timer);
        if (message.ok) waiting.resolve(message.result ?? {});
        else waiting.reject(new WinHostError(message.error || 'The Windows desktop helper reported an error.'));
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => console.warn('[win-desktop-host]', chunk.trim().slice(0, 500)));
    child.once('error', (err) => {
      clearTimeout(startTimer);
      stopHost(`The Windows desktop helper failed: ${err.message}`);
      reject(new WinHostError(`Windows PowerShell could not be started: ${err.message}`));
    });
    child.once('exit', (code) => {
      clearTimeout(startTimer);
      if (state.child === child) stopHost(`The Windows desktop helper stopped (exit ${code}).`);
      if (!started) reject(new WinHostError(`The Windows desktop helper stopped while starting (exit ${code}).`));
    });
  });
  return state.ready;
}

/**
 * Runs one helper command and resolves with its result; rejects with WinHostError.
 */
export async function winCall(cmd, args = {}, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  if (process.platform !== 'win32') throw new WinHostError('The Windows desktop helper only runs on Windows.');
  // An updated helper script takes effect on the next call
  let mtime = 0;
  try {
    mtime = fs.statSync(/*turbopackIgnore: true*/ HOST_SCRIPT).mtimeMs;
  } catch {
    // Missing script: startHost reports it
  }
  if (state.ready && state.scriptMtime !== mtime) stopHost('The Windows desktop helper was updated.');
  if (!state.ready) state.scriptMtime = mtime;
  const child = await startHost();
  const id = state.nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      // A command that never answers means the host is stuck (a hung app, a modal Office dialog)
      stopHost(`The Windows desktop helper was restarted after "${cmd}" took too long.`);
      reject(new WinHostError(`"${cmd}" took longer than ${Math.round(timeout / 1000)} seconds, so it was stopped.`));
    }, timeout);
    state.pending.set(id, { resolve, reject, timer });
    try {
      child.stdin.write(`${JSON.stringify({ id, cmd, args })}\n`);
    } catch (err) {
      clearTimeout(timer);
      state.pending.delete(id);
      reject(new WinHostError(`The Windows desktop helper is not reachable: ${err.message}`));
    }
  });
}
