import fs from 'fs';
import path from 'path';
import { JOURNAL_DIR, fileStamp } from '@/lib/undoJournal';
import { resolveSafePath, displayPath } from '@/lib/fsSandbox';
import { undoLastOrganize } from '@/lib/folderOrganizer';
import { restoreVolumeState } from '@/lib/volumeControl';
import { restoreDarkMode, setBrightness, restoreWallpaper, setWifi } from '@/lib/systemSettings';
import { revertChange } from '@/lib/memoryVault';

/**
 * Reverse operations for undo-stack records (Phase 8.3). Files Jarvis created are moved into the
 * journal rather than deleted, and overwritten files are restored from their backups (the current
 * version is backed up first), so an undo can itself be recovered by hand.
 */

const UNDONE_DIR = path.join(/*turbopackIgnore: true*/ JOURNAL_DIR, 'undone');
const BACKUP_DIR = path.join(/*turbopackIgnore: true*/ JOURNAL_DIR, 'backups');

export class UndoError extends Error {}

function moveIntoJournal(target, folder) {
  fs.mkdirSync(folder, { recursive: true });
  const destination = path.join(/*turbopackIgnore: true*/ folder, `${Date.now()}-${path.basename(target)}`);
  try {
    fs.renameSync(target, destination);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.copyFileSync(target, destination);
    fs.unlinkSync(target);
  }
  return destination;
}

const UNDO_KINDS = {
  file_created({ path: original, size, sha256 }) {
    const target = resolveSafePath(original); // the sandbox may have changed since
    if (!fs.existsSync(target)) return `${displayPath(target)} is already gone.`;
    const now = fileStamp(target);
    if (now.size !== size || now.sha256 !== sha256) {
      throw new UndoError(`${displayPath(target)} has changed since Jarvis created it, so it was left alone.`);
    }
    moveIntoJournal(target, UNDONE_DIR);
    return `Removed ${displayPath(target)} (a copy is kept in the Jarvis journal).`;
  },

  file_overwritten({ path: original, backup }) {
    const target = resolveSafePath(original);
    if (!backup || !fs.existsSync(backup)) throw new UndoError(`The backup of ${displayPath(target)} is no longer available.`);
    if (fs.existsSync(target)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      fs.copyFileSync(target, path.join(/*turbopackIgnore: true*/ BACKUP_DIR, `${Date.now()}-undone-${path.basename(target)}`));
    }
    fs.copyFileSync(backup, target);
    return `Restored the previous version of ${displayPath(target)}.`;
  },

  folder_created({ path: original }) {
    const target = resolveSafePath(original);
    if (!fs.existsSync(target)) return `${displayPath(target)} is already gone.`;
    try {
      fs.rmdirSync(target);
    } catch {
      throw new UndoError(`${displayPath(target)} now contains files, so it was left in place.`);
    }
    return `Removed the empty folder ${displayPath(target)}.`;
  },

  organize({ folder, manifestId }) {
    const result = undoLastOrganize(JOURNAL_DIR, folder, manifestId);
    if (!result) return `The organize of ${displayPath(folder)} was already undone.`;
    return `Put ${result.restored} file(s) in ${displayPath(result.folder)} back where they were${result.missing ? ` (${result.missing} could no longer be found)` : ''}.`;
  },

  async volume(before) {
    await restoreVolumeState(before);
    return `Volume restored to ${before.volume} percent${before.muted ? ' (muted)' : ''}.`;
  },

  async dark_mode(before) {
    await restoreDarkMode(before);
    return `${before.dark ? 'Dark' : 'Light'} mode restored.`;
  },

  async brightness({ percent }) {
    await setBrightness(percent);
    return `Brightness restored to ${percent} percent.`;
  },

  async wallpaper(before) {
    await restoreWallpaper(before);
    return 'Previous wallpaper restored.';
  },

  async wifi({ enabled }) {
    await setWifi(enabled);
    return `WiFi turned ${enabled ? 'back on' : 'off'}.`;
  },

  memory_changed(change) {
    const { restored, removed } = revertChange(change);
    const parts = [restored && `put back ${restored} memor${restored === 1 ? 'y' : 'ies'}`, removed && `removed ${removed} that had been added`].filter(Boolean);
    return `Memory vault: ${parts.join(' and ') || 'nothing to change'}.`;
  },
};

/**
 * Runs the reverse of one undo record and returns a short spoken-style result.
 */
export async function runUndo(entry) {
  const reverse = UNDO_KINDS[entry.kind];
  if (!reverse) throw new UndoError(`Jarvis does not know how to undo "${entry.label}".`);
  return reverse(entry.data);
}
