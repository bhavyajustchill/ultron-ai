import { NextResponse } from 'next/server';

/**
 * Blocks cross-site requests to routes that touch the host machine (files, shell, input).
 * Browsers always send Sec-Fetch-Site / Origin, which a malicious page cannot forge, so a
 * drive-by form POST from another website is refused while the HUD (same origin, including
 * the paired mobile PWA served from this host) and local tooling (no browser headers) pass.
 * Returns a 403 response to send back, or null when the request may proceed.
 */
export function rejectCrossSiteRequest(req) {
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return forbidden();
  }

  const origin = req.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.get('host')) return forbidden();
    } catch {
      return forbidden();
    }
  }
  return null;
}

function forbidden() {
  return NextResponse.json(
    { success: false, message: 'Cross-site request blocked: host actions are only accepted from the Ultron HUD.' },
    { status: 403 }
  );
}
