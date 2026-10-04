import { NextResponse } from 'next/server';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';
import { semanticDuplicatePairs, semanticSearch } from '@/lib/memoryVectors';
import {
  CATEGORIES,
  IMPORTANCE,
  PROMPT_MEMORY_LIMIT,
  VaultError,
  cleanFields,
  contextPlan,
  createMemory,
  groupPairs,
  importMemories,
  journalChange,
  readVault,
  revertChange,
  textDuplicatePairs,
  updateVault,
  withContext,
} from '@/lib/memoryVault';
import { takeUndo } from '@/lib/undoJournal';

/**
 * Next.js 16 App Router Route Handler: /api/memory — the long-term memory vault and operator
 * profile (Phase 10.1 manager API). Writes are same-origin only; deletes and Jarvis's own edits
 * are recorded in the undo journal.
 */

const apiKeyOf = (req) => req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || '';
const fail = (message, status = 400) => NextResponse.json({ success: false, error: 'INVALID_REQUEST', message }, { status });

function stats(memories, plan) {
  const count = (key, values) => Object.fromEntries(values.map((v) => [v, memories.filter((m) => (m[key] || '').toLowerCase() === v).length]));
  return {
    total: memories.length,
    by_category: count('category', CATEGORIES),
    by_importance: count('importance', IMPORTANCE),
    pinned: memories.filter((m) => m.pinned).length,
    prompt_limit: PROMPT_MEMORY_LIMIT,
    in_prompt: plan.prompt.length,
    muted: [...plan.status.values()].filter((s) => s.context === 'muted').length,
  };
}

/**
 * GET /api/memory
 *   query     optional search; ranked by meaning when a Gemini key is available (x-gemini-api-key
 *             header or GEMINI_API_KEY), otherwise by keyword
 *   category  'all' | tactical | preference | mission | profile
 *   limit     max records (default 50; 'all' for the whole vault)
 *   mode      'auto' (default) or 'keyword' to skip semantic ranking
 *   export=1  the whole vault as a downloadable JSON file
 *   duplicates=1  groups of memories that say nearly the same thing
 * Every memory carries its context status: 'prompt' (in Jarvis's live prompt, with its slot),
 * 'recall' (fetched on demand), or 'muted' (held back while humour is off).
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const data = readVault();
    const plan = contextPlan(data.memories, data.profile);
    const all = withContext(data.memories, plan);

    if (searchParams.get('export') === '1') {
      const stamp = new Date().toISOString().slice(0, 10);
      const body = JSON.stringify({ format: 'jarvis-memory-vault', version: 1, exported_at: new Date().toISOString(), profile: data.profile, memories: data.memories }, null, 2);
      return new NextResponse(body, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="ultron-memory-vault-${stamp}.json"` },
      });
    }

    if (searchParams.get('duplicates') === '1') {
      const apiKey = apiKeyOf(req);
      let pairs = textDuplicatePairs(data.memories);
      let mode = 'wording';
      if (apiKey) {
        try {
          pairs = [...pairs, ...(await semanticDuplicatePairs(data.memories, apiKey))];
          mode = 'meaning';
        } catch (err) {
          console.warn('[/api/memory] Semantic duplicate check failed, using wording only:', err.message);
        }
      }
      const byId = new Map(all.map((m) => [m.id, m]));
      const groups = groupPairs(pairs).map((g) => ({ similarity: g.similarity, memories: g.ids.map((id) => byId.get(id)).filter(Boolean) }));
      return NextResponse.json({ success: true, mode, groups });
    }

    const rawQuery = (searchParams.get('query') || '').trim();
    const category = (searchParams.get('category') || 'all').trim().toLowerCase();
    const limitParam = searchParams.get('limit') || '50';
    const limit = limitParam === 'all' ? Infinity : Math.max(1, parseInt(limitParam, 10) || 50);
    const candidates = category && category !== 'all' ? all.filter((m) => (m.category || '').toLowerCase() === category) : all;
    const base = { success: true, profile: data.profile, totalCount: data.memories.length, stats: stats(data.memories, plan) };

    const apiKey = apiKeyOf(req);
    let semanticError = null;
    if (rawQuery && apiKey && searchParams.get('mode') !== 'keyword') {
      try {
        const ranked = await semanticSearch({ allMemories: data.memories, candidates, query: rawQuery, apiKey, limit: Number.isFinite(limit) ? limit : candidates.length });
        return NextResponse.json({ ...base, memories: ranked, search_mode: 'semantic' });
      } catch (err) {
        semanticError = err.message;
        console.warn('[/api/memory] Semantic recall failed, falling back to keyword search:', err.message);
      }
    }

    const query = rawQuery.toLowerCase();
    const matches = (query
      ? candidates.filter((m) => [m.content, m.category, m.source].some((field) => (field || '').toLowerCase().includes(query)))
      : candidates
    ).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

    return NextResponse.json({
      ...base,
      memories: matches.slice(0, limit),
      search_mode: semanticError ? 'keyword_fallback' : 'keyword',
      ...(semanticError ? { semantic_error: semanticError } : {}),
    });
  } catch (error) {
    console.error('[/api/memory] GET error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: error.message || 'Failed to retrieve memories' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

const plural = (n) => `${n} memor${n === 1 ? 'y' : 'ies'}`;
const preview = (text) => (text.length > 48 ? `${text.slice(0, 45)}...` : text);

function deleteMemories(ids, label) {
  const wanted = new Set(ids);
  return updateVault((data) => {
    const removed = data.memories.filter((m) => wanted.has(m.id));
    if (!removed.length) throw new VaultError('None of those memories exist any more.');
    data.memories = data.memories.filter((m) => !wanted.has(m.id));
    const undo = journalChange(label || (removed.length === 1 ? `forgot "${preview(removed[0].content)}"` : `deleted ${plural(removed.length)}`), removed);
    return { deleted: removed.map((m) => m.id), undo_id: undo.id, totalCount: data.memories.length };
  });
}

function editMemory(id, fields, { journal = false, label } = {}) {
  return updateVault((data) => {
    const index = data.memories.findIndex((m) => m.id === id);
    if (index < 0) throw new VaultError(`Memory ${id} was not found.`);
    const before = data.memories[index];
    const after = { ...before, ...fields, updatedAt: new Date().toISOString() };
    data.memories[index] = after;
    const undo = journal ? journalChange(label || `changed "${preview(before.content)}"`, [before]) : null;
    return { memory: after, before, ...(undo ? { undo_id: undo.id } : {}) };
  });
}

// Jarvis's spoken edits name a memory by meaning ("forget that I like tea"); act only when one
// memory clearly matches, otherwise hand back the candidates so he can ask. Judged on raw cosine
// similarity (no keyword / importance boosts), calibrated on Gemini Embedding 2: real matches
// score 0.73-0.82, unrelated queries top out around 0.64
const MATCH_FLOOR = 0.68;
const CONFIDENT_SIMILARITY = 0.7;
const CONFIDENT_MARGIN = 0.04;
const KEYWORD_LEAD = 0.1;

async function findTarget({ id, query }, apiKey) {
  const data = readVault();
  if (id) {
    const memory = data.memories.find((m) => m.id === id);
    if (!memory) throw new VaultError(`Memory ${id} was not found.`);
    return { memory };
  }
  if (!String(query || '').trim()) throw new VaultError('Say which memory (an id or a description).');
  let ranked = [];
  let confident = false;
  let ranByMeaning = false;
  if (apiKey) {
    try {
      const scored = await semanticSearch({ allMemories: data.memories, candidates: data.memories, query, apiKey, limit: 6 });
      // Order by raw similarity for the decision
      ranked = [...scored].sort((a, b) => b.similarity - a.similarity);
      ranByMeaning = true;
      if (ranked.length && ranked[0].similarity < MATCH_FLOOR) return { none: true, closest: ranked };
      const [best, next] = ranked;
      // A clear lead in meaning, or a close one backed by a distinctive word only the best match has
      confident =
        Boolean(best) &&
        best.similarity >= CONFIDENT_SIMILARITY &&
        (!next || best.similarity - next.similarity >= CONFIDENT_MARGIN || best.relevance - next.relevance >= KEYWORD_LEAD);
    } catch (err) {
      console.warn('[/api/memory] Semantic match failed, using words:', err.message);
    }
  }
  if (!ranByMeaning) {
    const words = String(query).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
    ranked = data.memories.filter((m) => words.every((w) => (m.content || '').toLowerCase().includes(w))).slice(0, 3);
    confident = ranked.length === 1;
  }
  if (!ranked.length) return { none: true };
  return confident ? { memory: data.memories.find((m) => m.id === ranked[0].id) } : { candidates: ranked.slice(0, 3) };
}

const candidateList = (memories) =>
  memories.map((m) => ({ id: m.id, content: m.content, category: m.category, ...(m.similarity !== undefined ? { similarity: m.similarity } : {}) }));

async function voiceEdit(body, apiKey) {
  const op = body.op;
  if (op === 'status') {
    const data = readVault();
    const plan = contextPlan(data.memories, data.profile);
    return {
      success: true,
      stats: stats(data.memories, plan),
      pinned: data.memories.filter((m) => m.pinned).map((m) => m.content),
      message: `${plural(data.memories.length)} stored; ${plan.prompt.length} are in your context at the start of every conversation, ${data.memories.filter((m) => m.pinned).length} of them pinned.`,
    };
  }
  if (op === 'find') {
    const data = readVault();
    let ranked = [];
    if (apiKey && body.query) {
      ranked = await semanticSearch({ allMemories: data.memories, candidates: data.memories, query: body.query, apiKey, limit: 5 }).catch(() => []);
    }
    if (!ranked.length) {
      const q = String(body.query || '').toLowerCase();
      ranked = data.memories.filter((m) => (m.content || '').toLowerCase().includes(q)).slice(0, 5);
    }
    return { success: true, candidates: candidateList(ranked), message: ranked.length ? `${ranked.length} matching memories.` : 'Nothing in the vault matches that.' };
  }

  const target = await findTarget(body, apiKey);
  if (target.none) {
    return {
      success: false,
      message: 'Nothing in the vault clearly matches that, so nothing was changed.',
      ...(target.closest ? { closest: candidateList(target.closest) } : {}),
    };
  }
  if (target.candidates) {
    return { success: false, ambiguous: true, candidates: candidateList(target.candidates), message: 'Several memories could match; ask the operator which one (then call again with its id).' };
  }
  const { memory } = target;
  if (op === 'forget') {
    const result = deleteMemories([memory.id], `forgot "${preview(memory.content)}"`);
    return { success: true, ...result, forgotten: memory.content, message: `Forgot: "${memory.content}". "Undo" brings it back.` };
  }
  if (op === 'update') {
    const fields = cleanFields({ content: body.content, ...(body.category ? { category: body.category } : {}), ...(body.importance ? { importance: body.importance } : {}) });
    const result = editMemory(memory.id, fields, { journal: true, label: `corrected "${preview(memory.content)}"` });
    return { success: true, memory: result.memory, undo_id: result.undo_id, message: `Updated: "${memory.content}" is now "${result.memory.content}".` };
  }
  if (op === 'pin' || op === 'unpin') {
    const result = editMemory(memory.id, { pinned: op === 'pin' }, { journal: true, label: `${op === 'pin' ? 'pinned' : 'unpinned'} "${preview(memory.content)}"` });
    return { success: true, memory: result.memory, undo_id: result.undo_id, message: op === 'pin' ? `Pinned: "${memory.content}" stays in your context in every conversation.` : `Unpinned: "${memory.content}".` };
  }
  throw new VaultError(`Unknown vault action "${op}".`);
}

/**
 * POST /api/memory { action, ... }
 *   update_profile   { profile }
 *   store_memory     { content, category?, importance?, pinned?, source?, journal? } (default action)
 *   update_memory    { id, content?, category?, importance?, pinned?, journal? }
 *   bulk_update      { ids, changes: { category?, importance?, pinned? } }
 *   delete_memories  { ids }                   -> { undo_id }
 *   restore          { undo_id }               reverses one journalled vault change
 *   merge            { keep_id, remove_ids, content? }
 *   import           { memories: [...] }       skips duplicates
 *   voice            { op: status | find | forget | update | pin | unpin, id?, query?, content? }
 */
export async function POST(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;
  let body;
  try {
    body = await req.json();
  } catch {
    return fail('A JSON body is required.');
  }

  try {
    const action = body.action || (body.profile ? 'update_profile' : body.id && body.content ? 'update_memory' : 'store_memory');

    if (action === 'update_profile') {
      const profile = updateVault((data) => {
        data.profile = { ...data.profile, ...(body.profile || {}) };
        return data.profile;
      });
      return NextResponse.json({ success: true, action, profile });
    }

    if (action === 'store_memory') {
      const memory = createMemory(body, body.source || 'operative_dialog');
      const totalCount = updateVault((data) => {
        data.memories = [memory, ...data.memories];
        return data.memories.length;
      });
      const undo = body.journal ? journalChange(`remembered "${preview(memory.content)}"`, [], [memory.id]) : null;
      return NextResponse.json({ success: true, action, memory, totalCount, ...(undo ? { undo_id: undo.id } : {}) });
    }

    if (action === 'update_memory') {
      const fields = cleanFields(body);
      if (!Object.keys(fields).length) return fail('Nothing to change.');
      const result = editMemory(body.id, fields, { journal: Boolean(body.journal) });
      return NextResponse.json({ success: true, action, memory: result.memory, ...(result.undo_id ? { undo_id: result.undo_id } : {}) });
    }

    if (action === 'bulk_update') {
      const ids = new Set(Array.isArray(body.ids) ? body.ids : []);
      const fields = cleanFields({ category: body.changes?.category, importance: body.changes?.importance, pinned: body.changes?.pinned });
      if (!ids.size || !Object.keys(fields).length) return fail('Give the memory ids and what to change.');
      const memories = updateVault((data) => {
        const now = new Date().toISOString();
        data.memories = data.memories.map((m) => (ids.has(m.id) ? { ...m, ...fields, updatedAt: now } : m));
        return data.memories.filter((m) => ids.has(m.id));
      });
      return NextResponse.json({ success: true, action, memories, updated: memories.length });
    }

    if (action === 'delete_memories') {
      const ids = Array.isArray(body.ids) ? body.ids : [];
      if (!ids.length) return fail('Give the memory ids to delete.');
      return NextResponse.json({ success: true, action, ...deleteMemories(ids) });
    }

    if (action === 'restore') {
      const entry = body.undo_id ? takeUndo(body.undo_id) : null;
      if (!entry || entry.kind !== 'memory_changed') return fail('That change can no longer be undone.', 404);
      const result = revertChange(entry.data);
      return NextResponse.json({ success: true, action, ...result, label: entry.label });
    }

    if (action === 'merge') {
      const removeIds = (Array.isArray(body.remove_ids) ? body.remove_ids : []).filter((id) => id !== body.keep_id);
      if (!body.keep_id || !removeIds.length) return fail('Say which memory to keep and which to merge into it.');
      const fields = body.content !== undefined ? cleanFields({ content: body.content }) : {};
      const result = updateVault((data) => {
        const keep = data.memories.find((m) => m.id === body.keep_id);
        if (!keep) throw new VaultError('The memory to keep was not found.');
        const removed = data.memories.filter((m) => removeIds.includes(m.id));
        if (!removed.length) throw new VaultError('The memories to merge were not found.');
        // The kept record inherits the strongest importance and any pin of the ones merged into it
        const rank = (m) => IMPORTANCE.indexOf(m.importance);
        const strongest = [keep, ...removed].reduce((best, m) => (rank(m) > rank(best) ? m : best), keep);
        const merged = { ...keep, ...fields, importance: strongest.importance, pinned: [keep, ...removed].some((m) => m.pinned), updatedAt: new Date().toISOString() };
        data.memories = data.memories.filter((m) => !removeIds.includes(m.id)).map((m) => (m.id === keep.id ? merged : m));
        const undo = journalChange(`merged ${plural(removed.length + 1)}`, [keep, ...removed]);
        return { memory: merged, removed: removed.map((m) => m.id), undo_id: undo.id };
      });
      return NextResponse.json({ success: true, action, ...result });
    }

    if (action === 'import') {
      const records = Array.isArray(body.memories) ? body.memories : body.vault?.memories;
      return NextResponse.json({ success: true, action, ...importMemories(records) });
    }

    if (action === 'voice') {
      return NextResponse.json({ action, ...(await voiceEdit(body, apiKeyOf(req))) });
    }

    return fail(`Unknown action "${action}".`);
  } catch (error) {
    if (error instanceof VaultError) return fail(error.message);
    console.error('[/api/memory] POST error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: error.message || 'Failed to update the vault' }, { status: 500 });
  }
}

/**
 * DELETE /api/memory?id=... (or a JSON body { id } / { ids }) -> { undo_id }
 */
export async function DELETE(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;
  try {
    const { searchParams } = new URL(req.url);
    let ids = searchParams.get('id') ? [searchParams.get('id')] : [];
    if (!ids.length) {
      try {
        const body = await req.json();
        ids = body?.ids || (body?.id ? [body.id] : []);
      } catch {
        // No body
      }
    }
    if (!ids.length) return NextResponse.json({ error: 'MISSING_ID', message: 'Memory ID is required for deletion.' }, { status: 400 });
    const result = deleteMemories(ids);
    return NextResponse.json({ success: true, deletedId: ids[0], ...result });
  } catch (error) {
    if (error instanceof VaultError) return NextResponse.json({ error: 'NOT_FOUND', message: error.message }, { status: 404 });
    console.error('[/api/memory] DELETE error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: error.message || 'Failed to delete memory' }, { status: 500 });
  }
}
