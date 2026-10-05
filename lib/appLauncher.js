import { findApps, launchDesktopApp } from '@/lib/appIndex';
import { isLinux, isWindows } from '@/lib/desktopLauncher';
import { pickWindow, rememberTarget, scoreWindow, windowLabel } from '@/lib/desktopTarget';
import { desktopWindows, ensureFocused, InputError, windowSupport } from '@/lib/inputControl';
import { findWindowsApps, launchWindowsApp } from '@/lib/winAppIndex';

/**
 * "Open Notepad" on Windows and Linux (Phase 15): finds the installed app by its everyday name,
 * starts it, waits for its window, and brings that window to the front, remembering it as the app
 * Jarvis is working in. Single-instance apps (Notepad tabs, Calculator) may hand the launch to a
 * window that was already open; that window is used then.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const WINDOW_WAIT_MS = 12000;
const REUSE_AFTER_MS = 2500;

/**
 * Resolves a spoken name to one installed app: { app } or { ambiguous, candidates } or { missing }.
 */
export async function resolveApp(query) {
  const matches = isWindows ? await findWindowsApps(query) : isLinux ? findApps(query) : [];
  if (matches.length === 0) return { missing: true };
  const [best, runnerUp] = matches;
  const confident = best.score >= 75 || !runnerUp || best.score - runnerUp.score >= 15;
  if (!confident) return { ambiguous: true, candidates: matches.map((m) => m.app.name) };
  return { app: best.app, score: best.score };
}

export async function listInstalledApps(query, limit = 10) {
  const matches = isWindows ? await findWindowsApps(query, limit) : isLinux ? findApps(query, limit) : [];
  return matches.map((m) => m.app.name);
}

// How well a window belongs to an app: by its name ("Notepad") and executable ("winword")
const appScore = (win, app) => Math.max(scoreWindow(win, app.name), app.execName ? scoreWindow(win, app.execName) : 0);

/**
 * The window that `app` opened: a new matching window, or after a moment an existing matching one
 * (single-instance apps). Null when none shows up in time.
 */
export async function waitForAppWindow(app, beforeIds, { timeout = WINDOW_WAIT_MS } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    await sleep(300);
    let windows;
    try {
      windows = await desktopWindows();
    } catch {
      return null;
    }
    const fresh = windows.filter((w) => !beforeIds.has(w.id) && appScore(w, app) >= 50);
    if (fresh.length) return fresh.sort((a, b) => appScore(b, app) - appScore(a, app))[0];
    if (Date.now() - started > REUSE_AFTER_MS) {
      const existing = windows.filter((w) => appScore(w, app) >= 72);
      if (existing.length) return existing.find((w) => w.focused) || existing[0];
    }
  }
  return null;
}

/**
 * Opens an app (optionally with files) and brings its window to the front.
 * Returns { success, app, window?, in_front, message, ambiguous?, candidates?, dry_run? }.
 */
export async function openApp(query, { files = [], focus = true } = {}) {
  const resolved = await resolveApp(query);
  if (resolved.missing) return { success: false, message: `No installed application matches "${query}".` };
  if (resolved.ambiguous) {
    return {
      success: false,
      ambiguous: true,
      candidates: resolved.candidates,
      message: `Several installed applications match "${query}": ${resolved.candidates.join(', ')}. Ask the operator which one to open.`,
    };
  }
  const { app } = resolved;
  const support = await windowSupport();
  const beforeIds = new Set();
  if (support.available) {
    try {
      for (const w of await desktopWindows()) beforeIds.add(w.id);
    } catch {
      // Window listing failed: the launch still goes ahead
    }
  }

  const launched = isWindows ? await launchWindowsApp(app, files) : await launchDesktopApp(app, files);
  if (!launched.success) return { success: false, app: app.name, message: `Failed to launch ${app.name}: ${launched.error}` };
  if (launched.dryRun) return { success: true, app: app.name, dry_run: true, command: launched.command, message: `Dry run: would open ${app.name}.` };
  if (!support.available) return { success: true, app: app.name, in_front: null, message: `Opened ${app.name}.` };

  const window = await waitForAppWindow(app, beforeIds);
  if (!window) return { success: true, app: app.name, in_front: false, message: `Started ${app.name}, but its window has not appeared yet.` };
  rememberTarget(window, app.name);
  if (!focus) return { success: true, app: app.name, window, in_front: Boolean(window.focused), message: `Opened ${app.name}.` };
  try {
    await ensureFocused(window);
    return { success: true, app: app.name, window, in_front: true, message: `Opened ${app.name} ("${windowLabel(window)}") and brought it to the front.` };
  } catch (err) {
    if (!(err instanceof InputError)) throw err;
    return { success: true, app: app.name, window, in_front: false, message: `Opened ${app.name}, but could not bring it to the front: ${err.message}` };
  }
}

/**
 * The open window of an app, if any (by the spoken name, then by the installed app's names).
 */
export async function findOpenWindow(query, { hudFilter = () => true } = {}) {
  let windows;
  try {
    windows = (await desktopWindows()).filter(hudFilter);
  } catch {
    return null;
  }
  const direct = pickWindow(windows, query, 72);
  if (direct) return direct;
  const resolved = await resolveApp(query).catch(() => ({}));
  if (!resolved.app) return null;
  const owned = windows.filter((w) => appScore(w, resolved.app) >= 72);
  return owned.find((w) => w.focused) || owned[0] || null;
}
