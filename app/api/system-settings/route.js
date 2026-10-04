import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  SettingsError,
  getDarkMode,
  setDarkMode,
  getWifi,
  setWifi,
  getBrightness,
  setBrightness,
  getWallpaper,
  setWallpaper,
  downloadWallpaper,
  isWallpaperFile,
  findProcesses,
  terminateProcesses,
  POWER_ACTIONS,
  POWER_DELAY_SECONDS,
  schedulePower,
  cancelPower,
  powerStatus,
} from '@/lib/systemSettings';
import { prepareConfirm, takeConfirm, cancelConfirm } from '@/lib/confirmGate';
import { pushUndo } from '@/lib/undoJournal';
import { getAutostart, enableAutostart, disableAutostart } from '@/lib/autostart';
import { startDownloadWatch, stopDownloadWatch, isDownloadWatchActive } from '@/lib/steamLibrary';
import { resolveSafePath, displayPath, SandboxError } from '@/lib/fsSandbox';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: POST /api/system-settings (Phase 8.3)
 * Dark mode, WiFi, brightness, wallpaper, processes, and power for the `system_settings` tool.
 * Reversible changes are recorded for undo. Irreversible ones (power, WiFi off, ending processes)
 * return `needs_confirmation` with a card request and run only through action "confirm" carrying
 * the one-time token that the HUD's AUTHORIZE click releases.
 */

const BRIGHTNESS_STEP = 10;
const MAX_PROCESSES_LISTED = 15;
const MAX_PROCESSES_ENDED = 8;

class RequestError extends Error {}

const wantsOn = (value, current) => {
  const v = String(value || 'toggle').toLowerCase();
  if (['on', 'true', 'enable', 'enabled', 'dark'].includes(v)) return true;
  if (['off', 'false', 'disable', 'disabled', 'light'].includes(v)) return false;
  if (v === 'toggle') return !current;
  throw new RequestError(`Use "on", "off", or "toggle" (got "${value}").`);
};

async function settled(fn) {
  try {
    return await fn();
  } catch (err) {
    return { unavailable: err.message };
  }
}

const ACTIONS = {
  async status() {
    const [darkMode, wifi, brightness, wallpaper] = await Promise.all([
      settled(getDarkMode),
      settled(getWifi),
      settled(getBrightness),
      settled(getWallpaper),
    ]);
    return {
      message: 'Current system settings.',
      dark_mode: darkMode.unavailable ? darkMode : darkMode.dark,
      wifi: wifi.unavailable ? wifi : wifi.enabled,
      brightness_percent: brightness.unavailable ? brightness : brightness.percent,
      wallpaper: wallpaper.unavailable ? wallpaper : wallpaper.uri || wallpaper.path,
      power: { ...powerStatus(), steam_download_watch: isDownloadWatchActive() },
    };
  },

  async dark_mode({ value }) {
    const current = await getDarkMode();
    const dark = wantsOn(value, current.dark);
    if (dark === current.dark) return { message: `Dark mode is already ${dark ? 'on' : 'off'}.` };
    const before = await setDarkMode(dark);
    pushUndo(`turned dark mode ${dark ? 'on' : 'off'}`, 'dark_mode', before);
    return { message: `Dark mode turned ${dark ? 'on' : 'off'}.` };
  },

  async wifi({ value }) {
    const { enabled } = await getWifi();
    const on = wantsOn(value, enabled);
    if (on === enabled) return { message: `WiFi is already ${on ? 'on' : 'off'}.` };
    if (on) {
      await setWifi(true);
      return { message: 'WiFi turned on.' };
    }
    // Turning WiFi off also cuts Jarvis's own voice link, so the operator confirms on screen
    return {
      request: prepareConfirm({
        title: 'Turn WiFi off',
        detail: 'Disconnects this computer from wireless networks.',
        warnings: ['Jarvis\'s voice link uses the internet: without another connection he cannot hear you until WiFi is turned back on from the desktop.'],
        payload: { action: 'wifi_off' },
      }),
    };
  },

  async brightness({ value }) {
    const { percent: current } = await getBrightness();
    const v = String(value ?? '').toLowerCase().replace('%', '').trim();
    const target = v === 'up' ? current + BRIGHTNESS_STEP : v === 'down' ? current - BRIGHTNESS_STEP : Number(v);
    if (!Number.isFinite(target)) throw new RequestError('Give a brightness percentage (1-100), "up", or "down".');
    const before = await setBrightness(target);
    const { percent } = await getBrightness();
    pushUndo(`set brightness to ${percent} percent`, 'brightness', before);
    return { message: `Brightness set to ${percent} percent.`, brightness_percent: percent };
  },

  async wallpaper({ body }) {
    let file;
    if (body.url) {
      file = await downloadWallpaper(body.url);
    } else if (body.path) {
      file = resolveSafePath(body.path);
      if (!isWallpaperFile(file)) throw new RequestError(`${displayPath(file)} is not an image file.`);
      if (!fs.existsSync(file)) throw new RequestError(`${displayPath(file)} does not exist.`);
    } else {
      throw new RequestError('Give an image "path" or "url" for the wallpaper.');
    }
    const before = await setWallpaper(file);
    pushUndo(`changed the wallpaper to ${path.basename(file)}`, 'wallpaper', before);
    return { message: `Wallpaper set to ${displayPath(file)}.`, wallpaper: displayPath(file) };
  },

  async list_processes({ body }) {
    const query = body.query || body.value;
    if (!query) throw new RequestError('Give a program name to look for (e.g. "firefox").');
    const matches = await findProcesses(query);
    return {
      message: matches.length ? `${matches.length} process(es) match "${query}".` : `No running program of yours matches "${query}".`,
      processes: matches.slice(0, MAX_PROCESSES_LISTED).map(({ pid, name, command }) => ({ pid, name, command })),
    };
  },

  async terminate_process({ body }) {
    const query = body.query || body.value;
    if (!query) throw new RequestError('Give the program name or process ID to end.');
    const matches = await findProcesses(query);
    if (!matches.length) return { message: `No running program of yours matches "${query}" (session-critical processes and Jarvis itself are excluded).` };
    if (matches.length > MAX_PROCESSES_ENDED) {
      return {
        message: `${matches.length} processes match "${query}". Ask the operator to be more specific, or give a process ID.`,
        processes: matches.slice(0, MAX_PROCESSES_LISTED).map(({ pid, name, command }) => ({ pid, name, command })),
      };
    }
    const force = Boolean(body.force);
    const names = [...new Set(matches.map((m) => m.name))].join(', ');
    return {
      request: prepareConfirm({
        title: `${force ? 'Force-quit' : 'End'} ${names}`,
        detail: matches.map((m) => `PID ${m.pid}  ${m.command || m.name}`).join('\n'),
        warnings: [force ? 'Force-quit: the program gets no chance to save.' : 'Unsaved work in this program may be lost.'],
        payload: { action: 'terminate', pids: matches.map((m) => m.pid), force, names },
      }),
    };
  },

  async power({ value }) {
    const kind = String(value || '').toLowerCase();
    if (!POWER_ACTIONS[kind]) throw new RequestError(`Power action must be one of: ${Object.keys(POWER_ACTIONS).join(', ')}.`);
    return {
      request: prepareConfirm({
        title: `${POWER_ACTIONS[kind][0].toUpperCase()}${POWER_ACTIONS[kind].slice(1)} this computer`,
        detail: `Runs ${POWER_DELAY_SECONDS} seconds after you authorize; saying "cancel" before then stops it.`,
        warnings: kind === 'suspend' ? [] : ['Anything unsaved will be lost.'],
        payload: { action: 'power', kind },
      }),
    };
  },

  async start_on_login({ value, req }) {
    const current = getAutostart().enabled;
    if (value === undefined || value === null || String(value).toLowerCase() === 'status') {
      return { message: `Start on login is ${current ? 'on' : 'off'}.`, start_on_login: current };
    }
    const on = wantsOn(value, current);
    if (on === current) return { message: `Start on login is already ${on ? 'on' : 'off'}.`, start_on_login: on };
    if (!on) {
      disableAutostart();
      return { message: 'Start on login turned off.', start_on_login: false };
    }
    const result = enableAutostart({ port: new URL(req.url).port || (req.headers.get('host') || '').split(':')[1] });
    return {
      message: `Start on login turned on: at login the Jarvis server starts (if it is not running) and the HUD opens at http://localhost:${result.port}/.`,
      start_on_login: true,
    };
  },

  async cancel_power() {
    const cancelled = cancelPower();
    const watchStopped = stopDownloadWatch();
    if (watchStopped && !cancelled) return { message: 'Stopped waiting to shut down after the Steam downloads.' };
    return { message: cancelled ? `Cancelled the pending ${POWER_ACTIONS[cancelled.kind]}.${watchStopped ? ' The Steam download watch is off too.' : ''}` : 'No power action is pending.' };
  },

  async confirm({ body }) {
    const payload = takeConfirm(body.id, body.token);
    if (!payload) throw new RequestError('This authorization is unknown or expired. Ask again.');

    if (payload.action === 'wifi_off') {
      await setWifi(false);
      pushUndo('turned WiFi off', 'wifi', { enabled: true });
      return { message: 'WiFi turned off.' };
    }
    if (payload.action === 'terminate') {
      const { ended, survivors } = await terminateProcesses(payload.pids, payload.force);
      return {
        message: survivors.length
          ? `Ended ${ended.length} of ${payload.pids.length} ${payload.names} process(es); ${survivors.length} did not exit (it may be asking to save, or a force-quit is needed).`
          : `Ended ${payload.names} (${ended.length} process${ended.length === 1 ? '' : 'es'}).`,
        ended,
        survivors,
      };
    }
    if (payload.action === 'steam_shutdown') {
      startDownloadWatch(() => schedulePower('shutdown'));
      return { message: 'Watching the Steam downloads; the computer shuts down once they finish (with the usual grace period, and "cancel" still stops it).' };
    }
    if (payload.action === 'power') {
      const plan = schedulePower(payload.kind);
      return {
        message: `${POWER_ACTIONS[plan.kind][0].toUpperCase()}${POWER_ACTIONS[plan.kind].slice(1)} in ${plan.delaySeconds} seconds. Say "cancel" to stop it.${plan.dryRun ? ' (Dry run: nothing will actually happen.)' : ''}`,
        ...(plan.dryRun ? { dry_run: true, command: plan.command } : {}),
      };
    }
    throw new RequestError('Unknown confirmed action.');
  },

  async cancel({ body }) {
    cancelConfirm(body.id);
    return { message: 'Cancelled.' };
  },
};

export async function POST(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;

  let body = {};
  try {
    body = await req.json();
  } catch {
    // Empty or invalid body
  }

  const action = body?.action || '';
  const handler = ACTIONS[action];
  if (!handler) {
    return NextResponse.json({ success: false, action, message: `Unknown system settings action "${action}".` }, { status: 400 });
  }

  try {
    const result = await handler({ value: body.value, body, req });
    if (result.request) {
      return NextResponse.json({ success: true, action, needs_confirmation: true, request: result.request, message: `Waiting for the operator to authorize "${result.request.title}" on the HUD.` });
    }
    return NextResponse.json({ success: true, action, ...result });
  } catch (error) {
    if (error instanceof SettingsError || error instanceof RequestError || error instanceof SandboxError) {
      return NextResponse.json({ success: false, action, message: error.message });
    }
    console.error(`[/api/system-settings] ${action} failed:`, error);
    return NextResponse.json({ success: false, action, message: `System setting failed: ${error.message}` }, { status: 500 });
  }
}
