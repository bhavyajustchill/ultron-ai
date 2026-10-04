import { getJson } from '@/lib/tools/http';

/**
 * Live tool `recall_memory`: Semantic recall from the long-term memory vault.
 */
export default {
  declaration: {
    name: 'recall_memory',
    description: 'Retrieves stored memory facts, Operator profile attributes, mission objectives, and past tactical directives from persistent long-term memory. Recall is semantic: describe what you are looking for in natural language (e.g. "what database does the operator prefer") and results come back ranked by relevance.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Specific topic, keyword, or entity to search for in memory (e.g. "project", "preferences", "clearance"). Leave blank to recall recent memories.',
        },
        category: {
          type: 'STRING',
          description: 'Category filter: all, tactical, preference, mission, or profile.',
          enum: ['all', 'tactical', 'preference', 'mission', 'profile'],
        },
      },
    },
  },

  async run(args, ctx) {
    const query = args.query || '';
    const category = args.category || 'all';
    ctx.log(`[DEEP MEMORY] Interrogating memory vault (Query: "${query || '*'}", Category: ${category.toUpperCase()})...`);

    let data = { profile: ctx.store.getState().operatorProfile, memories: ctx.store.getState().memories || [] };
    try {
      const key = ctx.apiKey();
      data = await getJson(`/api/memory?query=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`, {
        headers: key ? { 'x-gemini-api-key': key } : {},
      });
      if (data.profile) ctx.store.getState().setOperatorProfile(data.profile);
    } catch (err) {
      console.error('[tools/recall_memory] Recall error:', err);
    }

    const memories = (data.memories || []).slice(0, 10).map((m) => ({
      content: m.content,
      category: m.category,
      importance: m.importance,
      timestamp: m.timestamp,
      ...(m.relevance !== undefined ? { relevance: m.relevance } : {}),
    }));
    ctx.log(
      `[DEEP MEMORY] Vault interrogation complete (${data.search_mode === 'semantic' ? 'semantic recall' : 'keyword match'}). ${memories.length} relevant facts relayed to Ultron`
    );
    return {
      operator_profile: data.profile,
      memories,
      total_recalled: memories.length,
      search_mode: data.search_mode || 'keyword',
    };
  },
};
