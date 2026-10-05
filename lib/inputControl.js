import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { cancelConfirm, prepareConfirm, takeConfirm } from '@/lib/confirmGate';
import { findExecutable, isLinux, isWindows } from '@/lib/desktopLauncher';
import { currentTarget, forgetTarget, isHudWindow, isTerminalWindow, pickWindow, rememberTarget, windowLabel } from '@/lib/desktopTarget';
import { portalAvailable, portalPressKeys, portalTypeText, startPortalKeyboard } from '@/lib/remoteDesktopPortal';
import { winCall, WinHostError } from '@/lib/winDesktop';

/**
 * Desktop input & window control for Jarvis (Phase 7.7, Windows and the focus guard in Phase 15).
 * Windows: everything goes through the Windows desktop host (lib/winDesktop.js): user32 window
 * control and SendInput keyboard / mouse, with UI Automation to check the focused control.
 * Linux input: xdotool on X11, ydotool (uinput daemon) on Wayland; without ydotool, Wayland
 * keyboards go through the desktop's RemoteDesktop portal (Phase 9.1). Linux windows: wmctrl +
 * xdotool on X11; on GNOME Wayland the "Window Calls" Shell extension's D-Bus API.
 * Typing aimed at an app ("in Notepad type hello") finds that app's window, brings it to the front
 * if it is not there, checks it got there, and only then types. It never types into the HUD itself,
 * into a password box, or (without the operator's click on the HUD card) into a terminal.
 * `status` reports what is available and the exact setup steps for what is missing.
 */

const execFileAsync = promisify(execFile);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const WINDOW_CALLS_DEST = process.env.JARVIS_WINDOW_CALLS_DEST || 'org.gnome.Shell';
const WINDOW_CALLS_PATH = '/org/gnome/Shell/Extensions/Windows';
const WINDOW_CALLS_IFACE = 'org.gnome.Shell.Extensions.Windows';
// Text longer than this goes in through the clipboard on Windows (the operator's clipboard is put back)
const PASTE_THRESHOLD = 200;
export const MAX_TYPED_CHARS = 20000;

export class InputError extends Error {}

const sessionType = () =>
  (process.env.XDG_SESSION_TYPE || (process.env.WAYLAND_DISPLAY ? 'wayland' : process.env.DISPLAY ? 'x11' : 'unknown')).toLowerCase();

// Windows helper failures surface as ordinary input errors
async function win(cmd, args, options) {
  try {
    return await winCall(cmd, args, options);
  } catch (err) {
    if (err instanceof WinHostError) throw new InputError(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Key names
// ---------------------------------------------------------------------------

const KEY_ALIASES = {
  control: 'ctrl', cmd: 'super', win: 'super', windows: 'super', meta: 'super', option: 'alt',
  return: 'enter', esc: 'escape', del: 'delete', pgup: 'pageup', pgdn: 'pagedown', pagedn: 'pagedown',
  arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right', spacebar: 'space',
};

// Linux input-event codes for ydotool
const KEY_CODES = {
  ctrl: 29, shift: 42, alt: 56, super: 125, enter: 28, tab: 15, escape: 1, backspace: 14, delete: 111,
  space: 57, up: 103, down: 108, left: 105, right: 106, home: 102, end: 107, pageup: 104, pagedown: 109,
  insert: 110, capslock: 58, printscreen: 99,
  q: 16, w: 17, e: 18, r: 19, t: 20, y: 21, u: 22, i: 23, o: 24, p: 25,
  a: 30, s: 31, d: 32, f: 33, g: 34, h: 35, j: 36, k: 37, l: 38,
  z: 44, x: 45, c: 46, v: 47, b: 48, n: 49, m: 50,
  1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 0: 11,
  minus: 12, equal: 13, comma: 51, period: 52, slash: 53, semicolon: 39, apostrophe: 40,
  f1: 59, f2: 60, f3: 61, f4: 62, f5: 63, f6: 64, f7: 65, f8: 66, f9: 67, f10: 68, f11: 87, f12: 88,
};

// X keysym names for xdotool
const KEYSYMS = {
  enter: 'Return', escape: 'Escape', backspace: 'BackSpace', delete: 'Delete', tab: 'Tab', space: 'space',
  up: 'Up', down: 'Down', left: 'Left', right: 'Right', home: 'Home', end: 'End', pageup: 'Prior', pagedown: 'Next',
  insert: 'Insert', capslock: 'Caps_Lock', printscreen: 'Print', minus: 'minus', equal: 'equal', comma: 'comma',
  period: 'period', slash: 'slash', semicolon: 'semicolon', apostrophe: 'apostrophe',
};

// Windows virtual-key codes for the same names
const VK_CODES = {
  ctrl: 0x11, shift: 0x10, alt: 0x12, super: 0x5b, enter: 0x0d, tab: 0x09, escape: 0x1b, backspace: 0x08, delete: 0x2e,
  space: 0x20, up: 0x26, down: 0x28, left: 0x25, right: 0x27, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
  insert: 0x2d, capslock: 0x14, printscreen: 0x2c, minus: 0xbd, equal: 0xbb, comma: 0xbc, period: 0xbe, slash: 0xbf,
  semicolon: 0xba, apostrophe: 0xde,
  ...Object.fromEntries('abcdefghijklmnopqrstuvwxyz'.split('').map((letter, i) => [letter, 0x41 + i])),
  ...Object.fromEntries('0123456789'.split('').map((digit, i) => [digit, 0x30 + i])),
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i + 1}`, 0x70 + i])),
};

export function parseKeys(combo) {
  const keys = String(combo || '')
    .toLowerCase()
    .split(/\s*\+\s*/)
    .map((key) => key.trim().replace(/\s+/g, ''))
    .filter(Boolean)
    .map((key) => KEY_ALIASES[key] || key);
  if (keys.length === 0) throw new InputError('No keys were given (e.g. "ctrl+c", "alt+tab", "enter").');
  const unknown = keys.filter((key) => !(key in KEY_CODES));
  if (unknown.length) throw new InputError(`Unknown key name(s): ${unknown.join(', ')}.`);
  return keys;
}

// ---------------------------------------------------------------------------
// Linux backends
// ---------------------------------------------------------------------------

function ydotoolSocket() {
  return [
    process.env.YDOTOOL_SOCKET,
    process.env.XDG_RUNTIME_DIR ? path.join(process.env.XDG_RUNTIME_DIR, '.ydotool_socket') : null,
    '/tmp/.ydotool_socket',
  ]
    .filter(Boolean)
    .find((candidate) => fs.existsSync(/*turbopackIgnore: true*/ candidate)) || null;
}

// Mouse (and keyboard, when available): xdotool on X11, else ydotool with its daemon running
function inputBackend() {
  if (sessionType() === 'x11') {
    const xdotool = findExecutable(['xdotool']);
    if (xdotool) return { name: 'xdotool', bin: xdotool };
  }
  const ydotool = findExecutable(['ydotool']);
  const socket = ydotool && ydotoolSocket();
  if (socket) return { name: 'ydotool', bin: ydotool, env: { ...process.env, YDOTOOL_SOCKET: socket } };
  return null;
}

/**
 * Keyboard backend: the Windows host, or on Linux the input backend if there is one, else the
 * RemoteDesktop portal.
 */
export async function keyboardBackend() {
  if (isWindows) return { name: 'windows' };
  if (!isLinux) return null;
  return inputBackend() || ((await portalAvailable()) ? { name: 'portal' } : null);
}

async function run(bin, args, env) {
  try {
    const { stdout } = await execFileAsync(bin, args.map(String), { timeout: 8000, env: env || process.env });
    return stdout.trim();
  } catch (err) {
    throw new InputError(`${path.basename(bin)} failed: ${(err.stderr || err.message || '').toString().trim().slice(0, 200)}`);
  }
}

async function gdbusWindows(method, ...args) {
  const gdbus = findExecutable(['gdbus']);
  if (!gdbus) throw new InputError('gdbus is not available.');
  return run(gdbus, ['call', '--session', '--dest', WINDOW_CALLS_DEST, '--object-path', WINDOW_CALLS_PATH, '--method', `${WINDOW_CALLS_IFACE}.${method}`, ...args]);
}

// gdbus prints a single string result as ('...',) with \' and \\ escapes
const unwrapString = (output) => {
  const match = output.match(/^\((['"])([^]*)\1,\)$/);
  return match ? match[2].replace(/\\(.)/g, '$1') : output;
};

// Re-probed every minute so installing the extension takes effect without a restart
let windowCallsProbe = { available: false, checkedAt: 0 };
async function linuxWindowBackend() {
  if (sessionType() === 'x11') {
    const wmctrl = findExecutable(['wmctrl']);
    if (wmctrl) return { name: 'wmctrl', bin: wmctrl };
  }
  if (Date.now() - windowCallsProbe.checkedAt > 60 * 1000) {
    let available = false;
    try {
      await gdbusWindows('List');
      available = true;
    } catch {
      // Extension not installed / not enabled
    }
    windowCallsProbe = { available, checkedAt: Date.now() };
  }
  return windowCallsProbe.available ? { name: 'window-calls' } : null;
}

function setupSteps(session, hasInput, hasWindows, hasKeyboard = hasInput) {
  const steps = [];
  if (!hasInput) {
    steps.push(
      session === 'x11'
        ? 'Install xdotool: sudo apt install xdotool'
        : `${hasKeyboard ? 'Mouse control on Wayland needs ydotool (typing already works through the desktop portal). ' : ''}Install ydotool: sudo apt install ydotool`,
      ...(session === 'x11'
        ? []
        : [
            'Let your user drive the virtual input device: echo \'KERNEL=="uinput", GROUP="input", MODE="0660", OPTIONS+="static_node=uinput"\' | sudo tee /etc/udev/rules.d/80-uinput.rules && sudo usermod -aG input $USER, then log out and back in',
            'Start the ydotool daemon in your session: ydotoold & (add it to Startup Applications to keep it running)',
          ])
    );
  }
  if (!hasWindows) {
    steps.push(
      session === 'x11'
        ? 'Install wmctrl: sudo apt install wmctrl'
        : 'Install the "Window Calls" GNOME Shell extension (extensions.gnome.org/extension/4724/window-calls) to allow window listing and focusing on Wayland'
    );
  }
  return steps;
}

async function linuxWindows(backend) {
  if (backend.name === 'wmctrl') {
    const output = await run(backend.bin, ['-lx']);
    const windows = output.split('\n').filter(Boolean).map((line) => {
      const [id, , wmClass, , ...title] = line.trim().split(/\s+/);
      return { id, title: title.join(' '), app: wmClass?.split('.').pop() || '', className: wmClass || '' };
    });
    // X11: the active window comes from xdotool (decimal id) when it is installed
    const xdotool = findExecutable(['xdotool']);
    if (xdotool) {
      try {
        const active = Number(await run(xdotool, ['getactivewindow']));
        for (const w of windows) w.focused = parseInt(w.id, 16) === active;
      } catch {
        // No active window (desktop focused)
      }
    }
    return windows;
  }
  const windows = JSON.parse(unwrapString(await gdbusWindows('List')));
  const normal = windows.filter((w) => w.window_type === undefined || w.window_type === 0);
  return Promise.all(
    normal.map(async (w) => {
      let title = w.title;
      if (!title) {
        try {
          title = unwrapString(await gdbusWindows('GetTitle', String(w.id)));
        } catch {
          title = w.wm_class || '';
        }
      }
      return { id: String(w.id), title, app: w.wm_class || '', className: w.wm_class || '', focused: Boolean(w.focus) };
    })
  );
}

// ---------------------------------------------------------------------------
// Windows, both platforms
// ---------------------------------------------------------------------------

const fromWindowsRecord = (w) => ({
  id: String(w.handle),
  title: w.title || '',
  app: w.process || '',
  className: w.class_name || '',
  pid: w.pid,
  minimized: Boolean(w.minimized),
  maximized: Boolean(w.maximized),
  focused: Boolean(w.foreground),
  elevated: Boolean(w.elevated),
});

/**
 * Whether windows can be listed / focused here, and why not (Linux setup steps).
 */
export async function windowSupport() {
  if (isWindows) return { available: true, backend: 'windows' };
  if (!isLinux) return { available: false, reason: 'Window control is available on Windows and Linux.' };
  const backend = await linuxWindowBackend();
  return backend ? { available: true, backend: backend.name } : { available: false, reason: setupSteps(sessionType(), true, false).join(' ') };
}

/**
 * Open application windows ({ id, title, app, focused, ... }); front-most first on Windows.
 */
export async function desktopWindows() {
  if (isWindows) return (await win('list_windows')).windows.map(fromWindowsRecord);
  const backend = isLinux ? await linuxWindowBackend() : null;
  if (!backend) throw new InputError(`Window control is not set up on this ${sessionType()} session. ${setupSteps(sessionType(), true, false).join(' ')}`);
  return linuxWindows(backend);
}

/**
 * The window that has the keyboard, or null. On Windows `focus` describes the focused control.
 */
export async function activeWindow({ focusInfo = false } = {}) {
  if (isWindows) {
    const result = await win('foreground', { focus_info: focusInfo });
    return result.window ? { ...fromWindowsRecord(result.window), focus: result.focus || null } : null;
  }
  return (await desktopWindows()).find((w) => w.focused) || null;
}

async function activateWindow(target) {
  if (isWindows) return (await win('focus', { handle: Number(target.id) })).method;
  const backend = await linuxWindowBackend();
  if (!backend) throw new InputError('Window control is not set up.');
  if (backend.name === 'wmctrl') await run(backend.bin, ['-ia', target.id]);
  else await gdbusWindows('Activate', target.id);
  return 'activate';
}

/**
 * Brings `target` to the front unless it is already there, then checks it really is. Throws
 * InputError when it cannot get there (so nothing is typed into the wrong window). Returns
 * { was_front, method, focus } (focus: the focused control on Windows).
 */
export async function ensureFocused(target, { settleMs = 200 } = {}) {
  const label = windowLabel(target);
  if (target.elevated) {
    throw new InputError(`"${label}" runs as administrator, so Windows blocks typing into it from Ultron. Run Ultron as administrator too, or type it yourself.`);
  }
  const before = await activeWindow();
  const wasFront = Boolean(before && before.id === target.id);
  let method = 'already';
  if (!wasFront) {
    method = await activateWindow(target);
    const deadline = Date.now() + (isWindows ? 300 : 1500);
    let now = await activeWindow();
    while ((!now || now.id !== target.id) && Date.now() < deadline) {
      await sleep(100);
      now = await activeWindow();
    }
    if (!now || now.id !== target.id || method === 'failed') {
      throw new InputError(`I could not bring "${label}" to the front, so nothing was typed. Click into it and ask again.`);
    }
    await sleep(settleMs);
  }
  let focus = null;
  if (isWindows) {
    focus = (await win('focus_info')).focus;
    if (focus?.is_password) throw new InputError(`The cursor in "${label}" is in a password box, so nothing was typed.`);
  }
  rememberTarget(target);
  return { was_front: wasFront, method, previous: wasFront ? null : before ? windowLabel(before) : null, focus };
}

/**
 * The window a typing / key command is meant for: the named app's window, or (no app named) only
 * the app Jarvis is working in (the one it last opened, focused, or typed into). Whatever merely
 * happens to be in front is never typed into unasked. Throws InputError when the named app is not
 * open, or no app was named and there is no app Jarvis is working in.
 */
export async function resolveTargetWindow({ app, hudTitle } = {}) {
  const windows = await desktopWindows();
  if (app) {
    const match = pickWindow(windows.filter((w) => !isHudWindow(w, hudTitle)), app);
    if (!match) throw new InputError(`"${app}" is not open. Open it first (or use write_in_app, which opens it).`);
    return match;
  }
  const remembered = currentTarget();
  const working = remembered && windows.find((w) => w.id === remembered.id && !isHudWindow(w, hudTitle));
  if (working) return working;
  throw new InputError('Say which app to type into (for example "in Notepad type..."): Ultron only types into an app it was told about.');
}

// ---------------------------------------------------------------------------
// Typing and keys into the focused window
// ---------------------------------------------------------------------------

// Portal failures (declined dialog, helper gone) surface as ordinary input errors
async function viaPortal(action) {
  try {
    return await action();
  } catch (err) {
    throw new InputError(err.denied ? 'Keyboard access was declined in the desktop permission dialog, so nothing was typed. Ask again to see the dialog once more.' : `Keyboard portal: ${err.message}`);
  }
}

/**
 * Types into whatever has focus right now. Windows pastes long text through the clipboard.
 */
export async function typeIntoFocused(text, { backend } = {}) {
  if (!text) throw new InputError('No text to type.');
  if (text.length > MAX_TYPED_CHARS) throw new InputError(`That is too long to type (over ${MAX_TYPED_CHARS.toLocaleString('en')} characters).`);
  const kb = backend || (await keyboardBackend());
  if (!kb) {
    const session = sessionType();
    throw new InputError(`Keyboard control is not set up on this ${session} session. ${setupSteps(session, false, true).join(' Then: ')}`);
  }
  if (kb.name === 'windows') {
    const typed = await win('type_text', { text, delay_ms: 2, method: text.length > PASTE_THRESHOLD ? 'paste' : 'type' }, { timeout: Math.max(10000, text.length * 25) });
    return { chars: typed.chars, method: typed.method, backend: 'windows' };
  }
  if (text.length > 2000) throw new InputError('That is too long to type key by key here (over 2,000 characters).');
  if (kb.name === 'portal') await viaPortal(() => portalTypeText(text));
  else if (kb.name === 'xdotool') await run(kb.bin, ['type', '--delay', '12', '--', text]);
  else await run(kb.bin, ['type', '--', text], kb.env);
  return { chars: text.length, method: 'type', backend: kb.name };
}

export async function pressInFocused(keys, { backend } = {}) {
  const parsed = parseKeys(keys);
  const kb = backend || (await keyboardBackend());
  if (!kb) {
    const session = sessionType();
    throw new InputError(`Keyboard control is not set up on this ${session} session. ${setupSteps(session, false, true).join(' Then: ')}`);
  }
  if (kb.name === 'windows') await win('press_keys', { vks: parsed.map((k) => VK_CODES[k]) });
  else if (kb.name === 'portal') await viaPortal(() => portalPressKeys(parsed));
  else if (kb.name === 'xdotool') await run(kb.bin, ['key', '--clearmodifiers', parsed.map((k) => KEYSYMS[k] || k).join('+')]);
  else {
    const codes = parsed.map((k) => KEY_CODES[k]);
    await run(kb.bin, ['key', ...codes.map((c) => `${c}:1`), ...codes.reverse().map((c) => `${c}:0`)], kb.env);
  }
  return parsed;
}

/**
 * Gets typing ready before an app is launched, so the portal's first-time permission dialog is
 * answered before any keystrokes are due. Throws InputError with setup steps when no keyboard
 * backend exists; returns the backend name.
 */
export async function prepareKeyboard() {
  const backend = await keyboardBackend();
  if (!backend) {
    const session = sessionType();
    throw new InputError(`Typing into apps is not set up on this ${session} session. ${setupSteps(session, false, true).join(' Then: ')}`);
  }
  if (backend.name === 'portal') await viaPortal(startPortalKeyboard);
  return backend.name;
}

// Keys that would run whatever is typed in a terminal
const SUBMITS = (keys) => keys.some((k) => k === 'enter') || (keys.includes('ctrl') && keys.includes('v')) || (keys.includes('shift') && keys.includes('insert'));

/**
 * A terminal needs the operator's click before Jarvis types or presses Enter in it: returns the
 * HUD card request, or null when no approval is needed.
 */
export function terminalApproval(target, { text, keys }, payload) {
  if (!isTerminalWindow(target)) return null;
  if (keys && !SUBMITS(keys)) return null;
  const preview = text ? `"${text.length > 160 ? `${text.slice(0, 160)}…` : text}"` : keys.join('+');
  return prepareConfirm({
    title: `Type into ${windowLabel(target)}`,
    detail: `${text ? 'Type' : 'Press'} ${preview} in a terminal window.`,
    warnings: ['Text typed into a terminal runs as a command once Enter is pressed. Authorize only if you asked for this.'],
    payload,
  });
}

const approvalResult = (request) => ({
  success: false,
  needs_confirmation: true,
  request,
  message: `Waiting for the operator to authorize typing into "${request.title.replace(/^Type into /, '')}" on the HUD card.`,
});

// ---------------------------------------------------------------------------
// Pointer
// ---------------------------------------------------------------------------

const MOUSE_BUTTONS = { left: { x: 1, y: 0xc0 }, right: { x: 3, y: 0xc1 }, middle: { x: 2, y: 0xc2 } };

function requireCoordinates(params) {
  const x = Math.round(Number(params.x));
  const y = Math.round(Number(params.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new InputError('Screen coordinates x and y are required.');
  if (!isWindows && (x < 0 || y < 0)) throw new InputError('Screen coordinates x and y are required.');
  return { x, y };
}

const POINTER_ACTIONS = {
  async move_mouse(backend, params) {
    const { x, y } = requireCoordinates(params);
    if (backend.name === 'windows') await win('move_mouse', { x, y });
    else if (backend.name === 'xdotool') await run(backend.bin, ['mousemove', x, y]);
    else await run(backend.bin, ['mousemove', '--absolute', '-x', x, '-y', y], backend.env);
    return `Moved the pointer to ${x}, ${y}.`;
  },
  async click(backend, params) {
    const button = MOUSE_BUTTONS[params.button || 'left'];
    if (!button) throw new InputError('Button must be left, right, or middle.');
    const repeat = params.double ? 2 : 1;
    const hasTarget = params.x !== undefined && params.y !== undefined;
    if (backend.name === 'windows') {
      const at = hasTarget ? requireCoordinates(params) : {};
      await win('click', { ...at, button: params.button || 'left', double: Boolean(params.double) });
    } else {
      if (hasTarget) await POINTER_ACTIONS.move_mouse(backend, params);
      if (backend.name === 'xdotool') await run(backend.bin, ['click', '--repeat', repeat, button.x]);
      else await run(backend.bin, ['click', '--repeat', repeat, `0x${button.y.toString(16).toUpperCase()}`], backend.env);
    }
    return `${params.double ? 'Double-clicked' : 'Clicked'} the ${params.button || 'left'} button${hasTarget ? ` at ${Math.round(params.x)}, ${Math.round(params.y)}` : ''}.`;
  },
  async scroll(backend, { direction = 'down', amount = 3 }) {
    if (!['up', 'down'].includes(direction)) throw new InputError('Scroll direction must be up or down.');
    const steps = Math.min(Math.max(Math.round(Number(amount) || 3), 1), 30);
    if (backend.name === 'windows') await win('scroll', { steps: direction === 'up' ? steps : -steps });
    else if (backend.name === 'xdotool') await run(backend.bin, ['click', '--repeat', steps, direction === 'up' ? 4 : 5]);
    else await run(backend.bin, ['mousemove', '--wheel', '-x', 0, '-y', direction === 'up' ? steps : -steps], backend.env);
    return `Scrolled ${direction} ${steps} step${steps === 1 ? '' : 's'}.`;
  },
};

// ---------------------------------------------------------------------------
// Window actions
// ---------------------------------------------------------------------------

async function targetFor(params, hudTitle) {
  const query = params.window || params.app;
  if (!query) throw new InputError('Say which window (by title, app name, or id).');
  const match = pickWindow((await desktopWindows()).filter((w) => !isHudWindow(w, hudTitle)), query);
  if (!match) throw new InputError(`No open window matches "${query}".`);
  return match;
}

async function setWindowState(target, state) {
  if (isWindows) return win('show', { handle: Number(target.id), state });
  const backend = await linuxWindowBackend();
  if (backend.name === 'wmctrl') {
    if (state === 'maximize') return run(backend.bin, ['-ir', target.id, '-b', 'add,maximized_vert,maximized_horz']);
    if (state === 'restore') {
      await run(backend.bin, ['-ir', target.id, '-b', 'remove,maximized_vert,maximized_horz']);
      return run(backend.bin, ['-ia', target.id]);
    }
    const xdotool = findExecutable(['xdotool']);
    if (!xdotool) throw new InputError('Minimizing on X11 needs xdotool (sudo apt install xdotool).');
    return run(xdotool, ['windowminimize', String(parseInt(target.id, 16))]);
  }
  const method = { minimize: 'Minimize', maximize: 'Maximize' }[state];
  if (method) return gdbusWindows(method, target.id);
  await gdbusWindows('Unmaximize', target.id).catch(() => {});
  await gdbusWindows('Unminimize', target.id).catch(() => {});
  return gdbusWindows('Activate', target.id);
}

const WINDOW_ACTIONS = {
  async list_windows() {
    const windows = await desktopWindows();
    return { message: `${windows.length} open window(s).`, windows: windows.map(({ id, title, app, focused, minimized }) => ({ id, title, app, focused: Boolean(focused), ...(minimized ? { minimized: true } : {}) })) };
  },
  async active_window() {
    const front = await activeWindow({ focusInfo: true });
    if (!front) return { message: 'No window has focus (the desktop is in front).', window: null };
    return {
      message: `"${windowLabel(front)}" (${front.app}) is in front${front.focus ? `; the cursor is in a ${front.focus.control.toLowerCase()}${front.focus.editable ? ' that takes text' : ''}` : ''}.`,
      window: { id: front.id, title: front.title, app: front.app },
      ...(front.focus ? { focused_control: front.focus.control, takes_text: front.focus.editable } : {}),
    };
  },
  async focus_window(params, { hudTitle }) {
    const target = await targetFor(params, hudTitle);
    const { was_front: wasFront } = await ensureFocused(target);
    return { message: wasFront ? `"${windowLabel(target)}" was already in front.` : `Brought "${windowLabel(target)}" to the front.`, window: { id: target.id, title: target.title, app: target.app } };
  },
  async minimize_window(params, { hudTitle }) {
    const target = await targetFor(params, hudTitle);
    await setWindowState(target, 'minimize');
    return { message: `Minimized "${windowLabel(target)}".`, window: { id: target.id, title: target.title } };
  },
  async maximize_window(params, { hudTitle }) {
    const target = await targetFor(params, hudTitle);
    await setWindowState(target, 'maximize');
    rememberTarget(target);
    return { message: `Maximized "${windowLabel(target)}".`, window: { id: target.id, title: target.title } };
  },
  async restore_window(params, { hudTitle }) {
    const target = await targetFor(params, hudTitle);
    await setWindowState(target, 'restore');
    rememberTarget(target);
    return { message: `Restored "${windowLabel(target)}".`, window: { id: target.id, title: target.title } };
  },
  async close_window(params, { hudTitle }) {
    const target = await targetFor(params, hudTitle);
    if (isWindows) await win('close', { handle: Number(target.id) });
    else {
      const backend = await linuxWindowBackend();
      if (backend.name === 'wmctrl') await run(backend.bin, ['-ic', target.id]);
      else await gdbusWindows('Close', target.id);
    }
    forgetTarget(target.id);
    return { message: `Asked "${windowLabel(target)}" to close (it may ask to save first).`, window: { id: target.id, title: target.title } };
  },
};

// ---------------------------------------------------------------------------
// Tool entry point
// ---------------------------------------------------------------------------

export const INPUT_ACTION_NAMES = ['status', 'type_text', 'press_keys', ...Object.keys(POINTER_ACTIONS), ...Object.keys(WINDOW_ACTIONS)];

/**
 * Types or presses keys into the named app (focused first) or the focused window.
 */
async function keyboardAction(action, params, hudTitle, confirmed) {
  const keys = action === 'press_keys' ? parseKeys(params.keys) : null;
  if (action === 'type_text' && !params.text) throw new InputError('No text to type.');
  const backend = await keyboardBackend();
  if (!backend) {
    const session = sessionType();
    throw new InputError(`Keyboard control is not set up on this ${session} session. ${setupSteps(session, false, true).join(' Then: ')}`);
  }

  // Without window control (Linux Wayland without Window Calls) keys go wherever the focus is
  const support = await windowSupport();
  if (!support.available) {
    if (params.app) throw new InputError(`Ultron cannot see or focus windows on this session yet, so focus ${params.app} yourself and ask again without naming it. ${support.reason}`);
    if (action === 'type_text') return { message: `Typed ${(await typeIntoFocused(params.text, { backend })).chars} characters.`, backend: backend.name };
    return { message: `Pressed ${(await pressInFocused(params.keys, { backend })).join('+')}.`, backend: backend.name };
  }

  const target = await resolveTargetWindow({ app: params.app, hudTitle });
  if (!confirmed) {
    const request = terminalApproval(target, { text: params.text, keys }, { action, params: { ...params, window_id: target.id }, hudTitle });
    if (request) return approvalResult(request);
  }
  const focus = await ensureFocused(target);
  const label = windowLabel(target);
  const moved = focus.was_front ? '' : `${focus.previous ? ` ("${focus.previous}" was in front)` : ''}; brought it forward first`;
  if (action === 'type_text') {
    const typed = await typeIntoFocused(params.text, { backend });
    return {
      message: `Typed ${typed.chars} characters into "${label}"${moved}${typed.method === 'paste' ? ' (pasted; your clipboard was put back)' : ''}.`,
      backend: backend.name,
      window: { id: target.id, title: target.title, app: target.app },
      was_in_front: focus.was_front,
      ...(focus.focus ? { focused_control: focus.focus.control } : {}),
    };
  }
  await pressInFocused(params.keys, { backend });
  return { message: `Pressed ${keys.join('+')} in "${label}"${moved}.`, backend: backend.name, window: { id: target.id, title: target.title, app: target.app }, was_in_front: focus.was_front };
}

async function pointerBackend() {
  if (isWindows) return { name: 'windows' };
  return inputBackend();
}

/**
 * desktop_input: { action, ...params, hud_title?, confirmed? }. `confirm` / `cancel` finish or drop a
 * terminal typing request the operator answered on the HUD card.
 */
export async function controlDesktop(action, params = {}) {
  if (!isLinux && !isWindows) throw new InputError('Desktop input control is available on Windows and Linux.');
  const { hud_title: hudTitle, ...rest } = params;

  if (action === 'confirm') {
    const payload = takeConfirm(params.id, params.token);
    if (!payload) throw new InputError('That authorization expired or was already used.');
    const { action: held, params: heldParams } = payload;
    const windows = await desktopWindows();
    const target = windows.find((w) => w.id === heldParams.window_id);
    if (!target) throw new InputError('The terminal window has closed, so nothing was typed.');
    return keyboardAction(held, { ...heldParams, app: target.id }, payload.hudTitle, true);
  }
  if (action === 'cancel') {
    cancelConfirm(params.id);
    return { message: 'Cancelled.' };
  }

  if (action === 'status') return desktopStatus();

  if (action === 'type_text' || action === 'press_keys') return keyboardAction(action, rest, hudTitle, false);

  if (POINTER_ACTIONS[action]) {
    const backend = await pointerBackend();
    if (!backend) {
      const session = sessionType();
      const keyboard = await keyboardBackend();
      throw new InputError(`Mouse control is not set up on this ${session} session. ${setupSteps(session, false, true, Boolean(keyboard)).join(' Then: ')}`);
    }
    return { message: await POINTER_ACTIONS[action](backend, rest), backend: backend.name };
  }

  if (WINDOW_ACTIONS[action]) {
    const support = await windowSupport();
    if (!support.available) throw new InputError(`Window control is not set up on this ${sessionType()} session. ${support.reason}`);
    return { ...(await WINDOW_ACTIONS[action](rest, { hudTitle })), backend: support.backend };
  }

  throw new InputError(`Unknown desktop action "${action}". Use: ${INPUT_ACTION_NAMES.join(', ')}.`);
}

async function desktopStatus() {
  if (isWindows) {
    const status = await win('status');
    return {
      message: status.input_desktop
        ? `Desktop control ready on Windows (keyboard, mouse, and windows)${status.elevated ? '; Ultron runs as administrator, so it can type into administrator windows too' : '; windows running as administrator cannot be typed into'}.`
        : 'Desktop control is ready, but the screen is locked or a Windows security prompt is open right now.',
      session: 'windows',
      input_backend: 'windows',
      keyboard_backend: 'windows',
      window_backend: 'windows',
      elevated: status.elevated,
      screen: status.screen,
      setup_steps: [],
    };
  }
  const session = sessionType();
  const input = inputBackend();
  const keyboard = await keyboardBackend();
  const windows = await linuxWindowBackend();
  const steps = setupSteps(session, Boolean(input), Boolean(windows), Boolean(keyboard));
  return {
    message: steps.length
      ? `Desktop control is partly unavailable on this ${session} session${keyboard ? ` (typing works through ${keyboard.name})` : ''}; setup steps are listed.`
      : `Desktop control ready (${input.name} for input, ${windows.name} for windows).`,
    session,
    input_backend: input?.name || null,
    keyboard_backend: keyboard?.name || null,
    window_backend: windows?.name || null,
    setup_steps: steps,
  };
}
