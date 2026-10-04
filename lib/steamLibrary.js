import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Steam library reader (Phase 8.8): finds the Steam install, reads every library folder from
 * libraryfolders.vdf, and each game's appmanifest_*.acf (name, size, install / update state).
 * Launch, install, and update requests go through Steam's own steam:// links.
 *
 * Test override: JARVIS_STEAM_ROOT.
 */

// AppState StateFlags bits (Steam client)
const STATE_UPDATE_REQUIRED = 2;
const STATE_FULLY_INSTALLED = 4;
const STATE_UPDATE_RUNNING = 256;
const STATE_DOWNLOADING = 1024;

export function findSteamRoot() {
  if (process.env.JARVIS_STEAM_ROOT) return fs.existsSync(process.env.JARVIS_STEAM_ROOT) ? process.env.JARVIS_STEAM_ROOT : null;
  const home = os.homedir();
  const candidates =
    process.platform === 'win32'
      ? [path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Steam'), path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Steam')]
      : process.platform === 'darwin'
        ? [path.join(home, 'Library', 'Application Support', 'Steam')]
        : [
            path.join(home, '.local', 'share', 'Steam'),
            path.join(home, '.steam', 'steam'),
            path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
            path.join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam'),
          ];
  return candidates.find((dir) => fs.existsSync(path.join(/*turbopackIgnore: true*/ dir, 'steamapps'))) || null;
}

const vdfValue = (text, key) => text.match(new RegExp(`"${key}"\\s+"([^"]*)"`, 'i'))?.[1];

/**
 * Every steamapps folder: the install's own plus extra libraries from libraryfolders.vdf.
 */
export function steamLibraries(root) {
  const folders = new Set([path.join(/*turbopackIgnore: true*/ root, 'steamapps')]);
  try {
    const vdf = fs.readFileSync(/*turbopackIgnore: true*/ path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf-8');
    for (const [, raw] of vdf.matchAll(/"path"\s+"([^"]+)"/g)) {
      folders.add(path.join(/*turbopackIgnore: true*/ raw.replace(/\\\\/g, '\\'), 'steamapps'));
    }
  } catch {
    // No extra libraries
  }
  return [...folders].filter((dir) => fs.existsSync(dir));
}

/**
 * Installed games: [{ appid, name, sizeGb, needsUpdate, updating, installed, lastUpdated }].
 */
export function listSteamGames(root) {
  const games = [];
  for (const library of steamLibraries(root)) {
    for (const file of fs.readdirSync(/*turbopackIgnore: true*/ library).filter((f) => /^appmanifest_\d+\.acf$/.test(f))) {
      try {
        const acf = fs.readFileSync(/*turbopackIgnore: true*/ path.join(library, file), 'utf-8');
        const flags = Number(vdfValue(acf, 'StateFlags') || 0);
        const appid = vdfValue(acf, 'appid');
        const downloadingDir = path.join(/*turbopackIgnore: true*/ library, 'downloading', String(appid));
        const downloading = fs.existsSync(downloadingDir) && fs.readdirSync(/*turbopackIgnore: true*/ downloadingDir).length > 0;
        games.push({
          appid,
          name: vdfValue(acf, 'name') || `App ${appid}`,
          sizeGb: Math.round((Number(vdfValue(acf, 'SizeOnDisk') || 0) / 1e9) * 10) / 10,
          installed: Boolean(flags & STATE_FULLY_INSTALLED),
          needsUpdate: Boolean(flags & STATE_UPDATE_REQUIRED),
          updating: Boolean(flags & (STATE_UPDATE_RUNNING | STATE_DOWNLOADING)) || downloading,
          lastUpdated: Number(vdfValue(acf, 'LastUpdated') || 0) ? new Date(Number(vdfValue(acf, 'LastUpdated')) * 1000).toISOString() : null,
        });
      } catch {
        // Unreadable manifest: skip it
      }
    }
  }
  return games.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Best installed game for a spoken name (exact, then all words present, shortest name wins).
 */
export function findGame(games, name) {
  const wanted = String(name || '').toLowerCase().trim();
  if (!wanted) return null;
  const exact = games.find((g) => g.name.toLowerCase() === wanted);
  if (exact) return exact;
  const words = wanted.split(/[^a-z0-9]+/).filter(Boolean);
  return games.filter((g) => words.every((w) => g.name.toLowerCase().includes(w))).sort((a, b) => a.name.length - b.name.length)[0] || null;
}

/**
 * Store search (keyless public API): [{ appid, name, price }].
 */
export async function searchSteamStore(term) {
  const base = process.env.JARVIS_STEAM_STORE_API || 'https://store.steampowered.com/api/storesearch/';
  const res = await fetch(`${base}?term=${encodeURIComponent(term)}&cc=US&l=english`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Steam store search answered HTTP ${res.status}`);
  const data = await res.json();
  return (data.items || [])
    .filter((item) => item.type === 'app')
    .map((item) => ({
      appid: String(item.id),
      name: item.name,
      price: item.price ? `${(item.price.final / 100).toFixed(2)} ${item.price.currency}` : 'free or unlisted',
    }));
}

// Shutdown-when-done watch (authorised on the HUD): shared across route bundles
const watchState = globalThis.__jarvisSteamWatch || (globalThis.__jarvisSteamWatch = { timer: null, idlePolls: 0, startedAt: 0 });
const WATCH_POLL_MS = Number(process.env.JARVIS_STEAM_POLL_MS ?? 30 * 1000);
const WATCH_MAX_MS = 12 * 60 * 60 * 1000;

/**
 * Polls Steam until nothing has been downloading for two polls in a row, then calls onIdle()
 * (which schedules the shutdown). Gives up after 12 hours.
 */
export function startDownloadWatch(onIdle) {
  stopDownloadWatch();
  watchState.startedAt = Date.now();
  watchState.idlePolls = 0;
  watchState.timer = setInterval(() => {
    const root = findSteamRoot();
    const busy = root ? listSteamGames(root).some((g) => g.updating) : false;
    watchState.idlePolls = busy ? 0 : watchState.idlePolls + 1;
    if (watchState.idlePolls >= 2) {
      stopDownloadWatch();
      onIdle();
    } else if (Date.now() - watchState.startedAt > WATCH_MAX_MS) {
      stopDownloadWatch();
    }
  }, WATCH_POLL_MS);
}

export function stopDownloadWatch() {
  if (!watchState.timer) return false;
  clearInterval(watchState.timer);
  watchState.timer = null;
  return true;
}

export const isDownloadWatchActive = () => Boolean(watchState.timer);
