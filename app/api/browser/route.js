import { NextResponse } from 'next/server';
import { BrowserError, runBrowserAction } from '@/lib/browserAgent';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: POST /api/browser (Phase 8.10)
 * { action, ...options } drives the Jarvis browser window (lib/browserAgent.js).
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

  const action = body.action || 'status';
  try {
    const result = await runBrowserAction(action, body);
    return NextResponse.json({ success: true, action, ...result });
  } catch (error) {
    if (error instanceof BrowserError) return NextResponse.json({ success: false, action, message: error.message });
    // Playwright timeouts and missing elements are normal outcomes to report, not server faults
    const message = String(error.message || error).split('\n')[0];
    if (/timeout|strict mode|not visible|detached|navigation|net::/i.test(message)) {
      return NextResponse.json({ success: false, action, message: `The page did not respond as expected: ${message}` });
    }
    console.error(`[/api/browser] ${action} failed:`, error);
    return NextResponse.json({ success: false, action, message: `Browser action failed: ${message}` }, { status: 500 });
  }
}
