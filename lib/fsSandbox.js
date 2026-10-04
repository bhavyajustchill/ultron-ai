import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Filesystem sandbox for Jarvis file tools (Phase 7.1).
 * Every path must resolve — symlinks included — inside one of the allowed root folders.
 * Override the defaults with JARVIS_FS_ROOTS (path.delimiter-separated, e.g. "~/Desktop:~/dev").
 */

const DEFAULT_ROOT_NAMES = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'dev'];
const BLOCKED_SEGMENTS = new Set(['.git']);

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

/**
 * Expands a leading "~" to the operator's home folder.
 */
export function expandHome(p) {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(/*turbopackIgnore: true*/ os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * Formats an absolute path for speech / HUD output, abbreviating the home folder to "~".
 */
export function displayPath(p) {
  const home = os.homedir();
  if (p === home) return '~';
  return p.startsWith(home + path.sep) ? `~${p.slice(home.length)}` : p;
}

/**
 * Returns the real (symlink-resolved) absolute paths of the existing allowed root folders.
 */
export function getAllowedRoots() {
  const configured = process.env.JARVIS_FS_ROOTS;
  const candidates = configured
    ? configured.split(path.delimiter).map((r) => r.trim()).filter(Boolean)
    : DEFAULT_ROOT_NAMES.map((name) => `~/${name}`);

  return candidates
    .map((r) => path.resolve(/*turbopackIgnore: true*/ expandHome(r)))
    .filter((r) => fs.existsSync(r))
    .map((r) => fs.realpathSync(r));
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

  let realBase;
  try {
    realBase = fs.realpathSync(existing);
  } catch {
    throw new SandboxError(`"${input}" passes through a broken link and cannot be accessed safely.`);
  }
  const real = path.join(realBase, ...pendingSegments);

  const roots = getAllowedRoots();
  const root = roots.find((r) => real === r || real.startsWith(r + path.sep));
  if (!root) {
    throw new SandboxError(
      `"${input}" is outside the folders Jarvis may access (${roots.map(displayPath).join(', ') || 'none configured'}).`
    );
  }

  const blocked = path
    .relative(root, real)
    .split(path.sep)
    .find((segment) => BLOCKED_SEGMENTS.has(segment));
  if (blocked) {
    throw new SandboxError(`"${input}" is inside a protected "${blocked}" folder.`);
  }

  return real;
}
