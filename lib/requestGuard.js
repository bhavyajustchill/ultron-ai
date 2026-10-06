import { NextResponse } from 'next/server';

function isLoopback(val) {
  if (!val) return false;
  const host = val.split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

/**
 * Blocks cross-site and remote non-loopback requests to routes that touch the host machine
 * (files, shell, input, settings). Host-touching routes must only be accessible from the
 * local desktop HUD session, never from Wi-Fi devices or cross-site origins.
 */
export function rejectCrossSiteRequest(req) {
  const host = req.headers.get('host') || '';
  if (!isLoopback(host)) {
    return forbidden('Host actions are only permitted from localhost/loopback.');
  }

  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const clientIp = forwardedFor.split(',')[0].trim().replace(/^::ffff:/, '');
    if (!isLoopback(clientIp)) {
      return forbidden('Host actions are only permitted from localhost/loopback.');
    }
  }

  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return forbidden('Cross-site request blocked: host actions are only accepted from the local HUD.');
  }

  const origin = req.headers.get('origin');
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (!isLoopback(originHost) || originHost.toLowerCase() !== host.toLowerCase()) {
        return forbidden('Invalid request origin.');
      }
    } catch {
      return forbidden('Invalid origin header.');
    }
  }

  return null;
}

function forbidden(message = 'Cross-site request blocked: host actions are only accepted from the Jarvis HUD.') {
  return NextResponse.json(
    { success: false, message },
    { status: 403 }
  );
}

