import { postJson } from '@/lib/tools/http';

/**
 * Typing into a terminal waits for the operator's click on the HUD card (Phase 15): shows the card
 * for a `needs_confirmation` result, then lets /api/input finish (or drop) the held request.
 */
export async function finishWithApproval(result, ctx, tag) {
  const { request } = result;
  ctx.log(`[${tag}] Awaiting operator authorization on the HUD: ${request.title}`);
  const approval = await ctx.requestApproval(request);
  const decision = approval?.decision || approval;
  const token = approval?.token || request.token;
  if (decision !== 'approved' || !token) {
    postJson('/api/input', { action: 'cancel', id: request.id }).catch(() => {});
    return {
      success: false,
      status: decision === 'timeout' ? 'TIMED_OUT_WAITING' : 'DENIED_BY_OPERATOR',
      message:
        decision === 'timeout'
          ? `The operator did not authorize "${request.title}" within 90 seconds, so nothing was typed.`
          : `The operator denied "${request.title}", so nothing was typed.`,
    };
  }
  return postJson('/api/input', { action: 'confirm', id: request.id, token });

}
