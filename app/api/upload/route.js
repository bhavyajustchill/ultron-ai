import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { extractText as extractPdfText } from 'unpdf';
import mammoth from 'mammoth';
import { resolveSafePath, displayPath, SandboxError } from '@/lib/fsSandbox';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_TEXT_CHARS = 60000; // ~15k tokens, leaves room in the 131k live context window
const DEFAULT_UPLOAD_DIR = '~/Documents/Ultron Uploads';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']);
const MODEL_EXTENSIONS = new Set(['glb', 'gltf']);
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'ini', 'cfg', 'conf', 'env', 'yaml', 'yml', 'xml',
  'html', 'htm', 'css', 'scss', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp',
  'cs', 'go', 'rs', 'rb', 'php', 'sh', 'bash', 'sql', 'dart', 'kt', 'swift', 'toml', 'srt', 'vtt',
]);

/**
 * Strips path components and characters that are unsafe in file names, keeping the extension.
 */
function safeFileName(name) {
  const cleaned = path.basename(String(name || 'upload')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  const base = cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : 'upload';
  return base.length > 120 ? base.slice(base.length - 120) : base;
}

function uniquePath(dir, fileName) {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let candidate = path.join(/*turbopackIgnore: true*/ dir, fileName);
  for (let n = 1; fs.existsSync(candidate); n++) {
    candidate = path.join(/*turbopackIgnore: true*/ dir, `${stem} (${n})${ext}`);
  }
  return candidate;
}

async function extractDocumentText(ext, buffer) {
  if (ext === 'pdf') {
    const { text, totalPages } = await extractPdfText(new Uint8Array(buffer), { mergePages: true });
    return { text, pages: totalPages };
  }
  if (ext === 'docx') {
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: value };
  }
  const looksBinary = buffer.subarray(0, 8192).includes(0);
  if (!looksBinary && (TEXT_EXTENSIONS.has(ext) || ext === '')) {
    return { text: buffer.toString('utf-8') };
  }
  return null;
}

/**
 * Next.js 16 App Router Route Handler: POST /api/upload (multipart, field "file")
 * Saves an operator upload into the Jarvis uploads folder (inside the file sandbox) and
 * returns its kind plus extracted text for documents, so the HUD can hand it to Gemini Live.
 */
export async function POST(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;

  const contentLength = parseInt(req.headers.get('content-length') || '', 10);
  if (!Number.isNaN(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { success: false, message: `Upload is larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB upload limit.` },
      { status: 413 }
    );
  }

  let file;
  try {
    file = (await req.formData()).get('file');
  } catch {
    // Not multipart
  }
  if (!file || typeof file === 'string') {
    return NextResponse.json({ success: false, message: 'No file was provided in the "file" field.' }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { success: false, message: `"${file.name}" is larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB upload limit.` },
      { status: 413 }
    );
  }

  try {
    const uploadDir = resolveSafePath(process.env.JARVIS_UPLOAD_DIR || DEFAULT_UPLOAD_DIR);
    fs.mkdirSync(uploadDir, { recursive: true });

    const target = uniquePath(uploadDir, safeFileName(file.name));
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(target, buffer);

    const ext = path.extname(target).slice(1).toLowerCase();
    const saved = {
      success: true,
      name: path.basename(target),
      path: displayPath(target),
      size_bytes: buffer.length,
    };

    if (IMAGE_EXTENSIONS.has(ext)) return NextResponse.json({ ...saved, kind: 'image' });
    if (MODEL_EXTENSIONS.has(ext)) return NextResponse.json({ ...saved, kind: 'model' });

    const extracted = await extractDocumentText(ext, buffer);
    if (!extracted) return NextResponse.json({ ...saved, kind: 'file' });

    const text = extracted.text.replace(/\u0000/g, '').trim();
    return NextResponse.json({
      ...saved,
      kind: 'document',
      text: text.slice(0, MAX_TEXT_CHARS),
      char_count: text.length,
      truncated: text.length > MAX_TEXT_CHARS,
      ...(extracted.pages ? { pages: extracted.pages } : {}),
    });
  } catch (error) {
    if (error instanceof SandboxError) {
      return NextResponse.json({ success: false, message: `Upload folder is not allowed: ${error.message}` }, { status: 400 });
    }
    console.error('[/api/upload] Upload failed:', error);
    return NextResponse.json({ success: false, message: `Upload failed: ${error.message}` }, { status: 500 });
  }
}
