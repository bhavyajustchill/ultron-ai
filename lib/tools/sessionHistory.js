import { postJson } from '@/lib/tools/http';

/**
 * Live tool `session_history` (Phase 11.3): past conversations by voice — what was discussed, find
 * one, reopen it, or delete it (undoable).
 */
export default {
  declaration: {
    name: 'session_history',
    description:
      'Past conversations with the operator (the Session Archive). list: what you talked about in a period ("what did we discuss yesterday / this week?"). find: a conversation by description ("when we planned the Kyoto trip"). continue: reopen one, re-linking with its last turns so you can pick up where you left off. forget: delete one from the archive (undoable). When several could match, ask which one and call again with its id.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: { type: 'STRING', description: 'What to do.', enum: ['list', 'find', 'continue', 'forget'] },
        period: { type: 'STRING', description: 'list / forget / continue: today, yesterday, week, month, or all.', enum: ['today', 'yesterday', 'week', 'month', 'all'] },
        query: { type: 'STRING', description: 'find / continue / forget: what the conversation was about.' },
        id: { type: 'STRING', description: 'The exact session id, when an earlier call returned candidates and the operator picked one.' },
      },
      required: ['action'],
    },
  },

  async run(args, ctx) {
    const { action, ...rest } = args;
    let result = { success: false, message: 'The session archive could not be reached.' };
    try {
      const key = ctx.apiKey();
      result = await postJson('/api/sessions', { action: 'voice', op: action, current_id: ctx.currentSessionId?.(), ...rest }, key ? { 'x-gemini-api-key': key } : {});
    } catch (err) {
      console.error('[tools/session_history] Archive error:', err);
    }
    ctx.log(`[SESSION] ${(action || '').toUpperCase()}: ${result.message}`);
    if (result.success && action === 'continue' && result.session?.id) {
      // Re-link once this reply has been spoken
      ctx.continueSession(result.session.id);
      result.message += ' Say one short sentence that you are reopening it; the link re-connects right after.';
    }
    if (result.success && action === 'forget') ctx.store.getState().loadSessions?.();
    return result;
  },
};
