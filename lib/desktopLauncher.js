import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Shared desktop launcher for Jarvis tools: opens files, folders, URIs, and programs
 * fully detached from the Next.js request so they outlive it.
 * Set JARVIS_LAUNCH_DRY_RUN=1 to skip spawning (used by automated checks).
 */

export const isWindows = process.platform === 'win32';
export const isMac = process.platform === 'darwin';
export const isLinux = !isWindows && !isMac;

const BINARY_CACHE = new Map();

/**
 * Returns the absolute path of the first candidate executable found on PATH, or null.
 * Extra directories (e.g. SDK install locations) are searched after PATH.
 */
export function findExecutable(candidates, extraDirs = []) {
  const dirs = [...(process.env.PATH || '').split(path.delimiter), ...extraDirs].filter(Boolean);
  const extensions = isWindows ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';') : [''];

  for (const candidate of candidates) {
    const cacheKey = `${candidate}|${extraDirs.join(path.delimiter)}`;
    if (BINARY_CACHE.has(cacheKey)) {
      const cached = BINARY_CACHE.get(cacheKey);
      if (cached) return cached;
      continue;
    }

    let found = null;
    for (const dir of dirs) {
      for (const ext of extensions) {
        const full = path.join(/*turbopackIgnore: true*/ dir, candidate + ext);
        try {
          fs.accessSync(/*turbopackIgnore: true*/ full, fs.constants.X_OK);
          if (fs.statSync(/*turbopackIgnore: true*/ full).isFile()) {
            found = full;
            break;
          }
        } catch {
          // Not here — keep looking
        }
      }
      if (found) break;
    }
    BINARY_CACHE.set(cacheKey, found);
    if (found) return found;
  }
  return null;
}

/**
 * Spawns a program detached from the server process. Resolves once it has spawned
 * (or failed to), never waiting for it to exit.
 */
export function launchDetached(command, args = [], options = {}) {
  if (process.env.JARVIS_LAUNCH_DRY_RUN === '1') {
    return Promise.resolve({ success: true, dryRun: true, command: [command, ...args].join(' ') });
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        cwd: options.cwd || os.homedir(),
        env: process.env,
      });
      child.once('error', (err) => resolve({ success: false, error: err.message }));
      child.once('spawn', () => {
        child.unref();
        resolve({ success: true });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

/**
 * Opens a file, folder, or URI with the operating system's default handler.
 */
export function openWithDefaultApp(target) {
  if (isWindows) return launchDetached('explorer.exe', [target]);
  if (isMac) return launchDetached('open', [target]);
  return launchDetached('xdg-open', [target]);
}

/**
 * Opens a file or folder in Visual Studio Code (or VSCodium), falling back to the default app.
 */
export function openInCodeEditor(target) {
  const editor = findExecutable(['code', 'codium']);
  return editor ? launchDetached(editor, [target]) : openWithDefaultApp(target);
}
