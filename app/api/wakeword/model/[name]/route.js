import fs from 'fs';
import { modelPath } from '@/lib/wakeWord/models';

/**
 * GET /api/wakeword/model/{mel|embedding|wakeword}: serves an installed model to the HUD listener.
 */
export async function GET(_req, { params }) {
  const { name } = await params;
  const file = modelPath(name);
  if (!file || !fs.existsSync(file)) return new Response('Model not installed', { status: 404 });
  return new Response(fs.readFileSync(file), { headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'private, max-age=86400' } });
}
