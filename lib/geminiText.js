/**
 * Plain Gemini text generation (no live session), tried across models in order because
 * demand-related 503s vary per model. Used for the knowledge fallback and session recaps.
 */

const API_BASE = process.env.JARVIS_GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
export const TEXT_MODELS = [
  ...new Set([process.env.JARVIS_SEARCH_MODEL || 'gemini-3.8-flash', process.env.JARVIS_FALLBACK_MODEL || 'gemini-3.5-flash-lite']),
];

/**
 * Returns the model's text answer. `json: true` asks for a JSON response body; `attachments` are
 * extra parts sent before the prompt, e.g. { inlineData: { mimeType, data: base64 } } for images,
 * PDFs, or audio.
 */
export async function generateText({ prompt, apiKey, json = false, attachments = [], timeoutMs = 120000 }) {
  let lastError;
  for (const model of TEXT_MODELS) {
    try {
      const res = await fetch(`${API_BASE}/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [...attachments, { text: prompt }] }],
          ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
        }),
      });
      if (!res.ok) throw new Error(`${model} answered ${res.status}`);
      const text = ((await res.json()).candidates?.[0]?.content?.parts || []).map((part) => part.text || '').join('').trim();
      if (text) return text;
      throw new Error(`${model} returned an empty answer`);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(lastError?.message || 'No text model answered.');
}
