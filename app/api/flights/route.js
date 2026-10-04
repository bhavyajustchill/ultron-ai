import { NextResponse } from 'next/server';
import { FlightError, buildFlightSearch } from '@/lib/flights';
import { groundedSearch } from '@/lib/groundedSearch';
import { openWithDefaultApp } from '@/lib/desktopLauncher';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: POST /api/flights (Phase 8.8)
 * Opens Google Flights on the search and, when grounding is available, adds a short summary.
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

  let search;
  try {
    search = buildFlightSearch(body);
  } catch (error) {
    if (error instanceof FlightError) return NextResponse.json({ success: false, message: error.message });
    throw error;
  }

  const opened = body.open === false ? { success: true, skipped: true } : await openWithDefaultApp(search.url);
  const apiKey = req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || '';
  let summary = null;
  let sources = [];
  if (apiKey) {
    try {
      const grounded = await groundedSearch(`${search.query}: airlines, nonstop options, typical flight time, and the current fare range`, 'price', apiKey);
      summary = grounded.summary;
      sources = grounded.results;
    } catch {
      // No grounding on this key: the live page carries the fares
    }
  }

  return NextResponse.json({
    success: opened.success,
    query: search.query,
    url: search.url,
    summary,
    results: sources,
    message: `${opened.success ? 'Google Flights is open with live fares' : `Could not open the browser (${opened.error}); the link is ${search.url}`} for: ${search.query}.${summary ? ` Summary from a live web search: ${summary}` : ' No live summary is available on this key, so point the operator to the fares on screen instead of quoting prices from memory.'}`,
    ...(opened.dryRun ? { dry_run: true, command: opened.command } : {}),
  });
}
