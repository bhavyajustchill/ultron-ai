import fs from 'fs';
import path from 'path';
import { pushUndo } from '@/lib/undoJournal';

/**
 * The knowledge vault file (data/memories.json): the operator profile plus long-term memories.
 * Every server module reads and writes it through here (Phase 10.1): writes are atomic (temp file
 * + rename), records are validated, and contextPlan() decides which memories Jarvis gets in full
 * in his live prompt, so the HUD can show the same answer. JARVIS_MEMORY_FILE relocates the vault
 * (used by automated checks).
 */

export const MEMORY_FILE_PATH = path.resolve(
  /*turbopackIgnore: true*/ process.env.JARVIS_MEMORY_FILE || path.join(process.cwd(), 'data', 'memories.json')
);

export const CATEGORIES = ['tactical', 'preference', 'mission', 'profile'];
export const IMPORTANCE = ['low', 'medium', 'high', 'critical'];
// Memories given to Jarvis in full at the start of every live session; the rest are listed by
// topic and recalled on demand
export const PROMPT_MEMORY_LIMIT = 15;
export const MAX_CONTENT_CHARS = 2000;
const MAX_IMPORT = 2000;

export class VaultError extends Error {}

const DEFAULT_VAULT = {
  profile: {
    callsign: 'Operator',
    clearance: 'Class-9 Operative',
    role: 'Lead Systems Architect',
    assistantName: 'Jarvis',
    voiceName: 'Charon',
    autoBriefing: true,
    enableHumor: true,
    preferences:
      'Prefers concise, authoritative tactical briefings, high-speed execution, dry British wit, and playful daily humor.',
  },
  memories: [
    {
      id: 'mem-seed-1',
      content: 'Operator initialized Project Jarvis with Mark-II cybernetic architecture parity.',
      category: 'mission',
      importance: 'high',
      source: 'system_bootstrap',
    },
    {
      id: 'mem-seed-2',
      content: 'Vocal core runs on the Gemini Live multimodal WebSocket; the active voice is whichever core is selected in Settings.',
      category: 'tactical',
      importance: 'medium',
      source: 'system_bootstrap',
    },
    {
      id: 'mem-seed-3',
      content: 'Operator prefers immediate direct speech from Jarvis without meta-commentary or preambles.',
      category: 'preference',
      importance: 'critical',
      source: 'system_bootstrap',
    },
  ],
};

// ---------------------------------------------------------------------------
// File access
// ---------------------------------------------------------------------------

/**
 * The vault ({ profile, memories }). A missing file is created with the starter vault; an
 * unreadable one is reported as empty but never overwritten.
 */
export function readVault() {
  try {
    const data = JSON.parse(fs.readFileSync(MEMORY_FILE_PATH, 'utf-8'));
    return { ...data, profile: data.profile || {}, memories: Array.isArray(data.memories) ? data.memories : [] };
  } catch (err) {
    if (err.code === 'ENOENT') {
      const now = new Date().toISOString();
      const starter = { profile: { ...DEFAULT_VAULT.profile }, memories: DEFAULT_VAULT.memories.map((m) => ({ ...m, timestamp: now })) };
      writeVault(starter);
      return starter;
    }
    console.error('[memoryVault] Could not read the vault:', err.message);
    return { profile: {}, memories: [], unreadable: true };
  }
}

export function writeVault(data) {
  if (data.unreadable) throw new VaultError('The vault file could not be read, so it was not overwritten.');
  fs.mkdirSync(path.dirname(MEMORY_FILE_PATH), { recursive: true });
  const tmp = `${MEMORY_FILE_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, MEMORY_FILE_PATH);
}

/**
 * Read, change, and save in one step (synchronous, so requests never interleave). `change`
 * mutates the vault and returns the result.
 */
export function updateVault(change) {
  const data = readVault();
  const result = change(data);
  writeVault(data);
  return result;
}

/**
 * Merges fields into the operator profile and saves the vault.
 */
export function updateVaultProfile(fields) {
  return updateVault((data) => {
    data.profile = { ...(data.profile || {}), ...fields };
    return data.profile;
  });
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export const newMemoryId = () => `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const normalizeText = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Validated content / category / importance / pinned from client input (only the fields given).
 */
export function cleanFields(input, { requireContent = false } = {}) {
  const fields = {};
  if (input.content !== undefined || requireContent) {
    const content = String(input.content || '').replace(/\s+\n/g, '\n').trim();
    if (!content) throw new VaultError('Memory content cannot be empty.');
    if (content.length > MAX_CONTENT_CHARS) throw new VaultError(`A memory can hold up to ${MAX_CONTENT_CHARS} characters.`);
    fields.content = content;
  }
  if (input.category !== undefined) {
    const category = String(input.category).toLowerCase().trim();
    if (!CATEGORIES.includes(category)) throw new VaultError(`Category must be one of: ${CATEGORIES.join(', ')}.`);
    fields.category = category;
  }
  if (input.importance !== undefined) {
    const importance = String(input.importance).toLowerCase().trim();
    if (!IMPORTANCE.includes(importance)) throw new VaultError(`Importance must be one of: ${IMPORTANCE.join(', ')}.`);
    fields.importance = importance;
  }
  if (input.pinned !== undefined) fields.pinned = Boolean(input.pinned);
  return fields;
}

export function createMemory(input, source = 'operative_dialog') {
  const fields = cleanFields({ category: 'tactical', importance: 'medium', ...input }, { requireContent: true });
  return {
    id: newMemoryId(),
    ...fields,
    pinned: Boolean(fields.pinned),
    timestamp: new Date().toISOString(),
    source: String(input.source || source).slice(0, 60),
  };
}

/**
 * Records a change to memories in the shared undo journal: `before` are the records to put back
 * (deleted or edited), `removeIds` the records to take out again (added).
 */
export function journalChange(label, before, removeIds = []) {
  return pushUndo(label, 'memory_changed', { before, remove_ids: removeIds });
}

/**
 * Reverses a journalled change (used by /api/undo and the HUD's undo toast).
 */
export function revertChange({ before = [], remove_ids: removeIds = [] }) {
  return updateVault((data) => {
    const remove = new Set(removeIds);
    let memories = data.memories.filter((m) => !remove.has(m.id));
    for (const record of before) {
      const index = memories.findIndex((m) => m.id === record.id);
      if (index >= 0) memories[index] = record;
      else memories = [record, ...memories];
    }
    // Keep newest first, as the vault is always written
    data.memories = memories.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    return { restored: before.length, removed: removeIds.length };
  });
}

/**
 * Adds memories from an export (or any list of { content, category?, importance? }), skipping
 * ones already in the vault (same id or same wording). Returns { added, skipped, invalid }.
 */
export function importMemories(records) {
  if (!Array.isArray(records)) throw new VaultError('The file has no "memories" list.');
  if (records.length > MAX_IMPORT) throw new VaultError(`At most ${MAX_IMPORT} memories can be imported at once.`);
  return updateVault((data) => {
    const ids = new Set(data.memories.map((m) => m.id));
    const texts = new Set(data.memories.map((m) => normalizeText(m.content)));
    const added = [];
    let skipped = 0;
    let invalid = 0;
    for (const record of records) {
      let memory;
      try {
        memory = createMemory(
          { content: record?.content, category: CATEGORIES.includes(record?.category) ? record.category : 'tactical', importance: IMPORTANCE.includes(record?.importance) ? record.importance : 'medium', pinned: record?.pinned, source: record?.source || 'import' },
          'import'
        );
      } catch {
        invalid++;
        continue;
      }
      if ((record.id && ids.has(record.id)) || texts.has(normalizeText(memory.content))) {
        skipped++;
        continue;
      }
      // Keep the original id and date when they look sane
      if (typeof record.id === 'string' && /^[\w-]{4,80}$/.test(record.id)) memory.id = record.id;
      if (record.timestamp && !Number.isNaN(new Date(record.timestamp).getTime())) memory.timestamp = new Date(record.timestamp).toISOString();
      ids.add(memory.id);
      texts.add(normalizeText(memory.content));
      added.push(memory);
    }
    data.memories = [...added, ...data.memories].sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
    const undo = added.length ? journalChange(`imported ${added.length} memor${added.length === 1 ? 'y' : 'ies'}`, [], added.map((m) => m.id)) : null;
    return { added: added.length, skipped, invalid, ...(undo ? { undo_id: undo.id } : {}) };
  });
}

// ---------------------------------------------------------------------------
// What Jarvis knows in full
// ---------------------------------------------------------------------------

const IMPORTANCE_RANK = { critical: 3, high: 2, medium: 1, low: 0 };
// With humour off, memories about humour are kept out of the prompt (whole words: "with" is not "wit")
const HUMOUR_PATTERN = /\b(humou?r\w*|sarcas\w*|wit|witty|banter|jokes?|quips?)\b/i;

/**
 * Splits memories into the ones Jarvis gets in full ("prompt", at most PROMPT_MEMORY_LIMIT:
 * pinned first, then by importance, then newest), the ones he recalls on demand ("recall"), and
 * the ones held back while humour is off ("muted").
 * Returns { prompt: [...], recall: [...], status: Map(id -> { context, slot? }) }.
 */
export function contextPlan(memories, profile = {}) {
  const humourOff = profile.enableHumor === false;
  const status = new Map();
  const eligible = [];
  for (const memory of memories) {
    if (humourOff && (memory.id === 'mem-1789153920000-humor' || HUMOUR_PATTERN.test(memory.content || ''))) {
      status.set(memory.id, { context: 'muted' });
    } else {
      eligible.push(memory);
    }
  }
  eligible.sort(
    (a, b) =>
      Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      (IMPORTANCE_RANK[b.importance] ?? 1) - (IMPORTANCE_RANK[a.importance] ?? 1) ||
      new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
  );
  const prompt = eligible.slice(0, PROMPT_MEMORY_LIMIT);
  const recall = eligible.slice(PROMPT_MEMORY_LIMIT);
  prompt.forEach((m, i) => status.set(m.id, { context: 'prompt', slot: i + 1 }));
  recall.forEach((m) => status.set(m.id, { context: 'recall' }));
  return { prompt, recall, status };
}

/**
 * Memories with their context status attached, for the HUD.
 */
export function withContext(memories, plan) {
  return memories.map((m) => ({ ...m, pinned: Boolean(m.pinned), ...(plan.status.get(m.id) || { context: 'recall' }) }));
}

const FILLER_WORDS = new Set('a an the of to in on at and or is are was were be it its this that with for as by'.split(' '));

/**
 * Near-identical wording (no embeddings needed): word-set overlap of at least `threshold`.
 * Numbers and short words count ("number 5" is not "number 6"); only filler words are ignored.
 * Returns [{ a, b, similarity }].
 */
export function textDuplicatePairs(memories, threshold = 0.8) {
  const sets = memories.map((m) => new Set(normalizeText(m.content).split(' ').filter((w) => w && !FILLER_WORDS.has(w))));
  const pairs = [];
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const [a, b] = [sets[i], sets[j]];
      if (!a.size || !b.size) continue;
      let shared = 0;
      for (const w of a) if (b.has(w)) shared++;
      const similarity = shared / (a.size + b.size - shared);
      if (similarity >= threshold) pairs.push({ a: memories[i].id, b: memories[j].id, similarity: Math.round(similarity * 100) / 100 });
    }
  }
  return pairs;
}

/**
 * Groups duplicate pairs: a memory joins a group only when it is a duplicate of every member, so
 * chains (A like B, B like C, A unlike C) never snowball into one big group.
 * Returns [{ ids: [...], similarity }] (similarity = closest pair), most alike first.
 */
export function groupPairs(pairs) {
  const best = new Map();
  for (const { a, b, similarity } of pairs) {
    const key = [a, b].sort().join('|');
    best.set(key, Math.max(best.get(key) || 0, similarity));
  }
  const alike = (x, y) => best.has([x, y].sort().join('|'));
  const groups = [];
  const groupOf = new Map();
  for (const [key, similarity] of [...best.entries()].sort((x, y) => y[1] - x[1])) {
    const [a, b] = key.split('|');
    const ga = groupOf.get(a);
    const gb = groupOf.get(b);
    if (!ga && !gb) {
      const group = { ids: [a, b], similarity };
      groups.push(group);
      groupOf.set(a, group);
      groupOf.set(b, group);
    } else if (ga && !gb && ga.ids.every((id) => alike(id, b))) {
      ga.ids.push(b);
      groupOf.set(b, ga);
    } else if (gb && !ga && gb.ids.every((id) => alike(id, a))) {
      gb.ids.push(a);
      groupOf.set(a, gb);
    }
  }
  return groups;
}
