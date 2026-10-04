import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { findApps, getInstalledApps, launchDesktopApp } from '@/lib/appIndex';
import { findExecutable, isLinux, isMac, isWindows, launchDetached, openWithDefaultApp } from '@/lib/desktopLauncher';
import { displayPath, resolveSafePath, SandboxError } from '@/lib/fsSandbox';
import { InputError, prepareKeyboard } from '@/lib/inputControl';
import { fileStamp, pushUndo } from '@/lib/undoJournal';

/**
 * "Open notepad and type hello world" (Phase 9.1, live tool `write_in_app`).
 * Text editors get a document handoff: the text is saved as a note in ~/Documents/Ultron Notes and
 * opened in the editor, so it lands exactly as dictated, is already saved, and can never go to the
 * wrong window. Other apps (or "actually type it") get real keystrokes: the keyboard is readied
 * first (the Wayland portal may ask once), the app is launched, and the HUD tool types once the
 * app has taken focus. Editors typed into get a fresh empty note to type into, never an open file.
 */

export class WriteError extends Error {}

const execFileAsync = promisify(execFile);
const NOTES_DIRS = [process.env.JARVIS_NOTES_DIR, '~/Documents/Ultron Notes', '~/Desktop/Ultron Notes'].filter(Boolean);
const MAX_NOTE_CHARS = 200000;
const MAX_TYPED_CHARS = 2000;
// Launch to first keystroke: long enough for most apps to map a window and take focus
const TYPE_DELAY_MS = 1500;

// Spoken names that mean "whatever plain-text editor this computer has"
const EDITOR_ALIASES = new Set([
  'notepad', 'note pad', 'notepad app', 'text editor', 'texteditor', 'editor', 'plain text editor', 'gedit',
  'textedit', 'text edit', 'a text editor', 'text file', 'a text file',
]);
const PREFERRED_EDITORS = ['gnome-text-editor', 'gedit', 'kate', 'kwrite', 'mousepad', 'xed', 'pluma', 'featherpad', 'leafpad', 'notepadqq'];
const TEXT_APP_CATEGORIES = ['TextEditor', 'Development', 'Office'];

const normalize = (text) =>
  String(text || '').toLowerCase().replace(/\b(the|app|application|program)\b/g, ' ').replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Apps that open a .txt note: editors, IDEs, word processors (never browsers or viewers)
const opensTextFiles = (app) =>
  app.mimeTypes.includes('text/plain') && app.categories.some((category) => TEXT_APP_CATEGORIES.includes(category));

async function defaultTextEditor() {
  const apps = getInstalledApps();
  const xdgMime = findExecutable(['xdg-mime']);
  if (xdgMime) {
    try {
      const { stdout } = await execFileAsync(xdgMime, ['query', 'default', 'text/plain'], { timeout: 4000 });
      const id = stdout.trim().replace(/\.desktop$/, '');
      const app = id && apps.find((candidate) => candidate.id === id);
      if (app && opensTextFiles(app)) return app;
    } catch {
      // No default registered
    }
  }
  for (const execName of PREFERRED_EDITORS) {
    const app = apps.find((candidate) => candidate.execName === execName);
    if (app) return app;
  }
  return apps.find((candidate) => candidate.categories.includes('TextEditor') && opensTextFiles(candidate)) || null;
}

/**
 * Turns the spoken app name into { label, editor, app? } for this platform.
 */
async function resolveTarget(spoken) {
  const query = normalize(spoken) || 'text editor';
  const alias = EDITOR_ALIASES.has(query);

  if (isWindows || isMac) {
    const editorName = isWindows ? 'Notepad' : 'TextEdit';
    if (alias || query === normalize(editorName)) return { label: editorName, editor: true };
    throw new WriteError(`On this computer I can write into ${editorName}; typing into ${spoken} is only available on Linux so far.`);
  }

  // An installed app with exactly this name wins over the aliases ("gedit" when gedit is installed)
  const matches = findApps(query);
  if (matches[0]?.score >= 95) return { label: matches[0].app.name, editor: alias || opensTextFiles(matches[0].app), app: matches[0].app };
  if (alias) {
    const app = await defaultTextEditor();
    return { label: app?.name || 'the text editor', editor: true, app };
  }

  if (matches.length === 0) throw new WriteError(`No installed application matches "${spoken}".`);
  const [best, runnerUp] = matches;
  if (best.score < 75 && runnerUp && best.score - runnerUp.score < 15) {
    throw new WriteError(`Several installed applications match "${spoken}": ${matches.map((m) => m.app.name).join(', ')}. Ask the operator which one.`);
  }
  return { label: best.app.name, editor: opensTextFiles(best.app), app: best.app };
}

function notesDir() {
  for (const candidate of NOTES_DIRS) {
    try {
      const dir = resolveSafePath(candidate);
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch (err) {
      if (!(err instanceof SandboxError)) throw err;
    }
  }
  throw new WriteError('There is no allowed folder (Documents or Desktop) to keep the note in.');
}

// "hello-world-2026-10-04-140509.txt" from the title, or the first words of the text
function noteFileName(title, text) {
  const words = String(title || text).replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
  let slug = words.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  if (slug.length > 40) slug = slug.slice(0, 40).replace(/-[^-]*$/, '');
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${slug || 'note'}-${stamp}`;
}

/**
 * Saves a new note (never overwriting anything) and records it for undo.
 */
function saveNote(content, title, nameSource) {
  const dir = notesDir();
  const base = noteFileName(title, nameSource);
  for (let n = 1; ; n++) {
    const file = path.join(/*turbopackIgnore: true*/ dir, `${base}${n > 1 ? `-${n}` : ''}.txt`);
    try {
      fs.writeFileSync(/*turbopackIgnore: true*/ file, content, { flag: 'wx' });
    } catch (err) {
      if (err.code === 'EEXIST') continue;
      throw err;
    }
    pushUndo(`created ${displayPath(file)}`, 'file_created', { path: file, ...fileStamp(file) });
    return file;
  }
}

async function openInEditor(target, file) {
  if (isWindows) return launchDetached('notepad.exe', [file]);
  if (isMac) return launchDetached('open', ['-a', 'TextEdit', file]);
  if (target.app) {
    const launched = await launchDesktopApp(target.app, [file]);
    if (launched.success) return launched;
  }
  return openWithDefaultApp(file);
}

const launchExtras = (launched) => (launched.dryRun ? { dry_run: true, command: launched.command } : {});

async function documentHandoff(target, text, title, fallbackReason) {
  const file = saveNote(text.endsWith('\n') ? text : `${text}\n`, title, text);
  const launched = await openInEditor(target, file);
  const where = displayPath(file);
  return {
    success: launched.success,
    mode: 'document',
    app: target.label,
    path: where,
    chars: text.length,
    message: launched.success
      ? `Opened ${target.label} with the text, saved as ${where}. "Undo" removes the note.`
      : `Saved the text as ${where}, but ${target.label} did not open: ${launched.error}`,
    ...(fallbackReason ? { note: fallbackReason } : {}),
    ...launchExtras(launched),
  };
}

/**
 * write_in_app: { app, text, title?, method: auto | document | type }.
 * Document mode finishes here; type mode returns { mode: 'type', wait_ms } and the HUD tool types
 * once the app is in front.
 */
export async function writeInApp({ app: spoken, text, title, method = 'auto' } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new WriteError('There is no text to write.');
  if (text.length > MAX_NOTE_CHARS) throw new WriteError(`That is too much text for one note (over ${MAX_NOTE_CHARS.toLocaleString('en')} characters).`);
  const target = await resolveTarget(spoken);
  const wantsTyping = method === 'type' || !target.editor;
  if (!wantsTyping) return documentHandoff(target, text, title);

  // Keystrokes: editors fall back to a note whenever typing is not possible
  const fallback = (reason) => {
    if (target.editor) return documentHandoff(target, text, title, reason);
    throw new WriteError(reason);
  };
  if (!isLinux) return fallback(`Typing into ${target.label} is only available on Linux so far.`);
  if (text.length > MAX_TYPED_CHARS) return fallback(`That is too long to type key by key (over ${MAX_TYPED_CHARS} characters).`);
  let backend;
  try {
    backend = await prepareKeyboard();
  } catch (err) {
    if (err instanceof InputError) return fallback(err.message);
    throw err;
  }

  // An editor gets a fresh empty note to type into, so nothing lands in a file already open
  let launched;
  let notePath = null;
  if (target.editor) {
    const file = saveNote('', title, text);
    notePath = displayPath(file);
    launched = await openInEditor(target, file);
  } else {
    launched = await launchDesktopApp(target.app);
  }
  if (!launched.success) throw new WriteError(`${target.label} did not open: ${launched.error}`);
  return {
    success: true,
    mode: 'type',
    app: target.label,
    backend,
    wait_ms: TYPE_DELAY_MS,
    message: `Opened ${target.label}; typing once it is in front.`,
    ...(notePath ? { path: notePath } : {}),
    ...launchExtras(launched),
  };
}
