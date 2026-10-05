import path from 'path';
import { rankApps } from '@/lib/appIndex';
import { launchDetached } from '@/lib/desktopLauncher';
import { winCall } from '@/lib/winDesktop';

/**
 * Installed-application index for Windows (Phase 15), the counterpart of lib/appIndex.js.
 * Start menu apps (Get-StartApps: desktop programs and Store apps such as Notepad and Calculator,
 * with the IDs the shell launches them by) plus the App Paths registry (programs registered by
 * executable name, such as WINWORD.EXE). Spoken names are matched with the same scoring as Linux.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
// Start menu entries that are documents, links, or uninstallers rather than apps
const NOT_APPS = /\b(uninstall|readme|read me|release notes|documentation|help|website|license|manual)\b/i;
const DOCUMENT_ID = /\.(url|txt|chm|pdf|html?|rtf|ini|lnk|md)$/i;

// Everyday names that differ from the Start menu name
const ALIASES = {
  notepad: 'notepad',
  'note pad': 'notepad',
  'text editor': 'notepad',
  editor: 'notepad',
  'plain text editor': 'notepad',
  'file explorer': 'file explorer',
  explorer: 'file explorer',
  files: 'file explorer',
  'file manager': 'file explorer',
  'vs code': 'visual studio code',
  vscode: 'visual studio code',
  code: 'visual studio code',
  'command prompt': 'command prompt',
  cmd: 'command prompt',
  terminal: 'terminal',
  'windows terminal': 'terminal',
  calc: 'calculator',
  'task manager': 'task manager',
  'microsoft word': 'word',
  'microsoft excel': 'excel',
  'microsoft powerpoint': 'powerpoint',
  'power point': 'powerpoint',
  edge: 'microsoft edge',
  chrome: 'google chrome',
};

const cache = globalThis.__jarvisWinApps || (globalThis.__jarvisWinApps = { builtAt: 0, apps: [] });

// "Microsoft.Office.WINWORD.EXE.15" -> winword; "...\Notepad++\notepad++.exe" -> notepad++
function execNameOf(appId) {
  const office = appId.match(/\.([A-Za-z0-9]+)\.EXE\.\d+$/i);
  if (office) return office[1].toLowerCase();
  const exe = appId.match(/([^\\/]+)\.exe$/i);
  return exe ? exe[1].toLowerCase() : '';
}

/**
 * The cached app list, rebuilt at most every five minutes.
 */
export async function getWindowsApps() {
  if (Date.now() - cache.builtAt < CACHE_TTL_MS && cache.apps.length) return cache.apps;
  const [start, registered] = await Promise.all([
    winCall('start_apps', {}, { timeout: 20000 }),
    winCall('app_paths', {}, { timeout: 10000 }).catch(() => ({ apps: [] })),
  ]);
  const apps = [];
  const seenExec = new Set();
  for (const entry of start.apps || []) {
    const appId = entry.app_id || '';
    if (!entry.name || !appId || /^https?:/i.test(appId) || DOCUMENT_ID.test(appId) || NOT_APPS.test(entry.name)) continue;
    const execName = execNameOf(appId);
    if (execName) seenExec.add(execName);
    apps.push({ id: appId, name: entry.name, appId, execName, genericName: '', keywords: [], kind: appId.includes('!') ? 'store' : 'desktop' });
  }
  const seenNames = new Set(apps.map((app) => app.name.toLowerCase()));
  for (const entry of registered.apps || []) {
    const execName = path.basename(entry.exe || '', path.extname(entry.exe || '')).toLowerCase();
    if (!execName || seenExec.has(execName) || seenNames.has(execName) || !/\.exe$/i.test(entry.path || '')) continue;
    seenExec.add(execName);
    apps.push({ id: entry.path, name: execName, exePath: entry.path, execName, genericName: '', keywords: [], kind: 'desktop' });
  }
  cache.builtAt = Date.now();
  cache.apps = apps;
  return apps;
}

/**
 * Best matches for a spoken name, best first: [{ app, score }].
 */
export async function findWindowsApps(query, limit = 5) {
  const apps = await getWindowsApps();
  const spoken = String(query || '').toLowerCase().replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const alias = ALIASES[spoken.replace(/^(the|my) /, '').replace(/ (app|application|program)$/, '')];
  const ranked = rankApps(apps, alias || query, limit);
  // An alias that names no installed app falls back to the words as spoken
  return ranked.length || !alias ? ranked : rankApps(apps, query, limit);
}

/**
 * Starts an app the way the Start menu does (shell:AppsFolder works for Store and desktop apps
 * alike); files are opened through the program itself when its executable is known.
 */
export function launchWindowsApp(app, files = []) {
  if (files.length && app.exePath) return launchDetached(app.exePath, files);
  if (app.appId) return launchDetached('explorer.exe', [`shell:AppsFolder\\${app.appId}`]);
  if (app.exePath) return launchDetached(app.exePath, files);
  return Promise.resolve({ success: false, error: `There is no way to start ${app.name}.` });
}
