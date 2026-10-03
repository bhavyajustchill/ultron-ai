import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { findExecutable, isLinux } from '@/lib/desktopLauncher';

/**
 * Desktop input & window control for Jarvis (Phase 7.7).
 * Input (typing, keys, mouse): xdotool on X11, ydotool (uinput daemon) on Wayland.
 * Windows (list / focus / minimize / maximize): wmctrl + xdotool on X11; on GNOME Wayland the
 * "Window Calls" Shell extension's D-Bus API, since Wayland gives other apps no window access.
 * `status` reports what is available and the exact setup steps for what is missing.
 */

const execFileAsync = promisify(execFile);
const WINDOW_CALLS_DEST = process.env.JARVIS_WINDOW_CALLS_DEST || 'org.gnome.Shell';
const WINDOW_CALLS_PATH = '/org/gnome/Shell/Extensions/Windows';
const WINDOW_CALLS_IFACE = 'org.gnome.Shell.Extensions.Windows';

export class InputError extends Error {}

const sessionType = () =>
  (process.env.XDG_SESSION_TYPE || (process.env.WAYLAND_DISPLAY ? 'wayland' : process.env.DISPLAY ? 'x11' : 'unknown')).toLowerCase();

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

function parseKeys(combo) {
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
// Backends
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
async function windowBackend() {
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

function setupSteps(session, hasInput, hasWindows) {
  const steps = [];
  if (!hasInput) {
    steps.push(
      session === 'x11'
        ? 'Install xdotool: sudo apt install xdotool'
        : 'Install ydotool: sudo apt install ydotool',
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

// ---------------------------------------------------------------------------
// Window helpers
// ---------------------------------------------------------------------------

async function listWindows(backend) {
  if (backend.name === 'wmctrl') {
    const output = await run(backend.bin, ['-lx']);
    return output.split('\n').filter(Boolean).map((line) => {
      const [id, , wmClass, , ...title] = line.trim().split(/\s+/);
      return { id, title: title.join(' '), app: wmClass?.split('.').pop() || '' };
    });
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
      return { id: String(w.id), title, app: w.wm_class || '', focused: Boolean(w.focus) };
    })
  );
}

function pickWindow(windows, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) throw new InputError('Say which window (by title, app name, or id).');
  const match =
    windows.find((w) => w.id.toLowerCase() === q) ||
    windows.find((w) => w.title.toLowerCase() === q || w.app.toLowerCase() === q) ||
    windows.find((w) => w.title.toLowerCase().includes(q) || w.app.toLowerCase().includes(q));
  if (!match) throw new InputError(`No open window matches "${query}".`);
  return match;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const MOUSE_BUTTONS = { left: { x: 1, y: 0xc0 }, right: { x: 3, y: 0xc1 }, middle: { x: 2, y: 0xc2 } };

function requireCoordinates(params) {
  const x = Math.round(Number(params.x));
  const y = Math.round(Number(params.y));
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) throw new InputError('Screen coordinates x and y are required.');
  return { x, y };
}

const INPUT_ACTIONS = {
  async type_text(backend, { text }) {
    if (!text) throw new InputError('No text to type.');
    if (backend.name === 'xdotool') await run(backend.bin, ['type', '--delay', '12', '--', text]);
    else await run(backend.bin, ['type', '--', text], backend.env);
    return `Typed ${text.length} characters.`;
  },
  async press_keys(backend, { keys }) {
    const parsed = parseKeys(keys);
    if (backend.name === 'xdotool') {
      await run(backend.bin, ['key', '--clearmodifiers', parsed.map((k) => KEYSYMS[k] || k).join('+')]);
    } else {
      const codes = parsed.map((k) => KEY_CODES[k]);
      await run(backend.bin, ['key', ...codes.map((c) => `${c}:1`), ...codes.reverse().map((c) => `${c}:0`)], backend.env);
    }
    return `Pressed ${parsed.join('+')}.`;
  },
  async move_mouse(backend, params) {
    const { x, y } = requireCoordinates(params);
    if (backend.name === 'xdotool') await run(backend.bin, ['mousemove', x, y]);
    else await run(backend.bin, ['mousemove', '--absolute', '-x', x, '-y', y], backend.env);
    return `Moved the pointer to ${x}, ${y}.`;
  },
  async click(backend, params) {
    const button = MOUSE_BUTTONS[params.button || 'left'];
    if (!button) throw new InputError('Button must be left, right, or middle.');
    const repeat = params.double ? 2 : 1;
    const hasTarget = params.x !== undefined && params.y !== undefined;
    if (hasTarget) await INPUT_ACTIONS.move_mouse(backend, params);
    if (backend.name === 'xdotool') await run(backend.bin, ['click', '--repeat', repeat, button.x]);
    else await run(backend.bin, ['click', '--repeat', repeat, `0x${button.y.toString(16).toUpperCase()}`], backend.env);
    return `${params.double ? 'Double-clicked' : 'Clicked'} the ${params.button || 'left'} button${hasTarget ? ` at ${Math.round(params.x)}, ${Math.round(params.y)}` : ''}.`;
  },
  async scroll(backend, { direction = 'down', amount = 3 }) {
    if (!['up', 'down'].includes(direction)) throw new InputError('Scroll direction must be up or down.');
    const steps = Math.min(Math.max(Math.round(Number(amount) || 3), 1), 30);
    if (backend.name === 'xdotool') await run(backend.bin, ['click', '--repeat', steps, direction === 'up' ? 4 : 5]);
    else await run(backend.bin, ['mousemove', '--wheel', '-x', 0, '-y', direction === 'up' ? steps : -steps], backend.env);
    return `Scrolled ${direction} ${steps} step${steps === 1 ? '' : 's'}.`;
  },
};

const WINDOW_ACTIONS = {
  async list_windows(backend) {
    const windows = await listWindows(backend);
    return { message: `${windows.length} open window(s).`, windows };
  },
  async focus_window(backend, { window }) {
    const target = pickWindow(await listWindows(backend), window);
    if (backend.name === 'wmctrl') await run(backend.bin, ['-ia', target.id]);
    else await gdbusWindows('Activate', target.id);
    return { message: `Focused "${target.title || target.app}".`, window: target };
  },
  async minimize_window(backend, { window }) {
    const target = pickWindow(await listWindows(backend), window);
    if (backend.name === 'wmctrl') {
      const xdotool = findExecutable(['xdotool']);
      if (!xdotool) throw new InputError('Minimizing on X11 needs xdotool (sudo apt install xdotool).');
      await run(xdotool, ['windowminimize', target.id]);
    } else {
      await gdbusWindows('Minimize', target.id);
    }
    return { message: `Minimized "${target.title || target.app}".`, window: target };
  },
  async maximize_window(backend, { window }) {
    const target = pickWindow(await listWindows(backend), window);
    if (backend.name === 'wmctrl') await run(backend.bin, ['-ir', target.id, '-b', 'add,maximized_vert,maximized_horz']);
    else await gdbusWindows('Maximize', target.id);
    return { message: `Maximized "${target.title || target.app}".`, window: target };
  },
};

export const INPUT_ACTION_NAMES = ['status', ...Object.keys(INPUT_ACTIONS), ...Object.keys(WINDOW_ACTIONS)];

export async function controlDesktop(action, params = {}) {
  if (!isLinux) throw new InputError('Desktop input control is currently implemented for Linux desktops only.');
  const session = sessionType();

  if (action === 'status') {
    const input = inputBackend();
    const windows = await windowBackend();
    const steps = setupSteps(session, Boolean(input), Boolean(windows));
    return {
      message: steps.length
        ? `Desktop control is partly unavailable on this ${session} session; setup steps are listed.`
        : `Desktop control ready (${input.name} for input, ${windows.name} for windows).`,
      session,
      input_backend: input?.name || null,
      window_backend: windows?.name || null,
      setup_steps: steps,
    };
  }

  if (INPUT_ACTIONS[action]) {
    const backend = inputBackend();
    if (!backend) {
      throw new InputError(`Keyboard and mouse control is not set up on this ${session} session. ${setupSteps(session, false, true).join(' Then: ')}`);
    }
    return { message: await INPUT_ACTIONS[action](backend, params), backend: backend.name };
  }

  if (WINDOW_ACTIONS[action]) {
    const backend = await windowBackend();
    if (!backend) throw new InputError(`Window control is not set up on this ${session} session. ${setupSteps(session, true, false).join(' ')}`);
    return { ...(await WINDOW_ACTIONS[action](backend, params)), backend: backend.name };
  }

  throw new InputError(`Unknown desktop action "${action}". Use: ${INPUT_ACTION_NAMES.join(', ')}.`);
}
