import { getJson } from '@/lib/tools/http';

/**
 * Live tool `web_search`: Web search dossiers shown in the Intel panel (grounded Gemini first,
 * then search-then-read; see /api/web-search).
 */
export default {
  declaration: {
    name: 'web_search',
    description: 'Searches the live web, reads the top pages, and answers with cited sources, shown as a dossier in the HUD Intel drawer: use it for news briefings, research the operator wants to read, when they ask to see sources, and for any current fact when built-in Google Search is unavailable. For a quick factual answer you can otherwise rely on your built-in Google Search. For weather, use get_weather.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'The search query string or topic to look up.',
        },
        mode: {
          type: 'STRING',
          description: 'Search mode: search (general), news (breaking news), research (in-depth analysis), price (current prices and where to buy), or compare (side-by-side comparison).',
          enum: ['search', 'news', 'research', 'price', 'compare'],
        },
        items: {
          type: 'ARRAY',
          items: { type: 'STRING' },
          description: 'compare mode: the things to compare, e.g. ["iPhone 17", "Pixel 11"].',
        },
      },
      required: ['query'],
    },
  },

  async run(args, ctx) {
    const query = args.query || '';
    const items = Array.isArray(args.items) ? args.items.filter(Boolean) : [];
    const mode = items.length > 1 ? 'compare' : args.mode || 'search';
    ctx.log(`[WEB INTEL] Scanning live networks for: "${query}" (${mode.toUpperCase()})...`);

    let result = { summary: `No live search results could be retrieved for "${query}".`, results: [] };
    try {
      const key = ctx.apiKey();
      const itemsParam = items.length ? `&items=${encodeURIComponent(items.join('|'))}` : '';
      result = await getJson(`/api/web-search?query=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}${itemsParam}`, {
        headers: key ? { 'x-gemini-api-key': key } : {},
      });
      ctx.store.getState().addIntelResult({ query, mode, summary: result.summary, results: result.results });
      ctx.log(`[WEB INTEL] Retrieved ${result.count || 0} intelligence items. Tactical Drawer updated.`);
    } catch (err) {
      console.error('[tools/web_search] Search error:', err);
    }

    return {
      query,
      summary: result.summary,
      results: (result.results || []).slice(0, 4).map((r) => ({ title: r.title, snippet: r.snippet, source: r.source })),
    };
  },
};
