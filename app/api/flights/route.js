import { NextResponse } from 'next/server';
import { FlightError, buildFlightSearch } from '@/lib/flights';
import { groundedSearch } from '@/lib/groundedSearch';
import { openWithDefaultApp } from '@/lib/desktopLauncher';
import { findBrowser, runBrowserAction } from '@/lib/browserAgent';

const FARES_TEXT_CHARS = 3500;
const RESULTS_WAIT_MS = Number(process.env.JARVIS_FLIGHTS_WAIT_MS ?? 5000);

/**
 * Opens the search in the Jarvis browser window (Phase 8.10) and reads the results text back, so
 * Jarvis can quote the fares actually on screen. Null when no browser can be driven.
 */
async function readFaresInBrowser(url) {
  // Dry-run checks never open windows (a headless test browser is allowed)
  if (process.env.JARVIS_LAUNCH_DRY_RUN === '1' && process.env.JARVIS_BROWSER_HEADLESS !== '1') return null;
  if (!findBrowser()) return null;
  try {
    await runBrowserAction('open', { url });
    await new Promise((resolve) => setTimeout(resolve, RESULTS_WAIT_MS)); // results load after the page
    const { text } = await runBrowserAction('extract', { what: 'text' });
    return text.slice(0, FARES_TEXT_CHARS);
  } catch {
    return null;
  }
}
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

  const pageText = body.open === false ? null : await readFaresInBrowser(search.url);
  const opened = body.open === false || pageText !== null ? { success: true } : await openWithDefaultApp(search.url);
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
    page_text: pageText,
    message: `${opened.success ? 'Google Flights is open with live fares' : `Could not open the browser (${opened.error}); the link is ${search.url}`} for: ${search.query}.${pageText ? ' The results page text is in page_text: quote airlines, times, and fares from it.' : ''}${summary ? ` Summary from a live web search: ${summary}` : pageText ? '' : ' No live summary is available on this key, so point the operator to the fares on screen instead of quoting prices from memory.'}`,
    ...(opened.dryRun ? { dry_run: true, command: opened.command } : {}),
  });
}
