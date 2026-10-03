import { NextResponse } from 'next/server';
import { SandboxError } from '@/lib/fsSandbox';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';
import { startProject, getProjectJob, listProjectJobs, ScaffoldError } from '@/lib/projectScaffolder';

/**
 * Next.js 16 App Router Route Handler: /api/projects
 * POST { template, name, location?, install?, language? } starts a background scaffolding job;
 * GET ?id=<jobId> reports its progress (GET without id lists recent jobs).
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
    const job = startProject({
      template: body.template,
      name: body.name,
      location: body.location || undefined,
      install: body.install_dependencies ?? body.install,
      language: body.language,
    });
    return NextResponse.json({ success: true, job });
  } catch (error) {
    if (error instanceof ScaffoldError || error instanceof SandboxError) {
      return NextResponse.json({ success: false, message: error.message });
    }
    console.error('[/api/projects] Failed to start scaffolding:', error);
    return NextResponse.json({ success: false, message: `Could not start the project: ${error.message}` }, { status: 500 });
  }
}

export async function GET(req) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ success: true, jobs: listProjectJobs() });
  const job = getProjectJob(id);
  return job
    ? NextResponse.json({ success: true, job })
    : NextResponse.json({ success: false, message: `No project job "${id}".` }, { status: 404 });
}
