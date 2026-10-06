import { NextResponse } from 'next/server';
import { isValidPairingToken } from '@/lib/pairingAuth';

function isLoopback(val) {
  if (!val) return false;
  const host = val.split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

function checkLoopback(request) {
  const host = request.headers.get('host') || '';
  if (!isLoopback(host)) return false;
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const clientIp = forwardedFor.split(',')[0].trim().replace(/^::ffff:/, '');
    if (!isLoopback(clientIp)) return false;
  }
  return true;
}

// In-memory relay store shared across API invocations in the Node process
if (!global.__jarvisRelayStore) {
  global.__jarvisRelayStore = {
    pendingDirectives: [], // Directives sent by mobile to be consumed by desktop
    desktopState: {
      status: 'DISCONNECTED',
      latencyMs: 0,
      systemTelemetry: { cpu: 20, mem: 45, gpu: 10, uptime: '00:00' },
      commsLog: [],
      lastUpdated: Date.now(),
    },
    mobileClients: {},
  };
}

const store = global.__jarvisRelayStore;

/**
 * GET /api/relay
 * Used by:
 * 1. Desktop: To fetch unconsumed mobile directives (must originate from loopback)
 * 2. Mobile: To poll desktop status, telemetry, and live comms transcript (requires valid pairing token)
 */
export async function GET(request) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return NextResponse.json({ success: false, error: 'Cross-site request blocked' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client') || 'mobile'; // 'mobile' | 'desktop'
    const since = parseInt(searchParams.get('since') || '0', 10);

    if (client === 'desktop') {
      if (!checkLoopback(request)) {
        return NextResponse.json({ success: false, error: 'Desktop relay consumer must originate from loopback' }, { status: 403 });
      }

      // Desktop consumes any pending mobile directives
      const directives = [...store.pendingDirectives];
      store.pendingDirectives = []; // Clear consumed directives

      return NextResponse.json({
        success: true,
        directives,
        mobileConnected: Object.keys(store.mobileClients).length > 0,
        timestamp: Date.now(),
      });
    }

    // Mobile client polling desktop telemetry and transcripts: require pairing token
    const token = searchParams.get('token') || request.headers.get('x-pairing-token') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!isValidPairingToken(token)) {
      return NextResponse.json({ success: false, error: 'Unauthorized: valid mobile pairing token required' }, { status: 401 });
    }

    const newComms = store.desktopState.commsLog.filter(
      (msg) => !since || msg.timestamp > since
    );

    return NextResponse.json({
      success: true,
      desktopState: {
        status: store.desktopState.status,
        latencyMs: store.desktopState.latencyMs,
        systemTelemetry: store.desktopState.systemTelemetry,
        recentComms: newComms.slice(-10),
      },
      timestamp: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/relay
 * Handshakes directives:
 * - Mobile sends: { source: 'mobile', type: 'text_directive' | 'os_action' | 'briefing', payload, token }
 * - Desktop sends: { source: 'desktop', state: { status, latencyMs, systemTelemetry, commsLog } }
 */
export async function POST(request) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return NextResponse.json({ success: false, error: 'Cross-site request blocked' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { source, type, payload, state } = body;
    const token = body.token || request.headers.get('x-pairing-token') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

    if (source === 'desktop') {
      if (!checkLoopback(request)) {
        return NextResponse.json({ success: false, error: 'Desktop relay synchronizer must originate from loopback' }, { status: 403 });
      }

      if (state) {
        store.desktopState = {
          status: state.status || store.desktopState.status,
          latencyMs: state.latencyMs || store.desktopState.latencyMs,
          systemTelemetry: state.systemTelemetry || store.desktopState.systemTelemetry,
          commsLog: state.commsLog || store.desktopState.commsLog,
          lastUpdated: Date.now(),
        };
      }

      return NextResponse.json({ success: true, message: 'Desktop state synchronized' });
    }

    if (source === 'mobile') {
      if (!isValidPairingToken(token)) {
        return NextResponse.json({ success: false, error: 'Unauthorized: valid mobile pairing token required' }, { status: 401 });
      }

      // Register mobile client ping
      store.mobileClients[token] = { lastSeen: Date.now() };

      // Enqueue directive for desktop agent to process
      if (type && payload) {
        const allowedTypes = ['text_directive', 'os_action', 'briefing'];
        if (!allowedTypes.includes(type)) {
          return NextResponse.json({ success: false, error: 'Invalid directive type' }, { status: 400 });
        }
        if (typeof payload !== 'string' || payload.length > 2000) {
          return NextResponse.json({ success: false, error: 'Payload must be a string up to 2000 characters' }, { status: 400 });
        }

        const item = {
          id: `relay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type, // 'text_directive' | 'os_action' | 'briefing'
          payload,
          token,
          timestamp: Date.now(),
        };

        store.pendingDirectives.push(item);

        return NextResponse.json({
          success: true,
          directiveId: item.id,
          message: 'Directive queued for desktop agent',
        });
      }

      return NextResponse.json({ success: true, message: 'Mobile heartbeat acknowledged' });
    }

    return NextResponse.json({ success: false, error: 'Invalid relay source' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
