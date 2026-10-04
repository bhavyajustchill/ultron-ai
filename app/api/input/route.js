import { NextResponse } from 'next/server';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';
import { controlDesktop, InputError } from '@/lib/inputControl';
import { SandboxError } from '@/lib/fsSandbox';
import { writeInApp, WriteError } from '@/lib/writeInApp';

/**
 * Next.js 16 App Router Route Handler: POST /api/input { action, ...params }
 * Keyboard, mouse, and window control for the `desktop_input` live tool, and the server half of
 * `write_in_app` (action "write_in_app").
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

  const { action, ...params } = body;
  try {
    if (action === 'write_in_app') return NextResponse.json({ action, ...(await writeInApp(params)) });
    return NextResponse.json({ success: true, action, ...(await controlDesktop(action, params)) });
  } catch (error) {
    if (error instanceof InputError || error instanceof WriteError || error instanceof SandboxError) {
      return NextResponse.json({ success: false, action, message: error.message });
    }
    console.error('[/api/input] Failed:', error);
    return NextResponse.json({ success: false, action, message: `Desktop control error: ${error.message}` }, { status: 500 });
  }
}
