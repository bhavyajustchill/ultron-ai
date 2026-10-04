import { NextResponse } from 'next/server';
import os from 'os';
import { generateQrSvg } from '@/lib/qrCode';

/**
 * GET /api/mobile-pairing
 * Detects local LAN IPv4 network interfaces, mints a pairing token,
 * generates a cyberpunk SVG QR code, and returns the mobile access endpoints.
 */
export async function GET(request) {
  try {
    const interfaces = os.networkInterfaces();
    const candidateIps = [];

    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        // Only consider non-internal IPv4
        if (net.family === 'IPv4' && !net.internal) {
          candidateIps.push({
            name,
            address: net.address,
            is192: net.address.startsWith('192.168.'),
            is10: net.address.startsWith('10.'),
            isTailscale: name.toLowerCase().includes('tailscale'),
            isVirtual: name.toLowerCase().includes('vethernet') || name.toLowerCase().includes('virtual'),
          });
        }
      }
    }

    // Sort to prioritize real LAN Ethernet/Wi-Fi (192.168.x.x > 10.x.x.x > others)
    candidateIps.sort((a, b) => {
      if (a.is192 && !b.is192) return -1;
      if (!a.is192 && b.is192) return 1;
      if (a.is10 && !b.is10) return -1;
      if (!a.is10 && b.is10) return 1;
      if (!a.isVirtual && b.isVirtual) return -1;
      if (a.isVirtual && !b.isVirtual) return 1;
      return 0;
    });

    const primaryIp = candidateIps.length > 0 ? candidateIps[0].address : 'localhost';
    const port = process.env.PORT || '8000';

    // Ephemeral pairing token valid for this session
    const pairingToken = `pair_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const mobileUrl = `http://${primaryIp}:${port}/mobile?token=${pairingToken}`;

    // Render crisp neon cyberpunk QR code
    const qrSvg = await generateQrSvg(mobileUrl, {
      dark: '#00F0FF',
      light: '#0A0B10',
      width: 256,
      margin: 1,
    });

    return NextResponse.json({
      success: true,
      localIp: primaryIp,
      port,
      mobileUrl,
      token: pairingToken,
      qrSvg,
      interfaces: candidateIps.map((i) => ({ name: i.name, address: i.address })),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API /api/mobile-pairing] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

