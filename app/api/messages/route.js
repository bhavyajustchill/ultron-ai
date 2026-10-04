import { NextResponse } from 'next/server';
import { ComposeError, buildComposeLink } from '@/lib/messageComposer';
import { openWithDefaultApp } from '@/lib/desktopLauncher';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: POST /api/messages (Phase 8.8)
 * Opens WhatsApp / Telegram / email with the message written; the operator presses Send.
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
    const link = await buildComposeLink(body);
    const opened = await openWithDefaultApp(link.url);
    if (!opened.success) return NextResponse.json({ success: false, message: `Could not open ${link.app}: ${opened.error}` });
    const appName = { whatsapp: 'WhatsApp', telegram: 'Telegram', email: 'The mail window' }[link.app];
    return NextResponse.json({
      success: true,
      app: link.app,
      recipient: link.recipient,
      message: `${appName} is open with the message written${link.recipient ? ` to ${link.recipient}` : ''}. It is NOT sent: the operator presses Send.${link.note ? ` ${link.note}` : ''}`,
      ...(opened.dryRun ? { dry_run: true, command: opened.command } : {}),
    });
  } catch (error) {
    if (error instanceof ComposeError) return NextResponse.json({ success: false, message: error.message });
    console.error('[/api/messages] failed:', error);
    return NextResponse.json({ success: false, message: `Compose failed: ${error.message}` }, { status: 500 });
  }
}
