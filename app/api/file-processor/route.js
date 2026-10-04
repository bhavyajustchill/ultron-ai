import { NextResponse } from 'next/server';
import path from 'path';
import { resolveSafePath, displayPath, SandboxError } from '@/lib/fsSandbox';
import { ProcessError } from '@/lib/fileProcessor/common';
import { IMAGE_EXTENSIONS, processImage } from '@/lib/fileProcessor/images';
import { processPdf } from '@/lib/fileProcessor/pdf';
import { SHEET_EXTENSIONS, processSheet } from '@/lib/fileProcessor/sheets';
import { MEDIA_EXTENSIONS, processMedia } from '@/lib/fileProcessor/media';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: POST /api/file-processor (Phase 8.9)
 * { path, action, ...options } inside the sandbox; the file type picks the processor.
 * Results are written next to the source under new names and can be undone.
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

  try {
    const target = resolveSafePath(body.path);
    const ext = path.extname(target).slice(1).toLowerCase();
    const apiKey = req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || '';
    const action = String(body.action || 'info');
    let result;
    if (IMAGE_EXTENSIONS.includes(ext)) result = await processImage(action, target, body, apiKey);
    else if (ext === 'pdf') result = await processPdf(action, target, body, apiKey);
    else if (SHEET_EXTENSIONS.includes(ext)) result = await processSheet(action, target, body);
    else if (MEDIA_EXTENSIONS.includes(ext)) result = await processMedia(action, target, body, apiKey);
    else throw new ProcessError(`${displayPath(target)} is not a file type Jarvis can process (images, PDFs, CSV / Excel, audio, video).`);
    return NextResponse.json({ success: true, action, path: displayPath(target), ...result, ...(result.output ? { output: displayPath(result.output) } : {}) });
  } catch (error) {
    if (error instanceof SandboxError || error instanceof ProcessError) return NextResponse.json({ success: false, message: error.message });
    console.error('[/api/file-processor] failed:', error);
    return NextResponse.json({ success: false, message: `File processing failed: ${error.message}` }, { status: 500 });
  }
}
