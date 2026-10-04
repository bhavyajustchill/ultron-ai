import { NextResponse } from 'next/server';
import { saveSessionRecap, popLastSession } from '@/lib/sessionRecaps';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: POST /api/sessions (Phase 8.5)
 * { action: "save", turns, apiKey? } recaps a finished conversation (also sent with
 * navigator.sendBeacon when the HUD closes, which cannot set headers, hence the key in the body);
 * { action: "pop" } hands the latest recap to the next greeting, once.
 */
export async function POST(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;

  let body = {};
  try {
    body = JSON.parse(await req.text());
  } catch {
    // Empty or invalid body
  }

  if (body.action === 'pop') {
    return NextResponse.json({ success: true, session: popLastSession() });
  }

  if (body.action === 'save') {
    const apiKey = req.headers.get('x-gemini-api-key') || body.apiKey || process.env.GEMINI_API_KEY || '';
    try {
      const result = await saveSessionRecap(body.turns, apiKey);
      return NextResponse.json({ success: true, ...result });
    } catch (error) {
      console.error('[/api/sessions] recap failed:', error);
      return NextResponse.json({ success: false, message: `Session recap failed: ${error.message}` });
    }
  }

  return NextResponse.json({ success: false, message: `Unknown sessions action "${body.action}".` }, { status: 400 });
}
