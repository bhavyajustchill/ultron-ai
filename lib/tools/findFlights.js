import { postJson } from '@/lib/tools/http';

/**
 * Live tool `find_flights` (Phase 8.8): opens Google Flights on a search, with a live summary when
 * grounding is available.
 */
export default {
  declaration: {
    name: 'find_flights',
    description: 'Looks up flights: opens Google Flights with the search filled in (live fares on screen) and, when available, returns a short live summary of airlines, nonstop options, and fares. Work out dates like "next Friday" from the current local time you were given. Never quote fares from memory: if there is no live summary, point the operator to the page.',
    parameters: {
      type: 'OBJECT',
      properties: {
        from: { type: 'STRING', description: 'Departure city or airport code (e.g. "Ahmedabad", "BOM").' },
        to: { type: 'STRING', description: 'Destination city or airport code.' },
        date: { type: 'STRING', description: 'Departure date YYYY-MM-DD (omit for flexible dates).' },
        return_date: { type: 'STRING', description: 'Return date YYYY-MM-DD for a round trip.' },
        passengers: { type: 'NUMBER', description: 'Number of adults (1-9).' },
        cabin: { type: 'STRING', description: 'economy, premium economy, business, or first.', enum: ['economy', 'premium economy', 'business', 'first'] },
      },
      required: ['from', 'to'],
    },
  },

  async run(args, ctx) {
    ctx.log(`[FLIGHTS] ${args.from} → ${args.to}${args.date ? ` on ${args.date}` : ''}${args.return_date ? `, back ${args.return_date}` : ''}...`);
    let result = { success: false, message: 'Failed to contact the flight search.' };
    try {
      result = await postJson('/api/flights', args, { 'x-gemini-api-key': ctx.apiKey() });
    } catch (err) {
      console.error('[tools/find_flights] Error:', err);
    }
    ctx.log(`[FLIGHTS] ${result.query ? `Google Flights: ${result.query}` : result.message}`);
    if (result.summary) {
      ctx.store.getState().addIntelResult({ query: result.query, mode: 'flights', summary: result.summary, results: result.results || [] }, { reveal: false });
    }
    return result;
  },
};
