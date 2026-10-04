import { NextResponse } from 'next/server';
import { MonitorError, addMonitor, removeMonitor, listMonitors, checkMonitors } from '@/lib/topicMonitors';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: /api/monitors (Phase 8.6)
 * GET ?due=1 checks topics that are due (about daily) and returns new-headline alerts for the HUD.
 * POST { action: add | remove | list | check } backs the `topic_monitors` live tool.
 */
export async function GET(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;
  if (new URL(req.url).searchParams.get('due')) {
    return NextResponse.json({ success: true, ...(await checkMonitors()) });
  }
  return NextResponse.json({ success: true, topics: listMonitors() });
}

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
    switch (body.action) {
      case 'add': {
        const { topic, latest } = await addMonitor(body.topic);
        return NextResponse.json({
          success: true,
          topic,
          latest,
          message: `Now monitoring "${topic}"; Ultron checks it daily and speaks up when a new headline appears.${latest ? ` Latest right now: "${latest.title}" (${latest.source}).` : ''}`,
        });
      }
      case 'remove': {
        const topic = removeMonitor(body.topic);
        return NextResponse.json({ success: true, message: `Stopped monitoring "${topic}".` });
      }
      case 'list': {
        const topics = listMonitors();
        return NextResponse.json({
          success: true,
          topics,
          message: topics.length ? `Monitoring ${topics.length} topic(s): ${topics.map((t) => t.topic).join(', ')}.` : 'No topics are being monitored.',
        });
      }
      case 'check': {
        const { alerts, errors } = await checkMonitors({ force: true });
        return NextResponse.json({
          success: true,
          alerts,
          errors,
          message: alerts.length
            ? `New headlines: ${alerts.map((a) => `${a.topic}: "${a.title}" (${a.source})`).join('; ')}.`
            : `No new headlines on monitored topics${errors.length ? ` (${errors.length} could not be checked)` : ''}.`,
        });
      }
      default:
        return NextResponse.json({ success: false, message: `Unknown monitors action "${body.action}".` }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof MonitorError) return NextResponse.json({ success: false, message: error.message });
    console.error('[/api/monitors] failed:', error);
    return NextResponse.json({ success: false, message: `Topic monitor failed: ${error.message}` }, { status: 500 });
  }
}
