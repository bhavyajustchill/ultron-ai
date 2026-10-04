import { NextResponse } from 'next/server';
import { ClipboardError, MIN_TEXT, MAX_TEXT, readClipboard, writeClipboard, looksSecret, hashText, processClipboardText } from '@/lib/clipboard';
import { readVault } from '@/lib/memoryVault';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: /api/clipboard (Phase 8.13)
 * GET ?since=<hash>[&prime=1] — the HUD's watcher: reports a new copy (never secrets);
 * POST { action: read | process | copy } — the panel's buttons and the `clipboard` tool.
 */
export async function GET(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;
  const params = new URL(req.url).searchParams;
  const { text, secretHint } = await readClipboard();
  const trimmed = text.trim();
  const hash = trimmed ? hashText(trimmed) : '';
  // The first poll only records what is already there, so old clipboard contents never pop up
  if (params.get('prime') || hash === params.get('since') || !hash) return NextResponse.json({ success: true, changed: false, hash });
  if (secretHint || looksSecret(trimmed)) return NextResponse.json({ success: true, changed: true, hash, skipped: 'secret' });
  if (trimmed.length < MIN_TEXT) return NextResponse.json({ success: true, changed: true, hash, skipped: 'short' });
  return NextResponse.json({ success: true, changed: true, hash, text: trimmed.slice(0, MAX_TEXT), chars: trimmed.length });
}

export async function POST(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;
  let body = {};
  try {
    body = await req.json();
  } catch {
    // Empty body
  }

  try {
    if (body.action === 'copy') {
      const text = String(body.text || '');
      if (!text) throw new ClipboardError('Nothing to copy.');
      await writeClipboard(text.slice(0, MAX_TEXT));
      // The watcher should not offer Jarvis's own copy back to the operator
      return NextResponse.json({ success: true, message: 'Copied to the clipboard.', hash: hashText(text.slice(0, MAX_TEXT).trim()) });
    }

    // Text from the panel, or the current clipboard when Jarvis is asked by voice
    let text = typeof body.text === 'string' && body.text.trim() ? body.text.trim() : null;
    if (!text) {
      const clip = await readClipboard();
      text = clip.text.trim();
      if (!text) throw new ClipboardError('The clipboard has no text in it.');
      if (clip.secretHint || looksSecret(text)) throw new ClipboardError('The clipboard holds what looks like a password, key, or code, so Ultron will not read it.');
    }

    if (body.action === 'read') {
      return NextResponse.json({ success: true, text: text.slice(0, MAX_TEXT), chars: text.length, message: `The clipboard holds ${text.length} characters of text.` });
    }
    if (body.action === 'process') {
      const apiKey = req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || '';
      const result = await processClipboardText(body.mode, text, apiKey, readVault().profile?.language);
      const copied = body.mode === 'fix';
      if (copied) await writeClipboard(result);
      return NextResponse.json({ success: true, mode: body.mode, result, copied, ...(copied ? { hash: hashText(result.trim()) } : {}), message: copied ? 'Corrected text copied back to the clipboard.' : 'Done.' });
    }
    return NextResponse.json({ success: false, message: 'Use action read, process, or copy.' }, { status: 400 });
  } catch (error) {
    if (error instanceof ClipboardError) return NextResponse.json({ success: false, message: error.message });
    return NextResponse.json({ success: false, message: `Clipboard action failed: ${error.message}` });
  }
}
