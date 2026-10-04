import { postJson } from '@/lib/tools/http';

/**
 * Live tool `steam_games` (Phase 8.8): Steam library status, updates, launch, install, and
 * power-off when downloads finish (HUD authorization).
 */
export default {
  declaration: {
    name: 'steam_games',
    description: 'Steam games on this computer: status (installed games and waiting updates), update (one game or all waiting), launch (a game by name), install (finds it on the Steam store; the operator confirms in Steam), search_store (prices, works without Steam), schedule_update (start one game or every waiting update at an off-peak time, e.g. "at 2am"), list_scheduled, cancel_scheduled, and shutdown_when_done (power off after downloads finish; needs the operator\'s click on the HUD card). If Steam is not installed, say so plainly.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'status, update, launch, install, search_store, or shutdown_when_done.',
          enum: ['status', 'update', 'launch', 'install', 'search_store', 'schedule_update', 'list_scheduled', 'cancel_scheduled', 'shutdown_when_done'],
        },
        game: { type: 'STRING', description: 'Game name for update / launch / install / search_store / schedule_update (omit to schedule every waiting update).' },
        at: { type: 'STRING', description: 'schedule_update: local time, e.g. "02:00" or "2026-10-05T02:00".' },
        in_minutes: { type: 'NUMBER', description: 'schedule_update: minutes from now instead of "at".' },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    ctx.log(`[STEAM] ${String(args.action || 'status').toUpperCase().replace(/_/g, ' ')}${args.game ? ` ("${args.game}")` : ''}...`);
    let result = { success: false, message: 'Failed to contact the Steam bridge.' };
    try {
      result = await postJson('/api/steam', args);
      if (result.needs_confirmation) {
        ctx.log(`[STEAM] Awaiting operator authorization on the HUD: ${result.request.title}`);
        const decision = await ctx.requestApproval(result.request);
        if (decision !== 'approved') {
          postJson('/api/system-settings', { action: 'cancel', id: result.request.id }).catch(() => {});
          result = { success: false, message: decision === 'timeout' ? 'Not authorized within 90 seconds, so no shutdown is planned.' : 'The operator declined, so no shutdown is planned.' };
        } else {
          result = await postJson('/api/system-settings', { action: 'confirm', id: result.request.id, token: result.request.token });
        }
      }
    } catch (err) {
      console.error('[tools/steam_games] Error:', err);
    }
    ctx.log(`[STEAM] ${result.message}`);
    return result;
  },
};
