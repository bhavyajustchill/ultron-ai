import { postJson } from '@/lib/tools/http';

/**
 * Live tool `system_settings` (Phase 8.3): dark mode, WiFi, brightness, wallpaper, processes, and
 * power. Irreversible actions come back with a card request; they run only after the operator
 * clicks AUTHORIZE on the HUD.
 */
export default {
  declaration: {
    name: 'system_settings',
    description: 'Reads and changes desktop system settings: status (dark mode, WiFi, brightness, wallpaper, pending power action), dark_mode (on / off / toggle), wifi (on / off / toggle), brightness (percentage, "up", or "down"), wallpaper (an image path inside the allowed folders, or an image URL to download), list_processes (find running programs by name), terminate_process (end a program by name or process ID; force only when a normal end failed), power (shutdown, restart, suspend, logout), cancel_power, and start_on_login (on / off / status: start the Ultron server and open the HUD when the operator logs in). Power, WiFi off, and ending programs show an authorization card on the HUD and wait for the operator\'s click: tell the operator it is waiting for them, and never say it happened until the result says so. Dark mode, WiFi off, brightness, and wallpaper changes can be reversed with undo_last_action.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'The setting action.',
          enum: ['status', 'dark_mode', 'wifi', 'brightness', 'wallpaper', 'list_processes', 'terminate_process', 'power', 'cancel_power', 'start_on_login'],
        },
        value: {
          type: 'STRING',
          description: 'on / off / toggle for dark_mode, wifi, and start_on_login (or status); a percentage (1-100), "up", or "down" for brightness; shutdown / restart / suspend / logout for power.',
        },
        path: {
          type: 'STRING',
          description: 'Wallpaper image path (e.g. "~/Pictures/space.jpg").',
        },
        url: {
          type: 'STRING',
          description: 'Wallpaper image URL to download and apply.',
        },
        query: {
          type: 'STRING',
          description: 'Program name (e.g. "firefox") or process ID for list_processes / terminate_process.',
        },
        force: {
          type: 'BOOLEAN',
          description: 'terminate_process only: force-quit (no chance to save). Use only after a normal end did not work.',
        },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    const action = args.action || 'status';
    const detail = args.value || args.query || args.path || args.url || '';
    ctx.log(`[SYSTEM] ${action.toUpperCase().replace('_', ' ')}${detail ? ` ("${detail}")` : ''}...`);

    let result = { success: false, message: 'Failed to contact the system settings bridge.' };
    try {
      result = await postJson('/api/system-settings', { ...args, action });
      if (result.needs_confirmation) {
        ctx.log(`[SYSTEM] Awaiting operator authorization on the HUD: ${result.request.title}`);
        const decision = await ctx.requestApproval(result.request);
        if (decision !== 'approved') {
          postJson('/api/system-settings', { action: 'cancel', id: result.request.id }).catch(() => {});
          const message =
            decision === 'timeout'
              ? `The operator did not authorize "${result.request.title}" within 90 seconds, so nothing was done.`
              : `The operator denied "${result.request.title}", so nothing was done.`;
          ctx.log(`[SYSTEM] ${message}`);
          return { success: false, status: decision === 'timeout' ? 'TIMED_OUT_WAITING' : 'DENIED_BY_OPERATOR', message };
        }
        result = await postJson('/api/system-settings', { action: 'confirm', id: result.request.id, token: result.request.token });
      }
    } catch (err) {
      console.error('[tools/system_settings] Error:', err);
    }
    ctx.log(`[SYSTEM] ${result.success ? 'Done' : 'Failed'}: ${result.message}`);
    return result;
  },
};
