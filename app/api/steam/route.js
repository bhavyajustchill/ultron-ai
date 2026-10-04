import { NextResponse } from 'next/server';
import { findSteamRoot, listSteamGames, findGame, searchSteamStore } from '@/lib/steamLibrary';
import { prepareConfirm } from '@/lib/confirmGate';
import { openWithDefaultApp } from '@/lib/desktopLauncher';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';
import { ReminderError, resolveWhen, describeWhen, scheduleOneShotCommand, listOneShotCommands, cancelOneShotCommand } from '@/lib/reminders';

const SCHEDULE_PREFIX = 'ultron-steam-';

// The program that hands steam:// links to the Steam client
function steamOpener() {
  if (process.env.JARVIS_STEAM_OPENER) return [process.env.JARVIS_STEAM_OPENER];
  if (process.platform === 'win32') return ['explorer.exe'];
  if (process.platform === 'darwin') return ['/usr/bin/open'];
  return ['/usr/bin/xdg-open'];
}

/**
 * Next.js 16 App Router Route Handler: POST /api/steam (Phase 8.8)
 * Steam library status, updates, launching, installing, and power-off when downloads finish
 * (that last one needs the HUD authorization card, then runs from /api/system-settings confirm).
 */

const NOT_INSTALLED =
  'Steam is not installed on this computer. It can be installed from the distribution (e.g. "sudo apt install steam" on Ubuntu, or the Flathub package com.valvesoftware.Steam), or from store.steampowered.com.';

export async function POST(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;

  let body = {};
  try {
    body = await req.json();
  } catch {
    // Empty or invalid body
  }
  const action = body.action || 'status';

  // Store search works without the client (it is a public web API)
  if (action === 'search_store') {
    try {
      const items = (await searchSteamStore(body.game || '')).slice(0, 5);
      return NextResponse.json({
        success: true,
        items,
        message: items.length ? `Steam store: ${items.map((i) => `${i.name} (${i.price})`).join('; ')}.` : `Nothing on the Steam store matches "${body.game}".`,
      });
    } catch (error) {
      return NextResponse.json({ success: false, message: `Steam store search failed: ${error.message}` });
    }
  }

  const root = findSteamRoot();
  if (!root) return NextResponse.json({ success: false, installed: false, message: NOT_INSTALLED });
  const games = listSteamGames(root);
  const open = async (url, done) => {
    const opened = await openWithDefaultApp(url);
    return NextResponse.json({
      success: opened.success,
      message: opened.success ? done : `Steam could not be opened: ${opened.error}`,
      ...(opened.dryRun ? { dry_run: true, command: opened.command } : {}),
    });
  };

  switch (action) {
    case 'status': {
      const pending = games.filter((g) => g.needsUpdate);
      const active = games.filter((g) => g.updating);
      return NextResponse.json({
        success: true,
        installed: true,
        games: games.map(({ appid, name, sizeGb, needsUpdate, updating }) => ({ appid, name, sizeGb, needsUpdate, updating })),
        message: `${games.length} game(s) installed. ${pending.length ? `Updates waiting: ${pending.map((g) => g.name).join(', ')}.` : 'No updates waiting.'}${active.length ? ` Downloading now: ${active.map((g) => g.name).join(', ')}.` : ''}`,
      });
    }
    case 'launch': {
      const game = findGame(games, body.game);
      if (!game) return NextResponse.json({ success: false, message: `No installed game matches "${body.game}".` });
      return open(`steam://rungameid/${game.appid}`, `Launching ${game.name} through Steam.`);
    }
    case 'update': {
      const targets = body.game ? [findGame(games, body.game)].filter(Boolean) : games.filter((g) => g.needsUpdate);
      if (!targets.length) return NextResponse.json({ success: true, message: body.game ? `No installed game matches "${body.game}".` : 'Every game is up to date.' });
      // Steam starts a pending update when the game's install page is requested
      for (const game of targets.slice(1)) await openWithDefaultApp(`steam://install/${game.appid}`);
      return open(`steam://install/${targets[0].appid}`, `Asked Steam to update ${targets.map((g) => g.name).join(', ')}.`);
    }
    case 'install': {
      const installed = findGame(games, body.game);
      if (installed) return NextResponse.json({ success: true, message: `${installed.name} is already installed.` });
      let items;
      try {
        items = await searchSteamStore(body.game || '');
      } catch (error) {
        return NextResponse.json({ success: false, message: `Steam store search failed: ${error.message}` });
      }
      if (!items.length) return NextResponse.json({ success: false, message: `Nothing on the Steam store matches "${body.game}".` });
      return open(`steam://install/${items[0].appid}`, `Steam's install dialog is open for ${items[0].name} (${items[0].price}); the operator confirms it there.`);
    }
    case 'schedule_update': {
      // Off-peak downloads: Steam's install link opens at the chosen time and starts the update
      const targets = body.game ? [findGame(games, body.game)].filter(Boolean) : games.filter((g) => g.needsUpdate);
      if (!targets.length) return NextResponse.json({ success: true, message: body.game ? `No installed game matches "${body.game}".` : 'Every game is up to date; nothing to schedule.' });
      let when;
      try {
        when = resolveWhen({ at: body.at, in_minutes: body.in_minutes });
        for (const game of targets) {
          await scheduleOneShotCommand({
            name: `${SCHEDULE_PREFIX}${game.appid}-${Date.now().toString(36)}`,
            when,
            argv: [...steamOpener(), `steam://install/${game.appid}`],
            description: `Ultron scheduled Steam update: ${game.name}`,
          });
        }
      } catch (error) {
        if (error instanceof ReminderError) return NextResponse.json({ success: false, message: error.message });
        throw error;
      }
      return NextResponse.json({ success: true, message: `Scheduled ${targets.map((g) => g.name).join(', ')} to update ${describeWhen(when)}. Steam must be running then.` });
    }
    case 'list_scheduled': {
      const pending = await listOneShotCommands(SCHEDULE_PREFIX);
      return NextResponse.json({ success: true, scheduled: pending, message: pending.length ? `${pending.length} scheduled Steam update(s).` : 'No Steam updates are scheduled.' });
    }
    case 'cancel_scheduled': {
      const pending = await listOneShotCommands(SCHEDULE_PREFIX);
      for (const name of pending) await cancelOneShotCommand(name);
      return NextResponse.json({ success: true, message: pending.length ? `Cancelled ${pending.length} scheduled Steam update(s).` : 'No Steam updates were scheduled.' });
    }
    case 'shutdown_when_done': {
      if (!games.some((g) => g.updating)) return NextResponse.json({ success: true, message: 'Nothing is downloading in Steam right now.' });
      return NextResponse.json({
        success: true,
        needs_confirmation: true,
        request: prepareConfirm({
          title: 'Shut down when Steam downloads finish',
          detail: `Watches ${games.filter((g) => g.updating).map((g) => g.name).join(', ')} and shuts the computer down once Steam is idle (with the usual grace period to cancel).`,
          warnings: ['Anything unsaved will be lost at shutdown.'],
          payload: { action: 'steam_shutdown' },
        }),
        message: 'Waiting for the operator to authorize the shutdown watch on the HUD.',
      });
    }
    default:
      return NextResponse.json({ success: false, message: `Unknown Steam action "${action}".` }, { status: 400 });
  }
}
