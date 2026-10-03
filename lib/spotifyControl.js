import { execFile } from 'child_process';
import { promisify } from 'util';
import { findExecutable, isLinux, openWithDefaultApp } from '@/lib/desktopLauncher';
import { launchAppByName } from '@/lib/appIndex';

/**
 * Spotify control for the HUD media deck (Phase 7.5) over the desktop app's MPRIS D-Bus
 * interface — works with free accounts, no Premium or Web API playback scope needed.
 * "Play <song>" resolves a track via the Spotify Web API search when SPOTIFY_CLIENT_ID /
 * SPOTIFY_CLIENT_SECRET are set (client credentials, free); otherwise it opens the search in the app.
 */

const execFileAsync = promisify(execFile);
const BUS_NAME = process.env.JARVIS_SPOTIFY_BUS || 'org.mpris.MediaPlayer2.spotify';
const OBJECT_PATH = '/org/mpris/MediaPlayer2';
const PLAYER = 'org.mpris.MediaPlayer2.Player';
const API_BASE = process.env.JARVIS_SPOTIFY_API_BASE || 'https://api.spotify.com';
const ACCOUNTS_BASE = process.env.JARVIS_SPOTIFY_ACCOUNTS_BASE || 'https://accounts.spotify.com';

export class SpotifyError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let cachedToken = { value: null, expiresAt: 0 };

async function gdbus(args) {
  const bin = findExecutable(['gdbus']);
  if (!bin) throw new SpotifyError('gdbus (GLib) is required to control Spotify over MPRIS.');
  const { stdout } = await execFileAsync(bin, ['call', '--session', ...args], { timeout: 5000 });
  return stdout.trim();
}

const playerCall = (method, ...args) =>
  gdbus(['--dest', BUS_NAME, '--object-path', OBJECT_PATH, '--method', `${PLAYER}.${method}`, ...args]);

const getProperty = (name) =>
  gdbus(['--dest', BUS_NAME, '--object-path', OBJECT_PATH, '--method', 'org.freedesktop.DBus.Properties.Get', PLAYER, name]);

export async function isSpotifyRunning() {
  const out = await gdbus([
    '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus',
    '--method', 'org.freedesktop.DBus.NameHasOwner', `'${BUS_NAME}'`,
  ]);
  return out.includes('true');
}

// GVariant text quotes strings with ' or " (whichever the content needs) and backslash-escapes
const unescape = (text) => text.replace(/\\(.)/g, '$1');
function variantString(text, key) {
  const match = text.match(new RegExp(`'${key}': <(['"])((?:\\\\.|(?!\\1).)*)\\1>`));
  return match ? unescape(match[2]) : null;
}
function variantStringList(text, key) {
  const match = text.match(new RegExp(`'${key}': <\\[(.*?)\\]>`));
  if (!match) return [];
  return [...match[1].matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)].map((m) => unescape(m[2]));
}

export async function nowPlaying() {
  const metadata = await getProperty('Metadata');
  const status = (await getProperty('PlaybackStatus')).match(/'(\w+)'/)?.[1] || 'Unknown';
  return {
    status,
    title: variantString(metadata, 'xesam:title'),
    artists: variantStringList(metadata, 'xesam:artist'),
    album: variantString(metadata, 'xesam:album'),
  };
}

const describe = (track) =>
  track.title ? `${track.title}${track.artists.length ? ` by ${track.artists.join(', ')}` : ''}` : 'an unknown track';

async function ensureRunning() {
  if (await isSpotifyRunning()) return;
  const launched = await launchAppByName('Spotify');
  if (!launched.success) await openWithDefaultApp('spotify:');
  for (let i = 0; i < 20; i++) {
    await sleep(750);
    if (await isSpotifyRunning()) {
      await sleep(1500); // let the player finish initialising before commands
      return;
    }
  }
  throw new SpotifyError('Spotify did not start. Make sure the Spotify desktop app is installed.');
}

async function requireRunning() {
  if (!(await isSpotifyRunning())) throw new SpotifyError('Spotify is not running.');
}

async function webApiToken() {
  if (cachedToken.value && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  const credentials = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new SpotifyError(`Spotify authentication failed (${res.status}).`);
  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return cachedToken.value;
}

async function findTrack(query) {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) return null;
  const token = await webApiToken();
  const params = new URLSearchParams({ q: query, type: 'track', limit: '1' });
  const res = await fetch(`${API_BASE}/v1/search?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new SpotifyError(`Spotify search failed (${res.status}).`);
  const track = (await res.json()).tracks?.items?.[0];
  return track ? { uri: track.uri, title: track.name, artists: track.artists.map((a) => a.name) } : null;
}

// Characters encodeURIComponent leaves alone but which would break GVariant quoting
const encodeForUri = (text) =>
  encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

async function openUri(uri) {
  if (!/^spotify:[a-z]+:[A-Za-z0-9%._~:-]+$/.test(uri)) throw new SpotifyError('Refusing to open an unexpected Spotify URI.');
  await playerCall('OpenUri', `'${uri}'`);
}

const ACTIONS = {
  async play() {
    await ensureRunning();
    await playerCall('Play');
    return { message: 'Spotify playback resumed.' };
  },
  async pause() {
    await requireRunning();
    await playerCall('Pause');
    return { message: 'Spotify paused.' };
  },
  async toggle() {
    await ensureRunning();
    await playerCall('PlayPause');
    return { message: 'Toggled Spotify playback.' };
  },
  async next() {
    await requireRunning();
    await playerCall('Next');
    await sleep(600);
    const track = await nowPlaying();
    return { message: `Skipped to ${describe(track)}.`, now_playing: track };
  },
  async previous() {
    await requireRunning();
    await playerCall('Previous');
    await sleep(600);
    const track = await nowPlaying();
    return { message: `Went back to ${describe(track)}.`, now_playing: track };
  },
  async now_playing() {
    if (!(await isSpotifyRunning())) return { message: 'Spotify is not running.', now_playing: null };
    const track = await nowPlaying();
    return { message: `Spotify is ${track.status.toLowerCase()}: ${describe(track)}.`, now_playing: track };
  },
  async play_song({ query }) {
    if (!query) throw new SpotifyError('Say which song, artist, or album to play.');
    await ensureRunning();
    const track = await findTrack(query);
    if (track) {
      await openUri(track.uri);
      return { message: `Playing ${describe(track)} on Spotify.`, now_playing: track };
    }
    await openUri(`spotify:search:${encodeForUri(query)}`);
    return {
      message: `Opened Spotify search results for "${query}". Direct playback of a specific track needs SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET (free Spotify developer app) in the server environment.`,
      needs_selection: true,
    };
  },
};

export const SPOTIFY_ACTIONS = Object.keys(ACTIONS);

export async function controlSpotify(action, params = {}) {
  if (!isLinux) throw new SpotifyError('Spotify control currently uses Linux MPRIS and is unavailable on this platform.');
  const handler = ACTIONS[action];
  if (!handler) throw new SpotifyError(`Unknown Spotify action "${action}". Use: ${SPOTIFY_ACTIONS.join(', ')}.`);
  return handler(params);
}
