import { NextResponse } from 'next/server';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';
import { controlDesktop, InputError } from '@/lib/inputControl';

/**
 * Next.js 16 App Router Route Handler: POST /api/input { action, ...params }
 * Keyboard, mouse, and window control for the `desktop_input` live tool.
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
    return NextResponse.json({ success: true, action, ...(await controlDesktop(action, params)) });
  } catch (error) {
    if (error instanceof InputError) {
      return NextResponse.json({ success: false, action, message: error.message });
    }
    console.error('[/api/input] Failed:', error);
    return NextResponse.json({ success: false, action, message: `Desktop control error: ${error.message}` }, { status: 500 });
  }
}
