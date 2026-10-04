import { postJson } from '@/lib/tools/http';

/**
 * Live tool `reminders` (Phase 8.4): OS-native reminders that fire even when Jarvis is closed.
 */
export default {
  declaration: {
    name: 'reminders',
    description: 'Schedules, lists, and cancels reminders. A reminder is a desktop notification scheduled with the operating system, so it appears even if Ultron is closed; if the HUD is linked at that time, you will also be told to say it aloud. For "create", give the message and EITHER "at" as local wall-clock time (e.g. "2026-10-04T18:30", or "18:30" for the next such time; work out dates like "tomorrow" from the current local time you were given) OR "in_minutes" for relative times ("in 20 minutes"). Use "repeat" for daily, weekday, or weekly reminders. Confirm the time back to the operator in natural words.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'create (default), list, or cancel.',
          enum: ['create', 'list', 'cancel'],
        },
        message: {
          type: 'STRING',
          description: 'What to remind the operator about (create), or words from the reminder to cancel (cancel).',
        },
        at: {
          type: 'STRING',
          description: 'Local date-time for the reminder, e.g. "2026-10-04T18:30", or "18:30".',
        },
        in_minutes: {
          type: 'NUMBER',
          description: 'Minutes from now, for relative reminders.',
        },
        repeat: {
          type: 'STRING',
          description: 'none (default), daily, weekdays (Mon-Fri), or weekly (same weekday).',
          enum: ['none', 'daily', 'weekdays', 'weekly'],
        },
        id: {
          type: 'STRING',
          description: 'Reminder id to cancel (from a list result).',
        },
      },
    },
  },

  async run(args, ctx) {
    const action = args.action || 'create';
    ctx.log(`[REMINDERS] ${action.toUpperCase()}${args.message ? ` ("${args.message}")` : ''}...`);
    let result = { success: false, message: 'Failed to contact the reminders bridge.' };
    try {
      result = await postJson('/api/reminders', { ...args, action });
    } catch (err) {
      console.error('[tools/reminders] Error:', err);
    }
    ctx.log(`[REMINDERS] ${result.message}`);
    return result;
  },
};
