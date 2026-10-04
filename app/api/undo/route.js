import { NextResponse } from 'next/server';
import { listUndo, popUndo } from '@/lib/undoJournal';
import { runUndo } from '@/lib/undoActions';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';

/**
 * Next.js 16 App Router Route Handler: /api/undo (Phase 8.3)
 * GET lists what can be undone (newest first); POST { action: "undo" } reverses the newest
 * record, POST { action: "list" } is the same as GET for the live tool.
 */
export async function GET() {
  return NextResponse.json({ success: true, entries: listUndo() });
}

export async function POST(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;

  let body = {};
  try {
    body = await req.json();
  } catch {
    // Empty body means undo
  }

  if (body.action === 'list') {
    const entries = listUndo();
    return NextResponse.json({
      success: true,
      entries,
      message: entries.length
        ? `${entries.length} action(s) can be undone, newest first: ${entries.map((e) => e.label).join('; ')}.`
        : 'There is nothing to undo.',
    });
  }

  const entry = popUndo();
  if (!entry) return NextResponse.json({ success: false, message: 'There is nothing to undo.' });

  try {
    const result = await runUndo(entry);
    const next = listUndo()[0];
    return NextResponse.json({
      success: true,
      undone: entry.label,
      message: `Undid: ${entry.label}. ${result}`,
      ...(next ? { next_undo: next.label } : {}),
    });
  } catch (error) {
    console.error('[/api/undo] undo failed:', error);
    return NextResponse.json({
      success: false,
      undone: null,
      message: `Could not undo "${entry.label}": ${error.message} It was removed from the undo list.`,
    });
  }
}
