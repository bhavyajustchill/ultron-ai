/**
 * Grounded web search for Jarvis dossiers: asks a Gemini text model to answer with the
 * google_search tool, then turns its cited sources into Intel drawer result cards.
 */

const API_BASE = process.env.JARVIS_GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
export const SEARCH_MODEL = process.env.JARVIS_SEARCH_MODEL || 'gemini-3.8-flash';

const PROMPTS = {
  search: (q) => `Answer using current web information. Be concise and factual (3-5 sentences): ${q}`,
  news: (q) =>
    `Summarize the most recent news about the following, newest developments first, with dates where known, as 4-6 short bullet points: ${q}`,
  research: (q) => `Write a well-structured research briefing (key facts, context, notable perspectives) on: ${q}`,
};

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Web source';
  }
}

/**
 * Returns { summary, results: [{ title, snippet, url, source }], queries }. Throws on API failure.
 */
export async function groundedSearch(query, mode, apiKey) {
  const res = await fetch(`${API_BASE}/v1beta/models/${SEARCH_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: (PROMPTS[mode] || PROMPTS.search)(query) }] }],
      tools: [{ google_search: {} }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Grounded search failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const candidate = (await res.json()).candidates?.[0];
  const summary = (candidate?.content?.parts || []).map((part) => part.text || '').join('').trim();
  if (!summary) throw new Error('Grounded search returned no answer.');

  // Each source's snippet is the part of the answer that cites it
  const grounding = candidate.groundingMetadata || {};
  const chunks = grounding.groundingChunks || [];
  const citations = chunks.map(() => []);
  for (const support of grounding.groundingSupports || []) {
    for (const index of support.groundingChunkIndices || []) {
      if (citations[index] && support.segment?.text) citations[index].push(support.segment.text.trim());
    }
  }

  const results = chunks
    .map((chunk, i) => {
      if (!chunk.web?.uri) return null;
      const source = chunk.web.title || hostnameOf(chunk.web.uri);
      return {
        title: source,
        snippet: [...new Set(citations[i])].join(' ').slice(0, 320) || 'Cited source for this answer.',
        url: chunk.web.uri,
        source,
      };
    })
    .filter(Boolean);

  return { summary, results, queries: grounding.webSearchQueries || [] };
}

// Text models tried in order for the knowledge fallback (demand-related 503s vary per model)
const KNOWLEDGE_MODELS = [...new Set([SEARCH_MODEL, process.env.JARVIS_FALLBACK_MODEL || 'gemini-3.5-flash-lite'])];

/**
 * Last-resort answer from the model's built-in knowledge (no live search), used when grounding is
 * unavailable on the key and the web fallbacks return nothing. Clearly labelled as possibly outdated.
 */
export async function knowledgeAnswer(query, mode, apiKey) {
  let lastError;
  for (const model of KNOWLEDGE_MODELS) {
    try {
      const res = await fetch(`${API_BASE}/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: (PROMPTS[mode] || PROMPTS.search)(query) }] }],
        }),
      });
      if (!res.ok) throw new Error(`${model} answered ${res.status}`);
      const summary = ((await res.json()).candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('').trim();
      if (summary) return summary;
      throw new Error(`${model} returned an empty answer`);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Knowledge answer failed: ${lastError?.message}`);
}
