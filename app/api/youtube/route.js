import { NextResponse } from 'next/server';
import { searchYouTube } from '@/lib/youtubeSearch';

/**
 * Next.js 16 App Router Route Handler: GET /api/youtube?q=...
 * Returns up to 10 playable videos ({ id, title, channel, duration, live }) for the HUD player.
 */
export async function GET(req) {
  const query = (new URL(req.url).searchParams.get('q') || '').trim();
  if (!query) {
    return NextResponse.json({ success: false, message: 'A search query (q) is required.' }, { status: 400 });
  }
  try {
    const videos = await searchYouTube(query);
    return NextResponse.json({ success: true, query, videos });
  } catch (error) {
    console.error('[/api/youtube] Search failed:', error);
    return NextResponse.json({ success: false, query, videos: [], message: `YouTube search failed: ${error.message}` });
  }
}
