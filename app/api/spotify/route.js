import { NextResponse } from 'next/server';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';
import { controlSpotify, SpotifyError } from '@/lib/spotifyControl';

/**
 * Next.js 16 App Router Route Handler: POST /api/spotify { action, query? }
 * Drives the Spotify desktop app over MPRIS for the `spotify_control` live tool.
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
    const result = await controlSpotify(body.action, { query: (body.query || '').trim() });
    return NextResponse.json({ success: true, action: body.action, ...result });
  } catch (error) {
    if (error instanceof SpotifyError) {
      return NextResponse.json({ success: false, action: body.action, message: error.message });
    }
    console.error('[/api/spotify] Control failed:', error);
    return NextResponse.json({ success: false, action: body.action, message: `Spotify control failed: ${error.message}` });
  }
}
