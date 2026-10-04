import { postJson } from '@/lib/tools/http';

/**
 * Live tool `undo_last_action` (Phase 8.3): reverses Jarvis's most recent reversible action.
 */
export default {
  declaration: {
    name: 'undo_last_action',
    description: 'Reverses the most recent change Ultron made: files created, rewritten, edited, or appended (created files are put away in the Ultron journal, edited files restored from backup), folders created, folder organizing, volume, dark mode, WiFi off, brightness, and wallpaper. Call it when the operator says "undo", "put it back", "that was wrong", or similar. Each call undoes one action; mode "list" shows what can be undone, newest first. Power actions and ended programs cannot be undone.',
    parameters: {
      type: 'OBJECT',
      properties: {
        mode: {
          type: 'STRING',
          description: 'undo (default) reverses the newest action; list shows the undo history.',
          enum: ['undo', 'list'],
        },
      },
    },
  },

  async run(args, ctx) {
    const mode = args.mode === 'list' ? 'list' : 'undo';
    ctx.log(`[UNDO] ${mode === 'list' ? 'Listing reversible actions' : 'Reversing the last action'}...`);
    let result = { success: false, message: 'Failed to contact the undo bridge.' };
    try {
      result = await postJson('/api/undo', { action: mode });
    } catch (err) {
      console.error('[tools/undo_last_action] Error:', err);
    }
    ctx.log(`[UNDO] ${result.message}`);
    return result;
  },
};
