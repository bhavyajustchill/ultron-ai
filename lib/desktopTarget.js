/**
 * Target windows for typing and window commands (Phase 15), shared by Windows and Linux.
 * Pure logic only: matching a spoken app name to an open window, recognising terminals and the
 * HUD's own browser window, and remembering the app Jarvis is working in ("open Notepad", then
 * "now type hello" goes to that Notepad). The platform calls live in lib/inputControl.js.
 *
 * A window here is { id, title, app, pid?, className?, minimized?, focused?, elevated? }, where `app`
 * is the process name on Windows and the WM class on Linux.
 */

const TARGET_TTL_MS = 30 * 60 * 1000;
const FILLER = /\b(the|a|an|app|application|program|window|my|current|open)\b/g;

// Spoken names whose process / window class differs from the name
const APP_ALIASES = {
  word: ['winword', 'libreoffice writer', 'libreoffice-writer', 'soffice'],
  'microsoft word': ['winword'],
  excel: ['excel', 'libreoffice calc', 'libreoffice-calc'],
  'microsoft excel': ['excel'],
  powerpoint: ['powerpnt', 'libreoffice impress', 'libreoffice-impress'],
  'power point': ['powerpnt'],
  writer: ['libreoffice-writer', 'soffice'],
  calc: ['libreoffice-calc'],
  impress: ['libreoffice-impress'],
  notepad: ['notepad', 'gnome-text-editor', 'org.gnome.texteditor', 'gedit', 'kate', 'mousepad'],
  'text editor': ['notepad', 'gnome-text-editor', 'org.gnome.texteditor', 'gedit', 'kate', 'mousepad', 'xed', 'pluma'],
  editor: ['notepad', 'gnome-text-editor', 'org.gnome.texteditor', 'gedit', 'kate', 'mousepad'],
  calculator: ['calculatorapp', 'calculator', 'gnome-calculator', 'org.gnome.calculator', 'kcalc'],
  'vs code': ['code'],
  vscode: ['code'],
  'visual studio code': ['code'],
  chrome: ['chrome', 'google-chrome'],
  'google chrome': ['chrome', 'google-chrome'],
  edge: ['msedge', 'microsoft-edge'],
  firefox: ['firefox'],
  'file explorer': ['explorer', 'nautilus', 'org.gnome.nautilus'],
  explorer: ['explorer'],
  files: ['explorer', 'nautilus', 'org.gnome.nautilus', 'dolphin', 'thunar'],
  terminal: ['windowsterminal', 'gnome-terminal-server', 'org.gnome.ptyxis', 'ptyxis', 'kgx', 'konsole'],
};

// Windows that run commands: typing plus Enter there would get around the terminal approval card
const TERMINAL_PROCESSES = new Set([
  'windowsterminal', 'cmd', 'powershell', 'pwsh', 'conhost', 'openconsole', 'mintty', 'alacritty', 'wezterm-gui',
  'wezterm', 'hyper', 'tabby', 'conemu', 'conemu64', 'putty', 'kitty', 'gnome-terminal-server', 'gnome-terminal',
  'org.gnome.terminal', 'org.gnome.ptyxis', 'ptyxis', 'kgx', 'org.gnome.console', 'konsole', 'xfce4-terminal',
  'tilix', 'xterm', 'terminator', 'foot', 'urxvt', 'lxterminal', 'mate-terminal', 'guake', 'yakuake', 'termite',
]);
const TERMINAL_CLASSES = new Set(['consolewindowclass', 'cascadia_hosting_window_class', 'mintty', 'virtualconsoleclass', 'putty']);

export const normalizeName = (text) =>
  String(text || '').toLowerCase().replace(/\.exe\b/g, '').replace(/[^a-z0-9.+-]+/g, ' ').replace(/\s+/g, ' ').trim();

const compact = (text) => normalizeName(text).replace(/[\s.-]+/g, '');

/**
 * 0-100: how well an open window matches a spoken app name, window title, or id.
 */
export function scoreWindow(win, query) {
  const raw = String(query || '').trim();
  if (!raw) return 0;
  if (String(win.id) === raw) return 100;
  const q = normalizeName(raw).replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return 0;
  const app = normalizeName(win.app);
  const title = normalizeName(win.title);
  const aliases = APP_ALIASES[q] || [];

  if (app && (app === q || compact(app) === compact(q))) return 96;
  if (app && aliases.some((alias) => compact(alias) === compact(app))) return 94;
  // Windows apps end their titles with the app name: "Untitled - Notepad", "Book1 - Excel"
  if (title === q || title.endsWith(` - ${q}`) || title.endsWith(` — ${q}`)) return 90;
  if (aliases.some((alias) => title.endsWith(` - ${alias}`))) return 85;
  if (title.split(' ').includes(q) || (q.includes(' ') && title.includes(q))) return 72;
  if (app && compact(app).includes(compact(q))) return 62;
  if (title.includes(q)) return 50;
  return 0;
}

/**
 * The best open window for a query: the remembered app first when it matches, then the window in
 * front, then the frontmost (z-order) match. Null when nothing matches well enough.
 */
export function pickWindow(windows, query, minimum = 50) {
  const scored = windows
    .map((win, index) => ({ win, index, score: scoreWindow(win, query) }))
    .filter((entry) => entry.score >= minimum);
  if (scored.length === 0) return null;
  const remembered = currentTarget();
  const best = Math.max(...scored.map((entry) => entry.score));
  const top = scored.filter((entry) => entry.score >= best - 10);
  return (
    top.find((entry) => remembered && String(entry.win.id) === String(remembered.id))?.win ||
    top.find((entry) => entry.win.focused)?.win ||
    top.sort((a, b) => b.score - a.score || a.index - b.index)[0].win
  );
}

export function isTerminalWindow(win) {
  if (!win) return false;
  const app = normalizeName(win.app).replace(/\s+/g, '');
  return TERMINAL_PROCESSES.has(app) || TERMINAL_CLASSES.has(String(win.className || '').toLowerCase());
}

/**
 * The HUD's own browser tab: its title (document.title, sent by the tool) appears in the window title.
 */
export function isHudWindow(win, hudTitle) {
  if (!win || !hudTitle) return false;
  const marker = String(hudTitle).trim().toLowerCase();
  return marker.length >= 4 && String(win.title || '').toLowerCase().includes(marker);
}

export const windowLabel = (win) => (win ? win.title || win.app || `window ${win.id}` : 'that window');

// ---------------------------------------------------------------------------------------- memory

// Route handlers are bundled separately, so the remembered app lives on globalThis
const memory = globalThis.__jarvisDesktopTarget || (globalThis.__jarvisDesktopTarget = { target: null });

/**
 * Remembers the window Jarvis just opened, focused, or typed into, so "now type..." can find it.
 */
export function rememberTarget(win, label) {
  if (!win) return;
  memory.target = { id: String(win.id), title: win.title || '', app: win.app || '', label: label || win.app || win.title || '', at: Date.now() };
}

export function currentTarget() {
  const { target } = memory;
  if (!target || Date.now() - target.at > TARGET_TTL_MS) return null;
  return target;
}

export function forgetTarget(id) {
  if (!id || (memory.target && memory.target.id === String(id))) memory.target = null;
}
