import fs from 'fs';
import path from 'path';

/**
 * Folder organizer for Jarvis (Phase 7.1): sorts the top-level files of a folder into
 * file-type sub-folders, or month folders by modification date (Phase 8.3). Every applied run writes an undo manifest so it can be reversed.
 * Sub-folders, hidden files, symlinks, and unfinished downloads are never touched;
 * `skipped` lists loose files deliberately left in place.
 */

const CATEGORY_EXTENSIONS = {
  Images: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'tif', 'tiff', 'ico', 'avif', 'psd', 'raw'],
  Videos: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'm4v', 'mpeg', 'mpg', '3gp'],
  Audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'opus', 'wma', 'aiff'],
  Documents: ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'epub', 'pages', 'tex'],
  Spreadsheets: ['xls', 'xlsx', 'ods', 'csv', 'tsv', 'numbers'],
  Presentations: ['ppt', 'pptx', 'odp', 'key'],
  Archives: ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'zst'],
  Code: [
    'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'php',
    'html', 'css', 'scss', 'json', 'yaml', 'yml', 'xml', 'sh', 'sql', 'dart', 'kt', 'swift', 'ipynb',
  ],
  Installers: ['deb', 'rpm', 'appimage', 'exe', 'msi', 'dmg', 'pkg', 'apk', 'snap', 'flatpakref', 'iso'],
  Fonts: ['ttf', 'otf', 'woff', 'woff2'],
  '3D Models': ['glb', 'gltf', 'obj', 'fbx', 'stl', 'blend', 'dae', '3ds', 'ply', 'usdz'],
};
const FALLBACK_CATEGORY = 'Others';

// Browsers write these while a download is still in progress
const PARTIAL_DOWNLOAD_EXTENSIONS = new Set(['part', 'crdownload', 'download', 'partial', 'tmp', 'opdownload']);

const EXTENSION_TO_CATEGORY = new Map(
  Object.entries(CATEGORY_EXTENSIONS).flatMap(([category, exts]) => exts.map((ext) => [ext, category]))
);

/**
 * Picks a destination file name that collides neither with disk nor with earlier planned moves.
 */
function uniqueDestination(destDir, fileName, claimed) {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let candidate = path.join(/*turbopackIgnore: true*/ destDir, fileName);
  for (let n = 1; fs.existsSync(candidate) || claimed.has(candidate); n++) {
    candidate = path.join(/*turbopackIgnore: true*/ destDir, `${stem} (${n})${ext}`);
  }
  claimed.add(candidate);
  return candidate;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "2026-10 October": sorts chronologically and still reads naturally
function monthFolder(mtime) {
  return `${mtime.getFullYear()}-${String(mtime.getMonth() + 1).padStart(2, '0')} ${MONTH_NAMES[mtime.getMonth()]}`;
}

/**
 * Builds the move plan for a folder without touching the disk. `groupBy` is "type" or "date".
 */
export function planOrganize(folder, groupBy = 'type') {
  const moves = [];
  const skipped = [];
  const claimed = new Set();

  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;

    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (PARTIAL_DOWNLOAD_EXTENSIONS.has(ext)) {
      skipped.push(entry.name);
      continue;
    }

    const category =
      groupBy === 'date'
        ? monthFolder(fs.statSync(path.join(/*turbopackIgnore: true*/ folder, entry.name)).mtime)
        : EXTENSION_TO_CATEGORY.get(ext) || FALLBACK_CATEGORY;
    const destDir = path.join(/*turbopackIgnore: true*/ folder, category);
    if (fs.existsSync(destDir) && !fs.statSync(destDir).isDirectory()) {
      skipped.push(entry.name); // a file already occupies the category folder's name
      continue;
    }
    moves.push({
      from: path.join(folder, entry.name),
      to: uniqueDestination(destDir, entry.name, claimed),
      category,
    });
  }

  const summary = {};
  for (const move of moves) {
    summary[move.category] = (summary[move.category] || 0) + 1;
  }

  return { folder, moves, skipped, summary };
}

/**
 * Executes a plan and records an undo manifest in journalDir (written even if a move fails midway).
 */
export function applyOrganize(plan, journalDir) {
  const manifest = {
    id: `organize-${Date.now()}`,
    folder: plan.folder,
    createdAt: new Date().toISOString(),
    createdDirs: [],
    moves: [],
  };

  try {
    for (const move of plan.moves) {
      const destDir = path.dirname(move.to);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
        manifest.createdDirs.push(destDir);
      }
      if (fs.existsSync(move.to)) continue; // appeared since planning; leave the source alone
      fs.renameSync(move.from, move.to);
      manifest.moves.push({ from: move.from, to: move.to });
    }
  } finally {
    fs.mkdirSync(journalDir, { recursive: true });
    fs.writeFileSync(path.join(journalDir, `${manifest.id}.json`), JSON.stringify(manifest, null, 2), 'utf-8');
  }

  return manifest;
}

/**
 * Reverses the most recent organize run (optionally limited to one folder, or one run by `id`).
 * Files go back to their original names unless that name has since been taken.
 */
export function undoLastOrganize(journalDir, folder, id) {
  if (!fs.existsSync(journalDir)) return null;

  const manifests = fs
    .readdirSync(journalDir)
    .filter((name) => name.startsWith('organize-') && name.endsWith('.json'))
    .sort()
    .reverse()
    .map((name) => ({ file: path.join(journalDir, name), data: JSON.parse(fs.readFileSync(path.join(journalDir, name), 'utf-8')) }));

  const target = manifests.find((m) => !m.data.undoneAt && (id ? m.data.id === id : !folder || m.data.folder === folder));
  if (!target) return null;

  let restored = 0;
  let missing = 0;
  const claimed = new Set();
  for (const move of [...target.data.moves].reverse()) {
    if (!fs.existsSync(move.to)) {
      missing++;
      continue;
    }
    const destination = fs.existsSync(move.from)
      ? uniqueDestination(path.dirname(move.from), path.basename(move.from), claimed)
      : move.from;
    fs.renameSync(move.to, destination);
    restored++;
  }

  // Only remove category folders this run created, and only if they are now empty
  for (const dir of target.data.createdDirs) {
    try {
      fs.rmdirSync(dir);
    } catch {
      // Not empty (operator added files since) — leave it
    }
  }

  target.data.undoneAt = new Date().toISOString();
  fs.writeFileSync(target.file, JSON.stringify(target.data, null, 2), 'utf-8');

  return { id: target.data.id, folder: target.data.folder, restored, missing };
}
