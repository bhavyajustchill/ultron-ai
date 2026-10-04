import fs from 'fs';
import path from 'path';
import { displayPath } from '@/lib/fsSandbox';
import { pushUndo, fileStamp } from '@/lib/undoJournal';

/**
 * Shared helpers for the deep file processor (Phase 8.9). Results are written next to the source
 * under a new name (never overwriting) and recorded for undo like any file Jarvis creates.
 */

export class ProcessError extends Error {}

export const MAX_INPUT_BYTES = 200 * 1024 * 1024;

export function requireInput(target, kinds) {
  if (!fs.existsSync(target)) throw new ProcessError(`${displayPath(target)} does not exist.`);
  const stat = fs.statSync(target);
  if (!stat.isFile()) throw new ProcessError(`${displayPath(target)} is not a file.`);
  if (stat.size > MAX_INPUT_BYTES) throw new ProcessError(`${displayPath(target)} is larger than ${MAX_INPUT_BYTES / 1024 / 1024} MB.`);
  const ext = path.extname(target).slice(1).toLowerCase();
  if (kinds && !kinds.includes(ext)) throw new ProcessError(`${displayPath(target)} is not a supported file (${kinds.join(', ')}).`);
  return { size: stat.size, ext };
}

/**
 * "<folder>/<stem><suffix>.<ext>", adding " (2)", " (3)"... if that name is taken.
 */
export function outputPath(source, suffix, ext) {
  const dir = path.dirname(source);
  const stem = path.basename(source, path.extname(source));
  let candidate = path.join(/*turbopackIgnore: true*/ dir, `${stem}${suffix}.${ext}`);
  for (let n = 2; fs.existsSync(candidate); n++) {
    candidate = path.join(/*turbopackIgnore: true*/ dir, `${stem}${suffix} (${n}).${ext}`);
  }
  return candidate;
}

/**
 * Records a newly written result for undo and returns its display path.
 */
export function recordOutput(file) {
  pushUndo(`created ${displayPath(file)}`, 'file_created', { path: file, ...fileStamp(file) });
  return displayPath(file);
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function requireKey(apiKey, what) {
  if (!apiKey) throw new ProcessError(`${what} uses Gemini and needs the API key.`);
}
