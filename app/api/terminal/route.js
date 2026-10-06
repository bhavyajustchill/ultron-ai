import { NextResponse } from 'next/server';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';
import { prepareCommand, authorizeCommand, runCommand, cancelCommand, TerminalError } from '@/lib/terminalRunner';

/**
 * Next.js 16 App Router Route Handler: POST /api/terminal
 *   { action: 'prepare', command, cwd?, reason?, background? } -> staged request (+ needs_confirmation)
 *   { action: 'authorize', id }                                   -> authorizes staged command & mints execution token
 *   { action: 'run', id, token, confirmed? }                      -> executes exactly the staged command
 *   { action: 'cancel', id }                                       -> discards a staged command
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
    if (body.action === 'prepare') {
      return NextResponse.json({ success: true, request: prepareCommand(body) });
    }
    if (body.action === 'authorize') {
      return NextResponse.json({ success: true, token: authorizeCommand(body.id) });
    }
    if (body.action === 'run') {
      return NextResponse.json({ success: true, result: await runCommand(body) });
    }
    if (body.action === 'cancel') {
      return NextResponse.json({ success: true, cancelled: cancelCommand(body.id) });
    }

    return NextResponse.json({ success: false, message: `Unknown terminal action "${body.action}".` }, { status: 400 });
  } catch (error) {
    if (error instanceof TerminalError) {
      return NextResponse.json({ success: false, message: error.message });
    }
    console.error('[/api/terminal] Failed:', error);
    return NextResponse.json({ success: false, message: `Terminal error: ${error.message}` }, { status: 500 });
  }
}
