import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Shared undo stack for Jarvis's own state-changing actions (Phase 8.3). Actions run immediately
 * and record how to reverse themselves; "undo" pops the newest record and /api/undo replays its
 * reverse (see lib/undoActions.js). Records are plain data ({ kind, data }) kept in a JSON file
 * so every route handler sees the same stack and it survives a server restart.
 */

// JARVIS_FS_JOURNAL relocates backups / undo manifests (used by automated checks)
export const JOURNAL_DIR = process.env.JARVIS_FS_JOURNAL || path.join(process.cwd(), 'data', 'fs-journal');
const STACK_FILE = path.join(/*turbopackIgnore: true*/ JOURNAL_DIR, 'undo-stack.json');

// Roughly "this conversation": far enough back to catch a mistake noticed a few commands later
const MAX_DEPTH = 10;

function readStack() {
  try {
    const entries = JSON.parse(fs.readFileSync(STACK_FILE, 'utf-8'));
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function writeStack(entries) {
  fs.mkdirSync(JOURNAL_DIR, { recursive: true });
  const tmp = `${STACK_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf-8');
  fs.renameSync(tmp, STACK_FILE);
}

/**
 * Records a reversible action. `label` is spoken back on undo ("dark mode turned on").
 */
export function pushUndo(label, kind, data) {
  const entry = { id: `undo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label, kind, data, at: new Date().toISOString() };
  writeStack([...readStack(), entry].slice(-MAX_DEPTH));
  return entry;
}

/**
 * Newest-first list of what can be undone.
 */
export function listUndo() {
  return readStack().reverse().map(({ id, label, kind, at }) => ({ id, label, kind, at }));
}

/**
 * Removes and returns the newest record (null when the stack is empty).
 */
export function popUndo() {
  const entries = readStack();
  const entry = entries.pop() || null;
  if (entry) writeStack(entries);
  return entry;
}

/**
 * Removes and returns one record by id (null when it is gone), for undo buttons tied to a
 * specific action rather than the newest one.
 */
export function takeUndo(id) {
  const entries = readStack();
  const index = entries.findIndex((entry) => entry.id === id);
  if (index < 0) return null;
  const [entry] = entries.splice(index, 1);
  writeStack(entries);
  return entry;
}

/**
 * Drops records that were reversed some other way (e.g. organize_folder's own undo mode).
 */
export function removeUndo(predicate) {
  const entries = readStack();
  const kept = entries.filter((entry) => !predicate(entry));
  if (kept.length !== entries.length) writeStack(kept);
}

/**
 * Content fingerprint, used to tell whether a file changed after Jarvis created it (content, not
 * mtime, so a file an earlier undo restored to exactly what Jarvis wrote still counts as unchanged).
 */
export function fileStamp(target) {
  const content = fs.readFileSync(target);
  return { size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') };
}
