import { NextResponse } from 'next/server';

// In-memory relay store shared across API invocations in the Node process
if (!global.__adaRelayStore) {
  global.__adaRelayStore = {
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

const store = global.__adaRelayStore;

/**
 * GET /api/relay
 * Used by:
 * 1. Desktop: To fetch unconsumed mobile directives (e.g. speech/text commands)
 * 2. Mobile: To poll desktop status, telemetry, and live comms transcript
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const client = searchParams.get('client') || 'mobile'; // 'mobile' | 'desktop'
    const since = parseInt(searchParams.get('since') || '0', 10);

    if (client === 'desktop') {
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

    // Mobile client polling desktop telemetry and transcripts
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
 * - Mobile sends: { source: 'mobile', type: 'directive' | 'os_action', payload, token }
 * - Desktop sends: { source: 'desktop', state: { status, latencyMs, systemTelemetry, commsLog } }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { source, type, payload, token, state } = body;

    if (source === 'desktop' && state) {
      // Desktop pushes its live state to the relay
      store.desktopState = {
        status: state.status || store.desktopState.status,
        latencyMs: state.latencyMs || store.desktopState.latencyMs,
        systemTelemetry: state.systemTelemetry || store.desktopState.systemTelemetry,
        commsLog: state.commsLog || store.desktopState.commsLog,
        lastUpdated: Date.now(),
      };

      return NextResponse.json({ success: true, message: 'Desktop state synchronized' });
    }

    if (source === 'mobile') {
      // Register mobile client ping
      if (token) {
        store.mobileClients[token] = { lastSeen: Date.now() };
      }

      // Enqueue directive for desktop agent to process
      if (type && payload) {
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

