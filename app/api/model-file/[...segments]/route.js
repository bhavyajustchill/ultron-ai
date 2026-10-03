import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { resolveSafePath, SandboxError } from '@/lib/fsSandbox';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: GET /api/model-file/<path segments>
 * Serves 3D model files (and the buffers / textures they reference) from the file sandbox to
 * the HUD model viewer. Path-style URLs let a .gltf's relative "scene.bin" or "textures/a.png"
 * resolve naturally. Only model and texture types are served, same-origin only.
 */

const CONTENT_TYPES = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  bin: 'application/octet-stream',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  ktx2: 'image/ktx2',
};

async function resolveModelFile(req, params) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return { error: blocked };

  const { segments } = await params;
  // "~/..." stays home-relative; anything else is an absolute path
  const requested = segments[0] === '~' ? segments.join('/') : `/${segments.join('/')}`;
  const ext = path.extname(requested).slice(1).toLowerCase();
  if (!CONTENT_TYPES[ext]) {
    return { error: NextResponse.json({ success: false, message: `.${ext} files are not served to the model viewer.` }, { status: 415 }) };
  }

  try {
    const target = resolveSafePath(requested);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      return { error: NextResponse.json({ success: false, message: 'Model file not found.' }, { status: 404 }) };
    }
    return { target, contentType: CONTENT_TYPES[ext], size: fs.statSync(target).size };
  } catch (error) {
    if (error instanceof SandboxError) {
      return { error: NextResponse.json({ success: false, message: error.message }, { status: 403 }) };
    }
    throw error;
  }
}

const headersFor = ({ contentType, size }) => ({
  'Content-Type': contentType,
  'Content-Length': String(size),
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});

export async function GET(req, { params }) {
  const file = await resolveModelFile(req, params);
  if (file.error) return file.error;
  return new Response(fs.readFileSync(/*turbopackIgnore: true*/ file.target), { headers: headersFor(file) });
}

export async function HEAD(req, { params }) {
  const file = await resolveModelFile(req, params);
  if (file.error) return new Response(null, { status: file.error.status });
  return new Response(null, { headers: headersFor(file) });
}
