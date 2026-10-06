import { NextResponse } from 'next/server';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';
import { authorizeConfirm, cancelConfirm } from '@/lib/confirmGate';

/**
 * POST /api/confirm-gate
 * Action authorization handler for system confirmation cards.
 * Enforces local loopback origin and mints single-use execution tokens
 * only upon operator confirmation click.
 */
export async function POST(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;

  let body = {};
  try {
    body = await req.json();
  } catch {
    // Empty body
  }

  if (body.action === 'authorize') {
    const token = authorizeConfirm(body.id);
    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Confirmation request not found or expired.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, token });
  }

  if (body.action === 'cancel') {
    return NextResponse.json({ success: true, cancelled: cancelConfirm(body.id) });
  }

  return NextResponse.json(
    { success: false, message: `Unknown confirm-gate action "${body.action}".` },
    { status: 400 }
  );
}
