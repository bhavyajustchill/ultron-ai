import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { expandHome, displayPath } from '@/lib/fsSandbox';
import { isWindows } from '@/lib/desktopLauncher';

/**
 * Terminal runner for Jarvis (Phase 7.7). Commands are prepared first: read-only commands may
 * run straight away, everything else must be authorised by the operator clicking the HUD
 * confirmation card, and the run step executes exactly the prepared command (bound by a
 * one-time token). sudo and catastrophic commands are refused outright.
 */

export class TerminalError extends Error {}

const TIMEOUT_MS = Number(process.env.JARVIS_TERMINAL_TIMEOUT_MS) || 2 * 60 * 1000;
const MAX_OUTPUT_BYTES = 16 * 1024;
const MAX_COMMAND_LENGTH = 2000;
const PENDING_TTL_MS = 2 * 60 * 1000;

// Survive Next.js dev-server module reloads
const pending = globalThis.__jarvisPendingCommands || (globalThis.__jarvisPendingCommands = new Map());

// Commands that only read state may run without a confirmation click (no shell operators allowed)
const READ_ONLY_RULES = [
  /^(ls|pwd|whoami|date|uptime|df|du|free|uname|hostname|which|lsblk|lscpu|nproc|id|tree|cal|lsb_release|nvidia-smi|sensors)(\s|$)/,
  /^(node|npm|npx|python3?|pip3?|git|flutter|dart|java|go|rustc|cargo|docker)\s+(-v|--version|version)$/,
  /^git\s+(status|log|diff|branch|show|rev-parse|remote(\s+-v)?)(\s|$)/,
  /^ps(\s+(aux|-ef))?$/,
  /^ip\s+(a|addr|address|r|route)(\s|$)/,
  /^echo\s[^]*$/,
];
const SHELL_OPERATORS = /[;&|<>`$(){}\\*?!]/;

const REFUSED = [
  [/(^|[\s;&|(])(sudo|pkexec|doas)\s/, 'needs administrator privileges, so the operator must run it in their own terminal'],
  [/(^|[\s;&|(])su(\s|$)/, 'switches user, which needs a password'],
  [/\brm\s+(-[a-zA-Z]*\s+)*(--no-preserve-root\s+)?(\/|~|\$HOME)\/?(\*)?(\s|$)/, 'would delete the root or home folder'],
  [/\bmkfs(\.\w+)?\b/, 'formats a filesystem'],
  [/\bdd\b[^]*\bof=\/dev\//, 'writes raw data to a disk device'],
  [/>\s*\/dev\/(sd|nvme|hd|vd)/, 'overwrites a disk device'],
  [/:\s*\(\s*\)\s*\{[^]*:\s*\|\s*:/, 'is a fork bomb'],
  [/\b(shutdown|reboot|poweroff|halt)\b|\bsystemctl\s+(poweroff|reboot|halt|suspend|hibernate)\b/, 'powers off or restarts the computer'],
  [/\bchmod\s+(-[a-zA-Z]*\s+)*-R\s+\S+\s+\/(\s|$)|\bchown\s+(-[a-zA-Z]*\s+)*-R\s+\S+\s+\/(\s|$)/, 'changes ownership or permissions of the whole filesystem'],
];

// Highlighted on the confirmation card so the operator knows what to look for
const WARNINGS = [
  [/\brm\s/, 'Deletes files'],
  [/\b(curl|wget)\b[^]*\|\s*(ba|z)?sh\b/, 'Pipes a downloaded script straight into a shell'],
  [/\bgit\s+(push\s+[^]*(-f|--force)|reset\s+--hard|clean\s+-[a-z]*f)/, 'Rewrites or discards git history / changes'],
  [/(^|[^>])>\s*[^&\s]/, 'Overwrites a file via redirection'],
  [/\b(kill|pkill|killall)\b/, 'Terminates processes'],
  [/\b(chmod|chown)\b/, 'Changes file permissions or ownership'],
  [/\bnpm\s+(publish|unpublish)\b/, 'Publishes to the npm registry'],
  [/\b(apt|apt-get|dnf|pacman|snap|flatpak)\s+(install|remove|purge)\b/, 'Changes installed system packages'],
];

export function classifyCommand(command) {
  const refusal = REFUSED.find(([pattern]) => pattern.test(command));
  if (refusal) return { refused: true, reason: refusal[1] };
  const readOnly = !SHELL_OPERATORS.test(command) && READ_ONLY_RULES.some((rule) => rule.test(command));
  return {
    refused: false,
    readOnly,
    warnings: WARNINGS.filter(([pattern]) => pattern.test(command)).map(([, label]) => label),
  };
}

function resolveWorkingDirectory(cwd) {
  const dir = path.resolve(/*turbopackIgnore: true*/ os.homedir(), expandHome((cwd || '~').trim() || '~'));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new TerminalError(`Working directory ${displayPath(dir)} does not exist.`);
  }
  return dir;
}

function prunePending() {
  for (const [id, request] of pending) {
    if (Date.now() - request.createdAt > PENDING_TTL_MS) pending.delete(id);
  }
}

/**
 * Validates and stages a command. Returns the request (with a one-time token) and whether it
 * needs the operator's confirmation click before it may run.
 */
export function prepareCommand({ command, cwd, reason, background }) {
  const text = String(command || '').trim();
  if (!text) throw new TerminalError('No command was provided.');
  if (text.length > MAX_COMMAND_LENGTH) throw new TerminalError('That command is too long to review safely.');
  if (/[\r\n]/.test(text)) throw new TerminalError('Send one command line at a time (chain steps with && if needed).');

  const classification = classifyCommand(text);
  if (classification.refused) throw new TerminalError(`Refused: this command ${classification.reason}.`);

  const needsConfirmation = !classification.readOnly || Boolean(background);
  prunePending();
  const request = {
    id: `cmd-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
    token: !needsConfirmation ? crypto.randomBytes(16).toString('hex') : null,
    command: text,
    cwd: resolveWorkingDirectory(cwd),
    reason: String(reason || '').slice(0, 300),
    background: Boolean(background),
    needsConfirmation,
    authorized: !needsConfirmation,
    warnings: classification.warnings,
    createdAt: Date.now(),
  };
  pending.set(request.id, request);
  return {
    id: request.id,
    token: request.authorized ? request.token : undefined,
    command: request.command,
    cwd: displayPath(request.cwd),
    reason: request.reason,
    background: request.background,
    needs_confirmation: request.needsConfirmation,
    warnings: request.warnings,
  };
}

export function authorizeCommand(id) {
  prunePending();
  const request = pending.get(id);
  if (!request) throw new TerminalError('That command request has expired or was not found.');
  request.authorized = true;
  request.token = crypto.randomBytes(16).toString('hex');
  return request.token;
}

export function cancelCommand(id) {
  return pending.delete(id);
}


function shellFor(command) {
  return isWindows ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command]] : ['bash', ['-lc', command]];
}

const COMMAND_ENV = { TERM: 'dumb', NO_COLOR: '1', FORCE_COLOR: '0', CI: '1', PAGER: 'cat', GIT_PAGER: 'cat' };

function runInBackground(request) {
  const logPath = path.join(/*turbopackIgnore: true*/ os.tmpdir(), `jarvis-${request.id}.log`);
  const logFd = fs.openSync(logPath, 'a');
  const [shell, args] = shellFor(request.command);
  const child = spawn(shell, args, {
    cwd: request.cwd,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env, ...COMMAND_ENV },
  });
  child.unref();
  fs.closeSync(logFd);
  return { background: true, pid: child.pid, log_path: logPath };
}

function runInForeground(request) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const [shell, args] = shellFor(request.command);
    // Own process group so a timeout kills the whole pipeline, not just the shell
    const child = spawn(shell, args, {
      cwd: request.cwd,
      detached: !isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...COMMAND_ENV },
    });

    const output = { stdout: [], stderr: [], bytes: { stdout: 0, stderr: 0 }, truncated: false };
    const collect = (stream) => (chunk) => {
      const room = MAX_OUTPUT_BYTES - output.bytes[stream];
      if (room <= 0) {
        output.truncated = true;
        return;
      }
      const slice = chunk.length > room ? chunk.subarray(0, room) : chunk;
      if (slice.length < chunk.length) output.truncated = true;
      output[stream].push(slice);
      output.bytes[stream] += slice.length;
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));

    let timedOut = false;
    const killTree = (signal) => {
      try {
        if (isWindows) child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        // Already exited
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killTree('SIGTERM');
      setTimeout(() => killTree('SIGKILL'), 3000);
    }, TIMEOUT_MS);

    const finish = (exitCode, error) => {
      clearTimeout(timer);
      resolve({
        exit_code: exitCode,
        stdout: Buffer.concat(output.stdout).toString('utf-8'),
        stderr: Buffer.concat(output.stderr).toString('utf-8') + (error ? `\n${error}` : ''),
        timed_out: timedOut,
        truncated: output.truncated,
        duration_ms: Date.now() - startedAt,
      });
    };
    child.on('error', (err) => finish(null, err.message));
    child.on('close', (code) => finish(code));
  });
}

/**
 * Runs a prepared command. `confirmed` must be true for commands that needed the operator's click.
 */
export async function runCommand({ id, token, confirmed }) {
  prunePending();
  const request = pending.get(id);
  if (!request) throw new TerminalError('That command request has expired or was already used. Prepare it again.');
  if (request.needsConfirmation && !request.authorized) {
    throw new TerminalError('This command has not been authorized by the operator on the HUD.');
  }
  if (!request.token || request.token !== token) {
    throw new TerminalError('Command authorisation token mismatch.');
  }
  if (request.needsConfirmation && confirmed !== true) {
    throw new TerminalError('This command needs the operator to authorise it on the HUD first.');
  }
  pending.delete(id);

  const result = request.background ? runInBackground(request) : await runInForeground(request);
  return { command: request.command, cwd: displayPath(request.cwd), ...result };
}
