/**
 * Plain Gemini text generation (no live session), tried across models in order because
 * demand-related 503s vary per model. Used for the knowledge fallback and session recaps.
 */

const API_BASE = process.env.JARVIS_GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
export const TEXT_MODELS = [
  ...new Set([process.env.JARVIS_SEARCH_MODEL || 'gemini-3.8-flash', process.env.JARVIS_FALLBACK_MODEL || 'gemini-3.5-flash-lite']),
];
// A model that just answered "high demand" (503) or "busy" (429) is tried last for a short while,
// so every request does not wait on it first
const BUSY_MS = 2 * 60 * 1000;
const busyUntil = new Map();

/**
 * Returns the model's text answer. `json: true` asks for a JSON response body; `attachments` are
 * extra parts sent before the prompt, e.g. { inlineData: { mimeType, data: base64 } } for images,
 * PDFs, or audio; `tools` are Gemini tools such as [{ url_context: {} }]; `models` overrides the
 * order tried. With `raw: true` the result is { text, model, candidate } so callers can read tool
 * metadata.
 */
export async function generateText({ prompt, apiKey, json = false, attachments = [], tools = null, raw = false, models = TEXT_MODELS, timeoutMs = 120000 }) {
  let lastError;
  const now = Date.now();
  const ordered = [...models.filter((m) => !(busyUntil.get(m) > now)), ...models.filter((m) => busyUntil.get(m) > now)];
  for (const model of ordered) {
    try {
      const res = await fetch(`${API_BASE}/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [...attachments, { text: prompt }] }],
          ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}),
          ...(tools ? { tools } : {}),
        }),
      });
      if (res.status === 503 || res.status === 429) busyUntil.set(model, Date.now() + BUSY_MS);
      if (!res.ok) throw new Error(`${model} answered ${res.status}`);
      const candidate = (await res.json()).candidates?.[0];
      const text = (candidate?.content?.parts || []).map((part) => part.text || '').join('').trim();
      if (text) return raw ? { text, model, candidate } : text;
      throw new Error(`${model} returned an empty answer`);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(lastError?.message || 'No text model answered.');
}
