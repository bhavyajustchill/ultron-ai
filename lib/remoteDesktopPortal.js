import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { findExecutable } from '@/lib/desktopLauncher';

/**
 * Keystrokes on Wayland through the desktop's RemoteDesktop portal (Phase 9.1). No root and no
 * daemon: the first use shows the desktop's own "allow remote interaction" dialog, and the
 * restore token it hands back is saved so later sessions start without asking again (until the
 * operator revokes it). The portal session is held by bin/portal-keyboard.js, a small GJS helper
 * that stays running between requests and exits after a few idle minutes.
 */

const execFileAsync = promisify(execFile);
const BUS_NAME = process.env.JARVIS_PORTAL_BUS_NAME || 'org.freedesktop.portal.Desktop';
const HELPER = path.join(/*turbopackIgnore: true*/ process.cwd(), 'bin', 'portal-keyboard.js');
const TOKEN_FILE = process.env.JARVIS_PORTAL_TOKEN_FILE || path.join(/*turbopackIgnore: true*/ process.cwd(), 'data', 'portal-token.json');
const DEVICE_KEYBOARD = 1;
// Long enough for the operator to answer the permission dialog
const START_TIMEOUT_MS = 2 * 60 * 1000;

export class PortalError extends Error {}

// ---------------------------------------------------------------------------
// Keysyms
// ---------------------------------------------------------------------------

const NAMED_KEYSYMS = {
  ctrl: 0xffe3, shift: 0xffe1, alt: 0xffe9, super: 0xffeb, enter: 0xff0d, tab: 0xff09, escape: 0xff1b,
  backspace: 0xff08, delete: 0xffff, space: 0x20, up: 0xff52, down: 0xff54, left: 0xff51, right: 0xff53,
  home: 0xff50, end: 0xff57, pageup: 0xff55, pagedown: 0xff56, insert: 0xff63, capslock: 0xffe5,
  printscreen: 0xff61, minus: 0x2d, equal: 0x3d, comma: 0x2c, period: 0x2e, slash: 0x2f, semicolon: 0x3b,
  apostrophe: 0x27,
};

/**
 * Keysym for a key name from inputControl's parser ("ctrl", "a", "7", "f5", "enter").
 */
export function keyNameToKeysym(name) {
  if (name in NAMED_KEYSYMS) return NAMED_KEYSYMS[name];
  if (/^[a-z0-9]$/.test(name)) return name.charCodeAt(0);
  const fn = name.match(/^f([1-9]|1[0-2])$/);
  if (fn) return 0xffbe + Number(fn[1]) - 1;
  throw new PortalError(`No keysym for "${name}".`);
}

/**
 * Keysyms that type `text`: Latin-1 characters are their own keysym, line breaks are Return, and
 * everything else uses the Unicode keysym range (typed only if the keyboard layout has it).
 */
export function textToKeysyms(text) {
  const keysyms = [];
  for (const char of String(text).replace(/\r\n?/g, '\n')) {
    const code = char.codePointAt(0);
    if (char === '\n') keysyms.push(0xff0d);
    else if (char === '\t') keysyms.push(0xff09);
    else if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue;
    else if (code <= 0xff) keysyms.push(code);
    else keysyms.push(0x01000000 + code);
  }
  return keysyms;
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

// Re-probed every minute, like the window backend
let probe = { available: false, checkedAt: 0 };

/**
 * Whether the desktop offers a RemoteDesktop portal that can share a keyboard.
 */
export async function portalAvailable() {
  if (Date.now() - probe.checkedAt < 60 * 1000) return probe.available;
  let available = false;
  const gdbus = findExecutable(['gdbus']);
  if (gdbus && findExecutable(['gjs']) && fs.existsSync(/*turbopackIgnore: true*/ HELPER)) {
    try {
      const { stdout } = await execFileAsync(
        gdbus,
        ['call', '--session', '--dest', BUS_NAME, '--object-path', '/org/freedesktop/portal/desktop', '--method', 'org.freedesktop.DBus.Properties.Get', 'org.freedesktop.portal.RemoteDesktop', 'AvailableDeviceTypes'],
        { timeout: 4000 }
      );
      const types = Number(stdout.match(/uint32 (\d+)/)?.[1] || 0);
      available = Boolean(types & DEVICE_KEYBOARD);
    } catch {
      // No portal, or no RemoteDesktop backend for this desktop
    }
  }
  probe = { available, checkedAt: Date.now() };
  return available;
}

// ---------------------------------------------------------------------------
// Helper process
// ---------------------------------------------------------------------------

let helper = null;

function readToken() {
  try {
    return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ TOKEN_FILE, 'utf-8')).restore_token || null;
  } catch {
    return null;
  }
}

function saveToken(token) {
  try {
    fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });
    fs.writeFileSync(/*turbopackIgnore: true*/ TOKEN_FILE, JSON.stringify({ restore_token: token, saved_at: new Date().toISOString() }), { mode: 0o600 });
  } catch (err) {
    console.warn('[remoteDesktopPortal] Could not save the restore token:', err.message);
  }
}

function startHelper() {
  const gjs = findExecutable(['gjs']);
  if (!gjs) throw new PortalError('gjs is not installed.');
  const child = spawn(gjs, ['-m', HELPER], { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
  const state = { child, pending: new Map(), nextId: 1, buffer: '' };

  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk) => {
    state.buffer += chunk;
    let newline;
    while ((newline = state.buffer.indexOf('\n')) >= 0) {
      const line = state.buffer.slice(0, newline).trim();
      state.buffer = state.buffer.slice(newline + 1);
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const waiter = state.pending.get(message.id);
      if (waiter) {
        state.pending.delete(message.id);
        waiter(message);
      }
    }
  });
  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk) => console.warn('[portal-keyboard]', chunk.trim()));
  const fail = (error) => {
    for (const waiter of state.pending.values()) waiter({ ok: false, error });
    state.pending.clear();
    if (helper === state) helper = null;
  };
  child.on('error', (err) => fail(err.message));
  child.stdin.on('error', () => fail('The keyboard helper stopped.'));
  child.on('exit', () => fail('The keyboard helper stopped.'));
  return state;
}

function command(cmd, payload = {}, timeoutMs = 20000) {
  helper ??= startHelper();
  const state = helper;
  const id = state.nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      state.pending.delete(id);
      reject(new PortalError(cmd === 'start' ? 'No answer to the keyboard permission request.' : 'The keyboard helper did not respond.'));
    }, timeoutMs);
    state.pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.ok) resolve(message);
      else reject(Object.assign(new PortalError(message.error || 'Keyboard portal error.'), { denied: Boolean(message.denied) }));
    });
    state.child.stdin.write(`${JSON.stringify({ id, cmd, ...payload })}\n`);
  });
}

/**
 * Makes sure a keyboard session is running (instant when one already is). The very first time
 * this shows the desktop's permission dialog and waits for the operator's answer.
 */
export async function startPortalKeyboard() {
  const saved = readToken();
  const result = await command('start', { restore_token: saved }, START_TIMEOUT_MS);
  if (result.restore_token && result.restore_token !== saved) saveToken(result.restore_token);
}

export async function portalTypeText(text) {
  const keysyms = textToKeysyms(text);
  if (!keysyms.length) throw new PortalError('Nothing typeable in that text.');
  await startPortalKeyboard();
  // Generous timeout: long dictation is typed a key at a time
  await command('type', { keysyms }, 20000 + keysyms.length * 40);
  return keysyms.length;
}

export async function portalPressKeys(keyNames) {
  const keysyms = keyNames.map(keyNameToKeysym);
  await startPortalKeyboard();
  await command('chord', { keysyms });
}

/**
 * Ends the keyboard session (the helper also exits by itself when idle).
 */
export async function stopPortalKeyboard() {
  if (!helper) return;
  try {
    await command('stop', {}, 4000);
  } catch {
    helper?.child.kill();
  }
}
