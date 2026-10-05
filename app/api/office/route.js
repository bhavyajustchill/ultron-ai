import { NextResponse } from 'next/server';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';
import { controlOffice, OfficeError } from '@/lib/officeControl';

/**
 * Next.js 16 App Router Route Handler: POST /api/office { action, app, ...params }
 * Word / Excel / PowerPoint (Windows, COM) and LibreOffice (Linux) for the `office` live tool.
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
    return NextResponse.json({ action: body.action, ...(await controlOffice(body)) });
  } catch (error) {
    if (error instanceof OfficeError) return NextResponse.json({ success: false, action: body.action, message: error.message });
    console.error('[/api/office] Failed:', error);
    return NextResponse.json({ success: false, action: body.action, message: `Office control error: ${error.message}` }, { status: 500 });
  }
}
