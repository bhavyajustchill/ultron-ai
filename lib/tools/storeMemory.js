import { postJson } from '@/lib/tools/http';

/**
 * Live tool `store_memory`: Saves a fact to the long-term memory vault (and picks up "call me ..." callsigns).
 */
export default {
  declaration: {
    name: 'store_memory',
    description: 'Saves a new fact, operator preference, project specification, or mission objective into persistent long-term memory so it is remembered across all future conversations.',
    parameters: {
      type: 'OBJECT',
      properties: {
        content: {
          type: 'STRING',
          description: 'The concise, declarative memory statement or fact to preserve.',
        },
        category: {
          type: 'STRING',
          description: 'Category: tactical (technical/system), preference (operator habits/settings), or mission (goals/projects).',
          enum: ['tactical', 'preference', 'mission'],
        },
        importance: {
          type: 'STRING',
          description: 'Importance rating: low, medium, high, or critical.',
          enum: ['low', 'medium', 'high', 'critical'],
        },
      },
      required: ['content'],
    },
  },

  async run(args, ctx) {
    const content = args.content || '';
    const category = args.category || 'tactical';
    const importance = args.importance || 'medium';
    ctx.log(`[DEEP MEMORY] Inscribing directive to persistent vault: "${content}"...`);

    let saved = { status: 'SAVED', content };
    try {
      const data = await postJson('/api/memory', { content, category, importance });
      if (data.memory) {
        ctx.store.getState().addMemory(data.memory);
        saved = data.memory;
      }
    } catch (err) {
      console.error('[tools/store_memory] Store error:', err);
    }
    ctx.log('[DEEP MEMORY] Directive committed to vault successfully.');

    // Pick up a new callsign when the operator says what to call them
    const nameMatch = content.match(/(?:call me(?: as)?|my name is|operator(?:'s)? (?:true )?name is)\s+([^.,;!\n]+)/i);
    const extractedName = nameMatch?.[1]?.trim();
    if (extractedName && extractedName.length < 30) {
      ctx.store.getState().setOperatorProfile({ callsign: extractedName });
      postJson('/api/memory', { action: 'update_profile', profile: { callsign: extractedName } }).catch(() => {});
    }

    return { status: 'COMMITTED', message: 'Memory successfully saved to long-term vault.', saved_item: saved };
  },
};
