import { NextResponse } from 'next/server';
import { checkHardware } from '@/lib/hardwareAlerts';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: GET /api/hardware-alerts (Phase 8.6)
 * Polled by the HUD while linked; returns real sensor readings and any alerts that cleared their
 * streak and cooldown, which Jarvis then says aloud.
 */
export async function GET(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;
  return NextResponse.json({ success: true, ...checkHardware() });
}
