import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { waitForAppWindow } from '@/lib/appLauncher';
import { findExecutable, isLinux, isWindows, launchDetached } from '@/lib/desktopLauncher';
import { pickWindow, rememberTarget, scoreWindow, windowLabel } from '@/lib/desktopTarget';
import { renderDocx } from '@/lib/documentForge';
import { displayPath, resolveSafePath, SandboxError } from '@/lib/fsSandbox';
import { desktopWindows, ensureFocused, InputError, pressInFocused, typeIntoFocused, windowSupport } from '@/lib/inputControl';
import { fileStamp, pushUndo } from '@/lib/undoJournal';
import { winCall, WinHostError } from '@/lib/winDesktop';

/**
 * Word, Excel, and PowerPoint for Jarvis (Phase 15, live tool `office`).
 * Windows: Microsoft Office through COM (lib/winDesktop.js), attached to the copy already open or a
 * new visible one: exact text at the cursor, cells and tables, new slides, reading the open
 * document, saving. The app's window is brought to the front so the operator sees the change.
 * Linux: LibreOffice Writer / Calc / Impress. New documents with content are written as files and
 * opened; edits in an open document are focus-checked keystrokes (cells via Tab / Enter, a slide
 * via Ctrl+M). Reading a live LibreOffice document is not available (its saved file can be read).
 */

export class OfficeError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const OFFICE_TIMEOUT_MS = 60000;
const DOCUMENTS_DIRS = ['~/Documents/Ultron Documents', '~/Desktop/Ultron Documents'];

const APP_NAMES = {
  word: 'word', 'microsoft word': 'word', document: 'word', doc: 'word', docx: 'word', writer: 'word', 'libreoffice writer': 'word',
  excel: 'excel', 'microsoft excel': 'excel', spreadsheet: 'excel', sheet: 'excel', workbook: 'excel', calc: 'excel', xlsx: 'excel', 'libreoffice calc': 'excel',
  powerpoint: 'powerpoint', 'power point': 'powerpoint', 'microsoft powerpoint': 'powerpoint', presentation: 'powerpoint', slides: 'powerpoint',
  slide: 'powerpoint', deck: 'powerpoint', ppt: 'powerpoint', pptx: 'powerpoint', impress: 'powerpoint', 'libreoffice impress': 'powerpoint',
};
const EXTENSIONS = { word: '.docx', excel: '.xlsx', powerpoint: '.pptx' };
const SAVE_TYPES = { word: ['.docx', '.doc', '.pdf', '.txt', '.rtf', '.odt'], excel: ['.xlsx', '.xlsm', '.xls', '.csv', '.ods', '.pdf'], powerpoint: ['.pptx', '.ppt', '.pdf', '.odp'] };
const WINDOWS_LABELS = { word: 'Word', excel: 'Excel', powerpoint: 'PowerPoint' };
const LINUX_LABELS = { word: 'LibreOffice Writer', excel: 'LibreOffice Calc', powerpoint: 'LibreOffice Impress' };
const LINUX_FLAGS = { word: '--writer', excel: '--calc', powerpoint: '--impress' };
const ODF = new Set(['.odt', '.ods', '.odp']);

export const OFFICE_ACTIONS = ['status', 'new', 'open', 'write_text', 'write_cells', 'add_slide', 'read', 'save', 'save_as', 'close'];

function normalizeApp(spoken) {
  const key = String(spoken || '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return APP_NAMES[key] || null;
}

const labelFor = (app) => (isWindows ? WINDOWS_LABELS : LINUX_LABELS)[app];

// "Report" -> "~/Documents/Report.docx" when no folder or extension is given
function resolveDocumentPath(input, app, { mustExist }) {
  if (!input) throw new OfficeError('A file path is needed.');
  let candidate = String(input).trim();
  if (!/[\\/]/.test(candidate)) candidate = `~/Documents/${candidate}`;
  if (!mustExist && !path.extname(candidate)) candidate += EXTENSIONS[app];
  const resolved = resolveSafePath(candidate);
  if (mustExist && !fs.existsSync(/*turbopackIgnore: true*/ resolved)) throw new OfficeError(`${displayPath(resolved)} does not exist.`);
  if (!mustExist) {
    const ext = path.extname(resolved).toLowerCase();
    if (!SAVE_TYPES[app].includes(ext)) throw new OfficeError(`${labelFor(app)} can save as ${SAVE_TYPES[app].join(', ')}, not ${ext}.`);
    fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(resolved), { recursive: true });
  }
  return resolved;
}

const rowsOf = (params) =>
  (Array.isArray(params.rows) ? params.rows : String(params.rows || params.text || '').split(/\r?\n/))
    .map((row) => String(row))
    .filter((row) => row.trim().length);

// ------------------------------------------------------------------------------------- Windows

async function office(args) {
  try {
    return await winCall('office', args, { timeout: OFFICE_TIMEOUT_MS });
  } catch (err) {
    if (err instanceof WinHostError) throw new OfficeError(err.message);
    throw err;
  }
}

// Brings the Office window forward so the operator sees the change; remembered for "now type...".
// The handle Office reports is tried first; PowerPoint's is not its visible window, so the app's
// window is then found by document name ("Presentation1 - PowerPoint").
async function showWindow(handle, app, documentName) {
  try {
    if (handle) {
      const focused = await winCall('focus', { handle });
      if (focused.foreground) {
        const win = (await desktopWindows()).find((w) => w.id === String(handle));
        if (win) rememberTarget(win, labelFor(app));
        return true;
      }
    }
    const windows = await desktopWindows();
    const base = String(documentName || '').replace(/\.[a-z]+$/i, '').toLowerCase();
    const owned = windows.filter((w) => scoreWindow(w, WINDOWS_LABELS[app]) >= 85);
    const win = owned.find((w) => base && w.title.toLowerCase().includes(base)) || owned[0];
    if (!win) return false;
    await ensureFocused(win);
    return true;
  } catch {
    return false;
  }
}

async function windowsOffice(action, app, params) {
  if (action === 'status') {
    const { apps } = await office({ action: 'status' });
    const lines = Object.entries(apps).map(([name, s]) =>
      `${WINDOWS_LABELS[name]}: ${!s.installed ? 'not installed' : s.running ? `open${s.documents.length ? ` (${s.documents.join(', ')})` : ' (no documents)'}` : 'installed, not open'}`
    );
    return { success: true, message: lines.join('; '), apps };
  }

  const label = WINDOWS_LABELS[app];
  const args = { action, app };
  if (action === 'open') args.path = resolveDocumentPath(params.path, app, { mustExist: true });
  if (action === 'save_as') {
    args.path = resolveDocumentPath(params.path, app, { mustExist: false });
    if (fs.existsSync(/*turbopackIgnore: true*/ args.path) && !params.overwrite) {
      throw new OfficeError(`${displayPath(args.path)} already exists. Ask the operator before replacing it (then pass overwrite).`);
    }
  }
  if (action === 'write_text') {
    if (!params.text) throw new OfficeError('There is no text to write.');
    Object.assign(args, { text: String(params.text), position: params.position === 'end' ? 'end' : 'cursor' });
  }
  if (action === 'write_cells') {
    const rows = rowsOf(params);
    if (rows.length === 0) throw new OfficeError('There are no rows to write (one string per row, cells separated by |).');
    Object.assign(args, { rows, ...(params.cell ? { cell: String(params.cell) } : {}), ...(params.sheet ? { sheet: String(params.sheet) } : {}) });
  }
  if (action === 'add_slide') Object.assign(args, { title: params.title || '', text: params.text || '' });
  if (action === 'close') args.discard = Boolean(params.discard_changes);

  const existed = action === 'save_as' && fs.existsSync(/*turbopackIgnore: true*/ args.path);
  const result = await office(args);
  const shown = ['read', 'save', 'close'].includes(action) ? null : await showWindow(result.window, app, result.document);
  if (action === 'save_as' && !existed) pushUndo(`created ${displayPath(args.path)}`, 'file_created', { path: args.path, ...fileStamp(args.path) });

  const doc = result.document ? `"${result.document}"` : 'the document';
  const front = shown === false ? ` (I could not bring ${label} to the front)` : '';
  const messages = {
    new: `Opened a new ${label} ${app === 'excel' ? 'workbook' : app === 'powerpoint' ? 'presentation' : 'document'} (${doc})${front}.`,
    open: `Opened ${displayPath(args.path || '')} in ${label}${result.protected_view ? ' in Protected View (editing stays off until the operator clicks Enable Editing)' : ''}${front}.`,
    write_text: `Wrote ${result.chars} characters into ${doc} in ${label}${front}.`,
    write_cells: `Filled ${result.range} on sheet "${result.sheet}" in ${doc}${front}.`,
    add_slide: `Added slide ${result.slide} to ${doc}${front}.`,
    read: `Read ${doc} in ${label}.`,
    save: `Saved ${doc}.`,
    save_as: `Saved ${doc} as ${displayPath(args.path || '')}.`,
    close: `Closed ${doc}${result.quit ? ` and ${label}, which had no other documents open` : ''}.`,
  };
  const { window: _window, ...details } = result;
  return { success: true, message: messages[action], ...details, ...(args.path ? { path: displayPath(args.path) } : {}) };
}

// --------------------------------------------------------------------------------------- Linux

const soffice = () => findExecutable(['soffice', 'libreoffice']);

async function linuxDocumentWindow(app) {
  const windows = await desktopWindows();
  return pickWindow(windows, LINUX_LABELS[app]) || pickWindow(windows, `libreoffice-${{ word: 'writer', excel: 'calc', powerpoint: 'impress' }[app]}`);
}

async function requireLinuxWindow(app) {
  const target = await linuxDocumentWindow(app);
  if (!target) throw new OfficeError(`No ${LINUX_LABELS[app]} window is open. Open or create a document first.`);
  await ensureFocused(target);
  return target;
}

function documentsDir() {
  for (const candidate of DOCUMENTS_DIRS) {
    try {
      const dir = resolveSafePath(candidate);
      fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
      return dir;
    } catch (err) {
      if (!(err instanceof SandboxError)) throw err;
    }
  }
  throw new OfficeError('There is no allowed folder (Documents or Desktop) to create the document in.');
}

// New documents with content are written as files (exact, saved) and then opened in LibreOffice
async function createLinuxFile(app, params) {
  const name = String(params.title || (app === 'excel' ? 'Spreadsheet' : 'Document')).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Document';
  const dir = documentsDir();
  let file;
  for (let n = 1; ; n++) {
    file = path.join(/*turbopackIgnore: true*/ dir, `${name}${n > 1 ? ` ${n}` : ''}${EXTENSIONS[app]}`);
    if (!fs.existsSync(/*turbopackIgnore: true*/ file)) break;
  }
  if (app === 'word') {
    fs.writeFileSync(/*turbopackIgnore: true*/ file, await renderDocx({ title: params.title || '', markdown: String(params.text || '') }), { flag: 'wx' });
  } else {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(params.sheet || 'Sheet1');
    for (const row of rowsOf(params)) sheet.addRow(row.split(/\s*\|\s*/).map((cell) => (/^[+-]?0\d+$/.test(cell.trim()) || /%$/.test(cell.trim()) ? cell : /^[+-]?\d+(\.\d+)?$/.test(cell.trim()) ? Number(cell.trim()) : cell)));
    await workbook.xlsx.writeFile(file);
  }
  pushUndo(`created ${displayPath(file)}`, 'file_created', { path: file, ...fileStamp(file) });
  return file;
}

async function openInLibreOffice(app, args) {
  const bin = soffice();
  if (!bin) throw new OfficeError('LibreOffice is not installed (sudo apt install libreoffice).');
  const before = new Set((await desktopWindows()).map((w) => w.id));
  const launched = await launchDetached(bin, args);
  if (!launched.success) throw new OfficeError(`LibreOffice did not start: ${launched.error}`);
  if (launched.dryRun) return null;
  const win = await waitForAppWindow({ name: LINUX_LABELS[app], execName: `libreoffice-${{ word: 'writer', excel: 'calc', powerpoint: 'impress' }[app]}` }, before, { timeout: 20000 });
  if (win) await ensureFocused(win).catch(() => {});
  return win;
}

// "B3" -> { col: 1, row: 2 }
function cellOffset(cell) {
  const match = String(cell || '').trim().toUpperCase().match(/^([A-Z]{1,3})(\d{1,7})$/);
  if (!match) throw new OfficeError(`"${cell}" is not a cell like A1 or C12.`);
  const col = match[1].split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  return { col, row: Number(match[2]) - 1 };
}

async function pressRepeatedly(key, times) {
  for (let i = 0; i < times; i++) await pressInFocused(key);
}

async function linuxOffice(action, app, params) {
  const support = await windowSupport();
  if (action === 'status') {
    const installed = Boolean(soffice());
    let open = [];
    if (support.available) {
      const windows = await desktopWindows();
      open = Object.keys(LINUX_LABELS).filter((key) => pickWindow(windows, LINUX_LABELS[key])).map((key) => LINUX_LABELS[key]);
    }
    return {
      success: true,
      message: installed ? `LibreOffice is installed${open.length ? `; open: ${open.join(', ')}` : ''}.` : 'LibreOffice is not installed (sudo apt install libreoffice).',
      installed,
      open,
    };
  }
  if (!support.available) throw new OfficeError(`Office editing needs window control on this session. ${support.reason}`);
  const label = LINUX_LABELS[app];

  switch (action) {
    case 'new': {
      if ((app === 'word' && params.text) || (app === 'excel' && (params.rows || params.text))) {
        const file = await createLinuxFile(app, params);
        await openInLibreOffice(app, [file]);
        return { success: true, message: `Created ${displayPath(file)} with the content and opened it in ${label}.`, path: displayPath(file) };
      }
      const win = await openInLibreOffice(app, [LINUX_FLAGS[app]]);
      return { success: true, message: `Opened a new ${label} document${win ? '' : ' (its window has not appeared yet)'}.` };
    }
    case 'open': {
      const file = resolveDocumentPath(params.path, app, { mustExist: true });
      await openInLibreOffice(app, [file]);
      return { success: true, message: `Opened ${displayPath(file)} in ${label}.`, path: displayPath(file) };
    }
    case 'write_text': {
      if (!params.text) throw new OfficeError('There is no text to write.');
      const target = await requireLinuxWindow(app);
      if (params.position === 'end') await pressInFocused('ctrl+end');
      const typed = await typeIntoFocused(String(params.text));
      return { success: true, message: `Typed ${typed.chars} characters into "${windowLabel(target)}".`, chars: typed.chars };
    }
    case 'write_cells': {
      if (app !== 'excel') throw new OfficeError('Cells are a spreadsheet (Calc) action.');
      const rows = rowsOf(params);
      if (rows.length === 0) throw new OfficeError('There are no rows to write (one string per row, cells separated by |).');
      const target = await requireLinuxWindow('excel');
      if (params.cell) {
        const { col, row } = cellOffset(params.cell);
        if (col > 200 || row > 2000) throw new OfficeError('That cell is too far away to reach with the keyboard.');
        await pressInFocused('ctrl+home');
        await pressRepeatedly('right', col);
        await pressRepeatedly('down', row);
      }
      // Tab between cells; Enter after a row returns to the column the row started in
      const typed = rows.map((row) => row.split(/\s*\|\s*/).join('\t')).join('\n') + '\n';
      await typeIntoFocused(typed);
      return { success: true, message: `Typed ${rows.length} row(s) into "${windowLabel(target)}"${params.cell ? ` from ${String(params.cell).toUpperCase()}` : ' at the selected cell'}.` };
    }
    case 'add_slide': {
      if (app !== 'powerpoint') throw new OfficeError('Slides are a presentation (Impress) action.');
      const target = await requireLinuxWindow('powerpoint');
      await pressInFocused('ctrl+m');
      await sleep(500);
      for (const value of [params.title, params.text]) {
        if (!value) continue;
        // Tab selects the next placeholder, Enter starts editing it, Escape leaves it
        await pressInFocused('tab');
        await pressInFocused('enter');
        await typeIntoFocused(String(value));
        await pressInFocused('escape');
      }
      return { success: true, message: `Added a slide in "${windowLabel(target)}" (LibreOffice Impress, by keystrokes).` };
    }
    case 'read':
      throw new OfficeError('Reading a document open in LibreOffice is not available. Save it and ask me to read the file instead.');
    case 'close': {
      const target = await requireLinuxWindow(app);
      await pressInFocused('ctrl+w');
      return { success: true, message: `Asked "${windowLabel(target)}" to close (LibreOffice asks first if there are unsaved changes).` };
    }
    case 'save': {
      const target = await requireLinuxWindow(app);
      await pressInFocused('ctrl+s');
      return { success: true, message: `Saved "${windowLabel(target)}" (if it was never saved, LibreOffice is asking for a file name).` };
    }
    case 'save_as': {
      const file = resolveDocumentPath(params.path, app, { mustExist: false });
      if (fs.existsSync(/*turbopackIgnore: true*/ file) && !params.overwrite) {
        throw new OfficeError(`${displayPath(file)} already exists. Ask the operator before replacing it (then pass overwrite).`);
      }
      const target = await requireLinuxWindow(app);
      const before = fs.existsSync(/*turbopackIgnore: true*/ file) ? fs.statSync(/*turbopackIgnore: true*/ file).mtimeMs : 0;
      await pressInFocused('ctrl+shift+s');
      await sleep(1200);
      await typeIntoFocused(file);
      await pressInFocused('enter');
      const saved = async () => fs.existsSync(/*turbopackIgnore: true*/ file) && fs.statSync(/*turbopackIgnore: true*/ file).mtimeMs !== before;
      for (let i = 0; i < 12 && !(await saved()); i++) await sleep(250);
      // Non-ODF formats ask "keep the format?": Enter keeps it
      if (!(await saved()) && !ODF.has(path.extname(file).toLowerCase())) {
        await pressInFocused('enter');
        for (let i = 0; i < 12 && !(await saved()); i++) await sleep(250);
      }
      if (!(await saved())) return { success: false, message: `LibreOffice did not save ${displayPath(file)}; check its save dialog in "${windowLabel(target)}".` };
      return { success: true, message: `Saved "${windowLabel(target)}" as ${displayPath(file)}.`, path: displayPath(file) };
    }
    default:
      throw new OfficeError(`Unknown office action "${action}". Use: ${OFFICE_ACTIONS.join(', ')}.`);
  }
}

/**
 * office: { action, app, text?, rows?, cell?, sheet?, title?, path?, position?, overwrite? }.
 */
export async function controlOffice(params = {}) {
  const action = String(params.action || 'status');
  if (!OFFICE_ACTIONS.includes(action)) throw new OfficeError(`Unknown office action "${action}". Use: ${OFFICE_ACTIONS.join(', ')}.`);
  const app = action === 'status' ? null : normalizeApp(params.app);
  if (action !== 'status' && !app) throw new OfficeError('Say which Office app: Word, Excel, or PowerPoint.');
  try {
    if (isWindows) return await windowsOffice(action, app, params);
    if (isLinux) return await linuxOffice(action, app, params);
  } catch (err) {
    if (err instanceof InputError || err instanceof SandboxError) throw new OfficeError(err.message);
    throw err;
  }
  throw new OfficeError('Office control is available on Windows and Linux.');
}
