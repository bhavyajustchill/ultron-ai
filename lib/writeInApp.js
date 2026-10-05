import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { findApps, getInstalledApps, launchDesktopApp } from '@/lib/appIndex';
import { findOpenWindow, openApp, waitForAppWindow } from '@/lib/appLauncher';
import { findExecutable, isLinux, isMac, isWindows, launchDetached, openWithDefaultApp } from '@/lib/desktopLauncher';
import { isHudWindow, rememberTarget, windowLabel } from '@/lib/desktopTarget';
import { displayPath, resolveSafePath, SandboxError } from '@/lib/fsSandbox';
import { desktopWindows, ensureFocused, InputError, MAX_TYPED_CHARS, prepareKeyboard, terminalApproval, typeIntoFocused, windowSupport } from '@/lib/inputControl';
import { fileStamp, pushUndo } from '@/lib/undoJournal';

/**
 * "Open notepad and type hello world" / "now in Notepad type hello" (Phase 9.1, typing-first since
 * Phase 15; live tool `write_in_app`), on Windows and Linux.
 * Typing (the default): if the app is already open, its window is used; otherwise the app is
 * opened. The window is brought to the front if it is not there, checked to really be in front,
 * and only then typed into (never the HUD, a password box, or, without the operator's click on the
 * HUD card, a terminal). Linux text editors that have to be opened get a fresh empty note to type
 * into, so nothing lands in a file already open.
 * Document mode ("save it as a note", or whenever typing is not possible in an editor): the text is
 * saved as a note in ~/Documents/Ultron Notes and opened in the editor, exact and undoable.
 * On Linux without window control (Wayland without the Window Calls extension) the app is opened and
 * the HUD tool types once the HUD loses focus (the Phase 9.1 behaviour).
 */

export class WriteError extends Error {}

const execFileAsync = promisify(execFile);
const NOTES_DIRS = [process.env.JARVIS_NOTES_DIR, '~/Documents/Ultron Notes', '~/Desktop/Ultron Notes'].filter(Boolean);
const MAX_NOTE_CHARS = 200000;
// Launch to first keystroke when Jarvis cannot see windows: long enough for most apps to take focus
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

const isEditorAlias = (spoken) => EDITOR_ALIASES.has(normalize(spoken) || 'text editor');

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
 * The editor a note opens in: { label, editor, app? } (Linux resolves the installed app).
 */
async function noteTarget(spoken) {
  const query = normalize(spoken) || 'text editor';
  const alias = EDITOR_ALIASES.has(query);

  if (isWindows || isMac) {
    const editorName = isWindows ? 'Notepad' : 'TextEdit';
    if (alias || query === normalize(editorName)) return { label: editorName, editor: true };
    throw new WriteError(`A saved note opens in ${editorName}; for ${spoken}, have it typed instead (or use the office tool for Word, Excel, and PowerPoint).`);
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
 * Linux without window control: open the app (editors: a fresh empty note) and let the HUD type once
 * the HUD loses focus. Returns { mode: 'type', wait_ms }.
 */
async function launchForClientTyping(spoken, text, title, backend) {
  const target = await noteTarget(spoken);
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

/**
 * Opens the app for typing and returns its window. Linux editors get a fresh empty note.
 */
async function openForTyping(spoken, text, title) {
  if (isLinux && isEditorAlias(spoken)) {
    const target = await noteTarget(spoken);
    const before = new Set((await desktopWindows()).map((w) => w.id));
    const file = saveNote('', title, text);
    const launched = await openInEditor(target, file);
    if (!launched.success) throw new WriteError(`${target.label} did not open: ${launched.error}`);
    if (launched.dryRun) return { dryRun: true, label: target.label, command: launched.command };
    const window = await waitForAppWindow({ name: target.app?.name || target.label, execName: target.app?.execName || '' }, before);
    return { window, label: target.label, notePath: displayPath(file) };
  }
  const opened = await openApp(spoken, { focus: false });
  if (opened.ambiguous) throw new WriteError(opened.message);
  if (!opened.success) throw new WriteError(opened.message);
  if (opened.dry_run) return { dryRun: true, label: opened.app, command: opened.command };
  return { window: opened.window || null, label: opened.app };
}

/**
 * write_in_app: { app, text, title?, method: auto | type | document, hud_title? }.
 */
export async function writeInApp({ app: spoken, text, title, method = 'auto', hud_title: hudTitle } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new WriteError('There is no text to write.');
  if (text.length > MAX_NOTE_CHARS) throw new WriteError(`That is too much text for one note (over ${MAX_NOTE_CHARS.toLocaleString('en')} characters).`);
  const editor = isEditorAlias(spoken);
  if (method === 'document') return documentHandoff(await noteTarget(spoken), text, title);

  // Keystrokes: editors fall back to a saved note whenever typing is not possible
  const fallback = async (reason) => {
    if (editor) return documentHandoff(await noteTarget(spoken), text, title, reason);
    throw new WriteError(reason);
  };
  if (!isWindows && !isLinux) return fallback('Typing into apps is available on Windows and Linux.');
  if (text.length > (isWindows ? MAX_TYPED_CHARS : 2000)) return fallback('That is too long to type key by key.');

  let backend;
  try {
    backend = await prepareKeyboard();
  } catch (err) {
    if (err instanceof InputError) return fallback(err.message);
    throw err;
  }

  const support = await windowSupport();
  if (!support.available) return launchForClientTyping(spoken, text, title, backend);

  // The app's window: already open, or opened now
  const notHud = (w) => !isHudWindow(w, hudTitle);
  let target = await findOpenWindow(spoken, { hudFilter: notHud });
  let opened = null;
  if (!target) {
    opened = await openForTyping(spoken, text, title);
    if (opened.dryRun) return { success: true, mode: 'type', app: opened.label, dry_run: true, command: opened.command, message: `Dry run: would open ${opened.label} and type.` };
    target = opened.window;
    if (!target) return fallback(`${opened.label} opened, but its window did not appear in time, so nothing was typed.`);
  }

  const request = terminalApproval(target, { text }, { action: 'type_text', params: { text, window_id: target.id }, hudTitle });
  if (request) {
    return {
      success: false,
      needs_confirmation: true,
      request,
      message: `Waiting for the operator to authorize typing into "${windowLabel(target)}" on the HUD card.`,
    };
  }

  let focus;
  try {
    focus = await ensureFocused(target);
  } catch (err) {
    if (err instanceof InputError) return fallback(err.message);
    throw err;
  }
  const typed = await typeIntoFocused(text);
  rememberTarget(target, opened?.label || spoken);
  const label = windowLabel(target);
  const how = opened
    ? `Opened ${opened.label}${opened.notePath ? ` with a new note (${opened.notePath}; unsaved until Ctrl+S)` : ''} and typed`
    : focus.was_front
      ? `Typed`
      : `Brought "${label}" to the front${focus.previous ? ` ("${focus.previous}" was in front)` : ''} and typed`;
  return {
    success: true,
    mode: 'type',
    app: opened?.label || target.app,
    window: { id: target.id, title: target.title, app: target.app },
    opened: Boolean(opened),
    was_in_front: focus.was_front,
    chars: typed.chars,
    message: `${how} ${typed.chars} characters${opened || focus.was_front ? ` into "${label}"` : ''}${typed.method === 'paste' ? ' (pasted; your clipboard was put back)' : ''}.`,
    ...(opened?.notePath ? { path: opened.notePath } : {}),
  };
}
