import { NextResponse } from 'next/server';
import { wakewordStatus, installWakewordModels, removeWakewordModels } from '@/lib/wakeWord/models';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: /api/wakeword (Phase 8.12)
 * GET: whether the offline "Hey Jarvis" models are installed. POST { action: install | remove }.
 */
export async function GET() {
  return NextResponse.json({ success: true, ...wakewordStatus() });
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
    if (body.action === 'remove') return NextResponse.json({ success: true, ...removeWakewordModels(), message: 'Offline wake word models removed.' });
    if (body.action === 'install') return NextResponse.json({ success: true, ...(await installWakewordModels()), message: 'Offline "Hey Jarvis" is installed.' });
    return NextResponse.json({ success: false, message: 'Use action install or remove.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message });
  }
}
