import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Filesystem sandbox for Jarvis file tools (Phase 7.1; Windows folders in Phase 15).
 * Every path must resolve — symlinks included — inside one of the allowed root folders.
 * Override the defaults with JARVIS_FS_ROOTS (separated by ";" on Windows, ":" elsewhere, e.g.
 * "~/Desktop;F:\Projects" or "~/Desktop:~/dev").
 * Windows: Desktop, Documents, and the other user folders are read from the registry, so folders
 * moved to OneDrive (or another drive) are found, and "~/Documents/..." means the real Documents
 * folder. Paths compare case-insensitively there, and names Windows cannot create are refused.
 */

const DEFAULT_ROOT_NAMES = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'dev'];
const BLOCKED_SEGMENTS = new Set(['.git']);
const isWindows = process.platform === 'win32';

// User Shell Folders value names for the default roots (Downloads only has a GUID name)
const WINDOWS_SHELL_FOLDERS = {
  Desktop: 'Desktop',
  Documents: 'Personal',
  Downloads: '{374DE290-123F-4565-9164-39C4925E467B}',
  Pictures: 'My Pictures',
  Music: 'My Music',
  Videos: 'My Video',
};
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
const WINDOWS_INVALID_CHARS = /[<>:"|?*\u0000-\u001f]/;

export class SandboxError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SandboxError';
  }
}

function pathExists(p) {
  try {
    fs.lstatSync(p); // lstat so dangling symlinks still count as existing (and get rejected below)
    return true;
  } catch {
    return false;
  }
}

let windowsFolders = null;
/**
 * Windows: { Desktop: 'C:\\Users\\me\\OneDrive\\Desktop', ... } from the registry (read once).
 */
function windowsKnownFolders() {
  if (windowsFolders) return windowsFolders;
  windowsFolders = {};
  if (!isWindows) return windowsFolders;
  let output = '';
  try {
    output = execFileSync('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'], {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    });
  } catch {
    return windowsFolders;
  }
  for (const [name, valueName] of Object.entries(WINDOWS_SHELL_FOLDERS)) {
    const line = output.split(/\r?\n/).find((row) => row.trim().toLowerCase().startsWith(`${valueName.toLowerCase()} `));
    const raw = line?.split(/\s+REG_(?:EXPAND_)?SZ\s+/)[1]?.trim();
    if (!raw) continue;
    const expanded = raw.replace(/%([^%]+)%/g, (whole, variable) => process.env[variable] ?? whole);
    if (!expanded.includes('%')) windowsFolders[name] = expanded;
  }
  return windowsFolders;
}

/**
 * Expands a leading "~" to the operator's home folder (on Windows, "~/Documents" and the other
 * user folders go to where Windows really keeps them).
 */
export function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    const rest = p.slice(2);
    if (isWindows) {
      const [first, ...remaining] = rest.split(/[\\/]+/);
      const known = Object.entries(windowsKnownFolders()).find(([name]) => name.toLowerCase() === (first || '').toLowerCase());
      if (known) return path.join(/*turbopackIgnore: true*/ known[1], ...remaining);
    }
    return path.join(/*turbopackIgnore: true*/ os.homedir(), rest);
  }
  return p;
}

/**
 * Formats an absolute path for speech / HUD output, abbreviating the home folder to "~".
 */
export function displayPath(p) {
  const home = os.homedir();
  if (samePath(p, home)) return '~';
  return startsWithPath(p, home + path.sep) ? `~${p.slice(home.length)}` : p;
}

// Windows paths are case-insensitive
const fold = (p) => (isWindows ? p.toLowerCase() : p);
const samePath = (a, b) => fold(a) === fold(b);
const startsWithPath = (p, prefix) => fold(p).startsWith(fold(prefix));

/**
 * Returns the real (symlink-resolved) absolute paths of the existing allowed root folders.
 */
export function getAllowedRoots() {
  const configured = process.env.JARVIS_FS_ROOTS;
  const candidates = configured
    ? configured.split(path.delimiter).map((r) => r.trim()).filter(Boolean)
    : DEFAULT_ROOT_NAMES.map((name) => `~/${name}`);

  const roots = candidates
    .map((r) => path.resolve(/*turbopackIgnore: true*/ expandHome(r)))
    .filter((r) => fs.existsSync(r))
    .map((r) => fs.realpathSync(r));
  return [...new Map(roots.map((r) => [fold(r), r])).values()];
}

// Names Windows cannot create (CON, NUL, "report.", "a:b") would fail later with an unclear error
function checkWindowsName(segment, input) {
  if (WINDOWS_RESERVED.test(segment) || /[. ]$/.test(segment) || WINDOWS_INVALID_CHARS.test(segment)) {
    throw new SandboxError(`"${input}" contains "${segment}", which is not a valid file or folder name on Windows.`);
  }
}

/**
 * Resolves operator/model supplied input to a real absolute path inside the sandbox.
 * Relative paths are anchored at the home folder. Throws SandboxError when the path escapes
 * the allowed roots, passes through a blocked folder (.git), or crosses a broken symlink.
 */
export function resolveSafePath(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new SandboxError('A target path is required.');
  }

  const absolute = path.resolve(/*turbopackIgnore: true*/ os.homedir(), expandHome(input.trim()));

  // Resolve symlinks on the deepest existing ancestor so links cannot escape the sandbox
  let existing = absolute;
  const pendingSegments = [];
  while (!pathExists(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    pendingSegments.unshift(path.basename(existing));
    existing = parent;
  }
  if (isWindows) for (const segment of pendingSegments) checkWindowsName(segment, input);

  let realBase;
  try {
    realBase = fs.realpathSync(existing);
  } catch {
    throw new SandboxError(`"${input}" passes through a broken link and cannot be accessed safely.`);
  }
  const real = path.join(realBase, ...pendingSegments);

  const roots = getAllowedRoots();
  const root = roots.find((r) => samePath(real, r) || startsWithPath(real, r + path.sep));
  if (!root) {
    throw new SandboxError(
      `"${input}" is outside the folders Ultron may access (${roots.map(displayPath).join(', ') || 'none configured'}).`
    );
  }

  const blocked = path
    .relative(root, real)
    .split(path.sep)
    .find((segment) => BLOCKED_SEGMENTS.has(fold(segment)));
  if (blocked) {
    throw new SandboxError(`"${input}" is inside a protected "${blocked}" folder.`);
  }

  return real;
}
