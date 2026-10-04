import { postJson } from '@/lib/tools/http';

/**
 * Live tool `topic_monitors` (Phase 8.6): topics Jarvis watches for new headlines.
 */
export default {
  declaration: {
    name: 'topic_monitors',
    description: 'Manages news topics Ultron keeps an eye on in the background ("keep an eye on SpaceX launches", "tell me when there is news about the Pixel 11"). Each topic is checked about once a day and you are told when a new headline appears. Actions: add (topic), remove (topic), list, check (check every topic right now).',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'add, remove, list, or check.',
          enum: ['add', 'remove', 'list', 'check'],
        },
        topic: {
          type: 'STRING',
          description: 'The topic to add or remove, as a short news search phrase (e.g. "SpaceX Starship").',
        },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    const action = args.action || 'list';
    ctx.log(`[MONITORS] ${action.toUpperCase()}${args.topic ? ` ("${args.topic}")` : ''}...`);
    let result = { success: false, message: 'Failed to contact the topic monitor bridge.' };
    try {
      result = await postJson('/api/monitors', { ...args, action });
    } catch (err) {
      console.error('[tools/topic_monitors] Error:', err);
    }
    ctx.log(`[MONITORS] ${result.message}`);
    for (const alert of result.alerts || []) {
      ctx.store.getState().addIntelResult(
        {
          query: `Monitor: ${alert.topic}`,
          mode: 'news',
          summary: alert.title,
          results: [{ title: alert.title, snippet: `${alert.source}${alert.published ? ` · ${new Date(alert.published).toLocaleString()}` : ''}`, source: alert.source, url: alert.link }],
        },
        { reveal: false }
      );
    }
    return result;
  },
};
