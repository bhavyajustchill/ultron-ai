import { NextResponse } from 'next/server';
import { DevAgentError, startDevJob, getDevJob, settleDevApproval } from '@/lib/devAgent';
import { takeConfirm, cancelConfirm } from '@/lib/confirmGate';
import { SandboxError } from '@/lib/fsSandbox';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: /api/dev-agent (Phase 8.11)
 * POST { action: "start", task, language } starts a job; GET ?id= follows it;
 * POST { action: "approve", id, token } (the HUD card's one-time token) or { action: "decline", job }
 * settles the run authorization.
 */
export async function GET(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;
  const job = getDevJob(new URL(req.url).searchParams.get('id'));
  return NextResponse.json({ success: Boolean(job), job });
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
    if (body.action === 'approve') {
      const payload = takeConfirm(body.id, body.token);
      if (payload?.action !== 'dev_agent_run' || !settleDevApproval(payload.jobId, true)) {
        return NextResponse.json({ success: false, message: 'This authorization is unknown or expired.' });
      }
      return NextResponse.json({ success: true, message: 'Authorized; running the project.' });
    }
    if (body.action === 'decline') {
      if (body.id) cancelConfirm(body.id);
      settleDevApproval(body.job, false);
      return NextResponse.json({ success: true, message: 'Not run.' });
    }
    const apiKey = req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || '';
    const job = startDevJob({ task: body.task, language: body.language, apiKey });
    return NextResponse.json({
      success: true,
      job,
      message: 'The dev agent is writing the project in the background. Progress appears in the Comms Log; running it will need the operator\'s click on the HUD card.',
    });
  } catch (error) {
    if (error instanceof DevAgentError || error instanceof SandboxError) return NextResponse.json({ success: false, message: error.message });
    console.error('[/api/dev-agent] failed:', error);
    return NextResponse.json({ success: false, message: `Dev agent failed: ${error.message}` }, { status: 500 });
  }
}
