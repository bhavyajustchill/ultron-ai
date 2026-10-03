import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Semantic (RAG) recall for the Jarvis memory vault (Phase 7.4).
 * Memories are embedded with Gemini Embedding 2 and cached in a local vector file keyed by
 * memory id + content hash, so edits re-embed and deletions are pruned. Retrieval ranks by
 * cosine similarity with small keyword and importance boosts.
 */

export const EMBEDDING_MODEL = 'gemini-embedding-2';
const DIMENSIONS = 768;
const BATCH_SIZE = 100;
const API_BASE = process.env.JARVIS_GEMINI_API_BASE || 'https://generativelanguage.googleapis.com';
const VECTOR_FILE = path.resolve(
  /*turbopackIgnore: true*/ process.env.JARVIS_MEMORY_VECTORS || path.join(process.cwd(), 'data', 'memory-vectors.json')
);

const IMPORTANCE_BOOST = { critical: 0.05, high: 0.03, medium: 0.01, low: 0 };
const KEYWORD_BOOST = 0.12;

const hashContent = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);

// Gemini Embedding 2 takes its retrieval task as an instruction inside the text
const formatDocument = (memory) => `title: ${memory.category || 'none'} | text: ${memory.content}`;
const formatQuery = (query) => `task: search result | query: ${query}`;

function readStore() {
  try {
    const store = JSON.parse(fs.readFileSync(VECTOR_FILE, 'utf-8'));
    if (store.model === EMBEDDING_MODEL && store.dimensions === DIMENSIONS) return store;
  } catch {
    // Missing or unreadable: start fresh
  }
  return { model: EMBEDDING_MODEL, dimensions: DIMENSIONS, items: {} };
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(VECTOR_FILE), { recursive: true });
  const tmp = `${VECTOR_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store), 'utf-8');
  fs.renameSync(tmp, VECTOR_FILE);
}

/**
 * Embeds texts in batches via batchEmbedContents. Throws on API errors.
 */
async function embedTexts(texts, apiKey) {
  const vectors = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${API_BASE}/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          output_dimensionality: DIMENSIONS,
        })),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Embedding request failed (${res.status}): ${detail.slice(0, 200)}`);
    }
    const data = await res.json();
    const embeddings = data.embeddings || [];
    if (embeddings.length !== batch.length) throw new Error('Embedding response size mismatch.');
    vectors.push(...embeddings.map((e) => e.values));
  }
  return vectors;
}

function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}

/**
 * Embeds any memories that are new or edited since the last index, prunes deleted ones,
 * and persists the vector store. Returns the up-to-date store.
 */
export async function syncMemoryVectors(memories, apiKey) {
  const store = readStore();
  const liveIds = new Set(memories.map((m) => m.id));
  let changed = false;

  for (const id of Object.keys(store.items)) {
    if (!liveIds.has(id)) {
      delete store.items[id];
      changed = true;
    }
  }

  const stale = memories.filter((m) => m.content && store.items[m.id]?.hash !== hashContent(formatDocument(m)));
  if (stale.length) {
    const vectors = await embedTexts(stale.map(formatDocument), apiKey);
    stale.forEach((memory, i) => {
      store.items[memory.id] = { hash: hashContent(formatDocument(memory)), vector: vectors[i] };
    });
    changed = true;
  }

  if (changed) writeStore(store);
  return store;
}

/**
 * Ranks `candidates` (e.g. one category) against a natural-language query. The whole vault
 * (`allMemories`) is synced so filtering never prunes other memories' vectors.
 * Returns candidates with a `relevance` score, best first.
 */
export async function semanticSearch({ allMemories, candidates, query, apiKey, limit = 10 }) {
  const store = await syncMemoryVectors(allMemories, apiKey);
  const [queryVector] = await embedTexts([formatQuery(query)], apiKey);
  const keywords = query.toLowerCase().split(/\W+/).filter((w) => w.length > 2);

  return candidates
    .filter((m) => store.items[m.id])
    .map((memory) => {
      const content = (memory.content || '').toLowerCase();
      const keywordHit = keywords.length > 0 && keywords.some((w) => content.includes(w));
      const relevance =
        cosine(queryVector, store.items[memory.id].vector) +
        (keywordHit ? KEYWORD_BOOST : 0) +
        (IMPORTANCE_BOOST[memory.importance] || 0);
      return { ...memory, relevance: Math.round(relevance * 1000) / 1000 };
    })
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}
