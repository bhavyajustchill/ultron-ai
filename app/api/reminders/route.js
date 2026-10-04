import { NextResponse } from 'next/server';
import { ReminderError, createReminder, listReminders, cancelReminder, takeDueReminders } from '@/lib/reminders';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: /api/reminders (Phase 8.4)
 * GET lists upcoming reminders; GET ?due=1 hands the HUD reminders that just came due (each
 * occurrence once) so Jarvis can say them aloud. POST { action: create | list | cancel } backs the
 * `reminders` live tool.
 */
export async function GET(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;
  if (new URL(req.url).searchParams.get('due')) {
    return NextResponse.json({ success: true, due: takeDueReminders() });
  }
  return NextResponse.json({ success: true, reminders: await listReminders() });
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
      case 'create': {
        const reminder = await createReminder(body);
        return NextResponse.json({
          success: true,
          reminder: { id: reminder.id, message: reminder.message, when: reminder.when, repeat: reminder.repeat },
          message: `Reminder set for ${reminder.when}: "${reminder.message}". It appears as a desktop notification even if Ultron is closed.`,
        });
      }
      case 'list': {
        const reminders = await listReminders();
        return NextResponse.json({
          success: true,
          reminders,
          message: reminders.length
            ? `${reminders.length} upcoming reminder(s): ${reminders.map((r) => `${r.when}: "${r.message}"`).join('; ')}.`
            : 'There are no upcoming reminders.',
        });
      }
      case 'cancel': {
        const cancelled = await cancelReminder({ id: body.id, match: body.match || body.message });
        return NextResponse.json({ success: true, message: `Cancelled the reminder "${cancelled.message}".` });
      }
      default:
        return NextResponse.json({ success: false, message: `Unknown reminders action "${body.action}".` }, { status: 400 });
    }
  } catch (error) {
    if (error instanceof ReminderError) return NextResponse.json({ success: false, message: error.message });
    console.error('[/api/reminders] failed:', error);
    return NextResponse.json({ success: false, message: `Reminder failed: ${error.message}` }, { status: 500 });
  }
}
