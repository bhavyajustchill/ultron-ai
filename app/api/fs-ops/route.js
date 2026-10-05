import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { resolveSafePath, displayPath, SandboxError } from '@/lib/fsSandbox';
import { planOrganize, applyOrganize, undoLastOrganize } from '@/lib/folderOrganizer';
import { openWithDefaultApp, openInCodeEditor } from '@/lib/desktopLauncher';
import { DOCUMENT_RENDERERS } from '@/lib/documentForge';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';
import { JOURNAL_DIR, pushUndo, removeUndo, fileStamp } from '@/lib/undoJournal';

const BACKUP_DIR = path.join(JOURNAL_DIR, 'backups');
const MAX_READ_BYTES = 64 * 1024; // keeps file reads well inside the live session context window
const MAX_WRITE_BYTES = 1024 * 1024;
const MAX_LIST_ENTRIES = 200;
const PREVIEW_SAMPLE_SIZE = 10;

// Returned with newly created / written files so Jarvis offers to open them
const OFFER_TO_OPEN =
  'Ask the operator whether they would like this file opened now. If they agree, call file_operations with action "open_path" on this path.';

class FsOpError extends Error {}

function requireText(value, field) {
  if (typeof value !== 'string') throw new FsOpError(`"${field}" text is required for this action.`);
  if (Buffer.byteLength(value, 'utf-8') > MAX_WRITE_BYTES) {
    throw new FsOpError(`"${field}" exceeds the ${MAX_WRITE_BYTES / 1024} KB write limit.`);
  }
  return value;
}

function requireFile(target) {
  if (!fs.existsSync(target)) throw new FsOpError(`${displayPath(target)} does not exist.`);
  if (!fs.statSync(target).isFile()) throw new FsOpError(`${displayPath(target)} is not a file.`);
}

function requireFolder(target) {
  if (!fs.existsSync(target)) throw new FsOpError(`${displayPath(target)} does not exist.`);
  if (!fs.statSync(target).isDirectory()) throw new FsOpError(`${displayPath(target)} is not a folder.`);
}

function readTextFile(target) {
  const buffer = fs.readFileSync(target);
  if (buffer.subarray(0, 8192).includes(0)) {
    throw new FsOpError(`${displayPath(target)} looks like a binary file and cannot be read as text.`);
  }
  return buffer;
}

/**
 * Copies a file into the journal before it is overwritten, logging where it came from.
 */
function backupFile(target) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(/*turbopackIgnore: true*/ BACKUP_DIR, `${Date.now()}-${path.basename(target)}`);
  fs.copyFileSync(target, backupPath);
  fs.appendFileSync(
    path.join(BACKUP_DIR, 'log.jsonl'),
    `${JSON.stringify({ original: target, backup: backupPath, at: new Date().toISOString() })}\n`,
    'utf-8'
  );
  return backupPath;
}

// Undo records (Phase 8.3): what Jarvis created can be put away, what it overwrote restored
function recordCreated(target) {
  pushUndo(`created ${displayPath(target)}`, 'file_created', { path: target, ...fileStamp(target) });
}

function recordOverwritten(target, backupPath, verb) {
  pushUndo(`${verb} ${displayPath(target)}`, 'file_overwritten', { path: target, backup: backupPath });
}

const ACTIONS = {
  list_directory({ target }) {
    requireFolder(target);
    const entries = fs
      .readdirSync(target, { withFileTypes: true })
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => {
        const type = entry.isDirectory() ? 'folder' : entry.isSymbolicLink() ? 'link' : 'file';
        const size = type === 'file' ? fs.statSync(path.join(target, entry.name)).size : undefined;
        return { name: entry.name, type, ...(size !== undefined ? { size_bytes: size } : {}) };
      })
      .sort((a, b) => (b.type === 'folder') - (a.type === 'folder') || a.name.localeCompare(b.name));
    return {
      message: `${displayPath(target)} contains ${entries.length} visible item(s).`,
      entries: entries.slice(0, MAX_LIST_ENTRIES),
      truncated: entries.length > MAX_LIST_ENTRIES,
    };
  },

  read_file({ target }) {
    requireFile(target);
    const buffer = readTextFile(target);
    const truncated = buffer.length > MAX_READ_BYTES;
    return {
      message: `Read ${displayPath(target)} (${buffer.length} bytes${truncated ? `, first ${MAX_READ_BYTES / 1024} KB returned` : ''}).`,
      content: buffer.subarray(0, MAX_READ_BYTES).toString('utf-8'),
      truncated,
    };
  },

  create_folder({ target }) {
    if (fs.existsSync(target)) {
      requireFolder(target);
      return { message: `Folder ${displayPath(target)} already exists.` };
    }
    fs.mkdirSync(target, { recursive: true });
    pushUndo(`created folder ${displayPath(target)}`, 'folder_created', { path: target });
    return { message: `Created folder ${displayPath(target)}.` };
  },

  create_file({ target, body }) {
    const content = body.content === undefined ? '' : requireText(body.content, 'content');
    if (fs.existsSync(target)) {
      throw new FsOpError(`${displayPath(target)} already exists. Use write_file to replace it.`);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { encoding: 'utf-8', flag: 'wx' });
    recordCreated(target);
    return { message: `Created ${displayPath(target)}.`, next_step: OFFER_TO_OPEN };
  },

  write_file({ target, body }) {
    const content = requireText(body.content, 'content');
    let backupPath = null;
    if (fs.existsSync(target)) {
      requireFile(target);
      backupPath = backupFile(target);
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
    }
    fs.writeFileSync(target, content, 'utf-8');
    if (backupPath) recordOverwritten(target, backupPath, 'rewrote');
    else recordCreated(target);
    return {
      message: backupPath
        ? `Replaced ${displayPath(target)}; the previous version was backed up.`
        : `Wrote new file ${displayPath(target)}.`,
      ...(backupPath ? { backup: backupPath } : {}),
      next_step: OFFER_TO_OPEN,
    };
  },

  append_file({ target, body }) {
    const content = requireText(body.content, 'content');
    let backupPath = null;
    if (fs.existsSync(target)) {
      requireFile(target);
      backupPath = backupFile(target);
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true });
    }
    fs.appendFileSync(target, content, 'utf-8');
    if (backupPath) recordOverwritten(target, backupPath, 'appended to');
    else recordCreated(target);
    return { message: `Appended ${Buffer.byteLength(content, 'utf-8')} bytes to ${displayPath(target)}.` };
  },

  replace_in_file({ target, body }) {
    requireFile(target);
    const find = requireText(body.find, 'find');
    const replace = requireText(body.replace ?? '', 'replace');
    if (!find) throw new FsOpError('"find" text cannot be empty.');

    const original = readTextFile(target).toString('utf-8');
    const occurrences = original.split(find).length - 1;
    if (occurrences === 0) throw new FsOpError(`The text to replace was not found in ${displayPath(target)}.`);
    if (occurrences > 1 && !body.replace_all) {
      throw new FsOpError(
        `The text to replace appears ${occurrences} times in ${displayPath(target)}. Quote a more specific passage or set replace_all.`
      );
    }

    const backupPath = backupFile(target);
    const updated = body.replace_all ? original.split(find).join(replace) : original.replace(find, () => replace);
    fs.writeFileSync(target, updated, 'utf-8');
    recordOverwritten(target, backupPath, 'edited');
    return {
      message: `Updated ${occurrences} occurrence(s) in ${displayPath(target)}; the previous version was backed up.`,
      backup: backupPath,
    };
  },

  async create_document({ target, body }) {
    const requestedFormat = (body.format || path.extname(target).slice(1) || 'pdf').toLowerCase();
    const render = DOCUMENT_RENDERERS[requestedFormat];
    if (!render) throw new FsOpError(`Unsupported document format "${requestedFormat}". Use pdf or docx.`);
    const markdown = requireText(body.content, 'content');

    // Make the extension match the format, re-checking the sandbox for the final name
    const finalTarget = path.extname(target).toLowerCase() === `.${requestedFormat}`
      ? target
      : resolveSafePath(`${target}.${requestedFormat}`);

    let backupPath = null;
    if (fs.existsSync(finalTarget)) {
      if (!body.overwrite) {
        throw new FsOpError(
          `${displayPath(finalTarget)} already exists. Set overwrite to replace it (the old version is backed up).`
        );
      }
      requireFile(finalTarget);
      backupPath = backupFile(finalTarget);
    } else {
      fs.mkdirSync(path.dirname(finalTarget), { recursive: true });
    }

    const buffer = await render({ title: body.title, markdown });
    fs.writeFileSync(finalTarget, buffer);
    if (backupPath) recordOverwritten(finalTarget, backupPath, 'replaced the document');
    else recordCreated(finalTarget);
    return {
      path: displayPath(finalTarget),
      message: `Created ${requestedFormat.toUpperCase()} document ${displayPath(finalTarget)} (${Math.max(1, Math.round(buffer.length / 1024))} KB).`,
      ...(backupPath ? { backup: backupPath } : {}),
      next_step: OFFER_TO_OPEN,
    };
  },

  async open_path({ target, body }) {
    if (!fs.existsSync(target)) throw new FsOpError(`${displayPath(target)} does not exist.`);
    const inEditor = body.app === 'code';
    const result = inEditor ? await openInCodeEditor(target) : await openWithDefaultApp(target);
    if (!result.success) throw new FsOpError(`Could not open ${displayPath(target)}: ${result.error}`);
    return {
      message: `Opened ${displayPath(target)}${inEditor ? ' in the code editor' : ''}.`,
      ...(result.dryRun ? { dry_run: true } : {}),
    };
  },

  organize_folder({ target, body }) {
    const mode = body.mode || 'preview';
    const groupBy = body.group_by === 'date' ? 'date' : 'type';

    if (mode === 'undo') {
      const result = undoLastOrganize(JOURNAL_DIR, target);
      if (!result) {
        throw new FsOpError(`There is no organize run to undo${target ? ` for ${displayPath(target)}` : ''}.`);
      }
      removeUndo((entry) => entry.kind === 'organize' && entry.data.manifestId === result.id);
      return {
        message: `Undid the last organize of ${displayPath(result.folder)}: ${result.restored} file(s) restored${result.missing ? `, ${result.missing} no longer found` : ''}.`,
        restored: result.restored,
        missing: result.missing,
      };
    }

    requireFolder(target);
    const plan = planOrganize(target, groupBy);
    const breakdown = Object.entries(plan.summary)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => `${count} into ${category}`)
      .join(', ');

    if (plan.moves.length === 0) {
      return { message: `${displayPath(target)} has no loose files to organize.`, summary: {} };
    }

    if (mode === 'preview') {
      return {
        message: `Preview for ${displayPath(target)}: ${plan.moves.length} file(s) would move (${breakdown}). Nothing has been moved yet.`,
        summary: plan.summary,
        left_in_place: plan.skipped,
        sample_moves: plan.moves.slice(0, PREVIEW_SAMPLE_SIZE).map((m) => ({
          file: path.basename(m.from),
          to: displayPath(m.to),
        })),
      };
    }

    if (mode !== 'apply') throw new FsOpError(`Unknown organize mode "${mode}".`);
    const manifest = applyOrganize(plan, JOURNAL_DIR);
    if (manifest.moves.length) {
      pushUndo(`organized ${displayPath(target)} by ${groupBy}`, 'organize', { folder: target, manifestId: manifest.id });
    }
    return {
      message: `Organized ${displayPath(target)}: moved ${manifest.moves.length} file(s) (${breakdown}). This can be undone.`,
      moved: manifest.moves.length,
      summary: plan.summary,
    };
  },
};

/**
 * Next.js 16 App Router Route Handler: POST /api/fs-ops
 * Sandboxed workspace file operations for Jarvis's `file_operations` and `organize_folder` tools.
 * There is intentionally no delete action.
 */
export async function POST(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;

  let body = {};
  try {
    body = await req.json();
  } catch {
    // Empty or invalid body
  }

  const action = body?.action || '';
  const handler = ACTIONS[action];
  if (!handler) {
    return NextResponse.json(
      { success: false, action, message: `Unknown file action "${action}".` },
      { status: 400 }
    );
  }

  try {
    // Undo may omit the path to reverse the most recent organize anywhere
    const target = action === 'organize_folder' && body.mode === 'undo' && !body.path
      ? undefined
      : resolveSafePath(body.path);
    const result = await handler({ target, body });
    return NextResponse.json({ success: true, action, ...(target ? { path: displayPath(target) } : {}), ...result });
  } catch (error) {
    if (error instanceof SandboxError || error instanceof FsOpError) {
      return NextResponse.json({ success: false, action, message: error.message });
    }
    // Windows locks files that are open in Word, Excel, and other apps
    if (['EBUSY', 'EPERM', 'EACCES'].includes(error.code)) {
      return NextResponse.json({
        success: false,
        action,
        message: `${body.path ? `"${body.path}"` : 'That file'} is open or locked by another program (for example Word or Excel), or is read-only. Close it there and ask again.`,
      });
    }
    console.error(`[/api/fs-ops] ${action} failed:`, error);
    return NextResponse.json(
      { success: false, action, message: `File operation failed: ${error.message}` },
      { status: 500 }
    );
  }
}
