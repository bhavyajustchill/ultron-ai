import fs from 'fs';
import os from 'os';
import path from 'path';
import { findExecutable, launchDetached } from '@/lib/desktopLauncher';

/**
 * Installed-application index for Linux desktops (Phase 7.3).
 * Parses freedesktop `.desktop` entries from the XDG data directories (system, user,
 * Flatpak, Snap), honours NoDisplay / Hidden / OnlyShowIn / NotShowIn / TryExec, and
 * fuzzy-matches spoken app names so Jarvis can launch anything that is installed.
 */

const CACHE_TTL_MS = 60 * 1000;
const FILLER_WORDS = /\b(the|app|application|program|open|launch|start|please)\b/g;
let cache = { builtAt: 0, apps: [] };

function applicationDirs() {
  const home = os.homedir();
  const dataHome = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  const dataDirs = (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':').filter(Boolean);
  // Earlier directories win when the same desktop ID appears twice (user overrides system)
  return [
    ...new Set(
      [
        dataHome,
        path.join(home, '.local', 'share', 'flatpak', 'exports', 'share'),
        ...dataDirs,
        '/var/lib/flatpak/exports/share',
        '/var/lib/snapd/desktop',
      ].map((dir) => path.join(/*turbopackIgnore: true*/ dir, 'applications'))
    ),
  ];
}

function walkDesktopFiles(dir, prefix = '') {
  let entries;
  try {
    entries = fs.readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(/*turbopackIgnore: true*/ dir, entry.name);
    if (entry.isDirectory()) return walkDesktopFiles(full, `${prefix}${entry.name}-`);
    return entry.name.endsWith('.desktop') ? [{ file: full, id: `${prefix}${entry.name.slice(0, -8)}` }] : [];
  });
}

/**
 * Reads the [Desktop Entry] group of a .desktop file into a key/value object.
 */
function parseDesktopEntry(file) {
  const entry = {};
  let inMainGroup = false;
  for (const raw of fs.readFileSync(/*turbopackIgnore: true*/ file, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inMainGroup = line === '[Desktop Entry]';
      continue;
    }
    if (!inMainGroup || !line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq > 0) {
      const key = line.slice(0, eq).trim();
      if (!(key in entry)) entry[key] = line.slice(eq + 1).trim();
    }
  }
  return entry;
}

function splitList(value) {
  return (value || '').split(';').map((v) => v.trim()).filter(Boolean);
}

function isVisible(entry, currentDesktops) {
  if (entry.Type !== 'Application' || entry.NoDisplay === 'true' || entry.Hidden === 'true') return false;
  const onlyShowIn = splitList(entry.OnlyShowIn).map((d) => d.toLowerCase());
  if (onlyShowIn.length && !onlyShowIn.some((d) => currentDesktops.includes(d))) return false;
  const notShowIn = splitList(entry.NotShowIn).map((d) => d.toLowerCase());
  if (notShowIn.some((d) => currentDesktops.includes(d))) return false;
  if (entry.TryExec) {
    const tryExec = entry.TryExec;
    const found = path.isAbsolute(tryExec) ? fs.existsSync(/*turbopackIgnore: true*/ tryExec) : findExecutable([tryExec]);
    if (!found) return false;
  }
  return Boolean(entry.Name);
}

/**
 * Returns the cached list of launchable applications, rebuilding it at most once a minute.
 */
export function getInstalledApps() {
  if (Date.now() - cache.builtAt < CACHE_TTL_MS && cache.apps.length) return cache.apps;

  const currentDesktops = (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase().split(':').filter(Boolean);
  const byId = new Map();
  for (const dir of applicationDirs()) {
    for (const { file, id } of walkDesktopFiles(dir)) {
      if (byId.has(id)) continue;
      try {
        const entry = parseDesktopEntry(file);
        byId.set(id, isVisible(entry, currentDesktops) ? { entry, file, id } : null);
      } catch {
        byId.set(id, null);
      }
    }
  }

  const apps = [...byId.values()].filter(Boolean).map(({ entry, file, id }) => {
    const execToken = (entry.Exec || '').split(/\s+/).find((token) => token && !token.includes('=')) || '';
    return {
      id,
      file,
      name: entry.Name,
      genericName: entry.GenericName || '',
      comment: entry.Comment || '',
      keywords: splitList(entry.Keywords),
      execName: path.basename(execToken.replace(/^"|"$/g, '')),
    };
  });

  cache = { builtAt: Date.now(), apps };
  return apps;
}

const normalize = (text) => (text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Scores installed apps against a spoken name; returns best matches first.
 */
export function findApps(query, limit = 5) {
  const q = normalize(query).replace(FILLER_WORDS, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return [];
  const compact = q.replace(/ /g, '');
  const qWords = q.split(' ');

  return getInstalledApps()
    .map((app) => {
      const name = normalize(app.name);
      const nameWords = name.split(' ');
      const id = normalize(app.id);
      let score = 0;
      if (name === q) score = 100;
      else if (name.replace(/ /g, '') === compact) score = 95;
      else if (name.startsWith(q)) score = 85;
      else if (nameWords.includes(q)) score = 75;
      else if (qWords.every((w) => name.includes(w))) score = 65;
      else if (normalize(app.execName).replace(/ /g, '') === compact) score = 60;
      else if (id.split(' ').includes(q) || id.replace(/ /g, '').includes(compact)) score = 55;
      else if (normalize(app.genericName).includes(q)) score = 45;
      else if (app.keywords.some((k) => normalize(k) === q)) score = 40;
      return { app, score };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.app.name.length - b.app.name.length)
    .slice(0, limit);
}

/**
 * Launches a desktop entry through GLib (gio launch), falling back to gtk-launch.
 */
export function launchDesktopApp(app) {
  const gio = findExecutable(['gio']);
  if (gio) return launchDetached(gio, ['launch', app.file]);
  const gtkLaunch = findExecutable(['gtk-launch']);
  if (gtkLaunch) return launchDetached(gtkLaunch, [app.id]);
  return Promise.resolve({ success: false, error: 'Neither gio nor gtk-launch is available to start desktop applications.' });
}

/**
 * Resolves a spoken name to one app and launches it, or returns candidates when ambiguous.
 */
export async function launchAppByName(query) {
  const matches = findApps(query);
  if (matches.length === 0) {
    return { success: false, message: `No installed application matches "${query}".` };
  }

  const [best, runnerUp] = matches;
  const confident = best.score >= 75 || !runnerUp || best.score - runnerUp.score >= 15;
  if (!confident) {
    return {
      success: false,
      ambiguous: true,
      message: `Several installed applications match "${query}": ${matches.map((m) => m.app.name).join(', ')}. Ask the operator which one to open.`,
      candidates: matches.map((m) => m.app.name),
    };
  }

  const result = await launchDesktopApp(best.app);
  return {
    success: result.success,
    message: result.success ? `Launched ${best.app.name}.` : `Failed to launch ${best.app.name}: ${result.error}`,
    appName: best.app.name,
    ...(result.dryRun ? { dry_run: true } : {}),
  };
}
