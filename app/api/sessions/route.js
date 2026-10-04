import { NextResponse } from 'next/server';
import { rejectCrossSiteRequest } from '@/lib/requestGuard';
import {
  SessionError,
  appendTurns,
  bulkUpdate,
  deleteSessions,
  exportSessions,
  finishSession,
  getSession,
  importSessions,
  listSessions,
  newSessionId,
  recapToMemory,
  resolveSession,
  revertSessions,
  searchMeaning,
  searchWords,
  sessionsInPeriod,
  takeGreetingRecap,
  updateSession,
} from '@/lib/sessionArchive';
import { takeUndo } from '@/lib/undoJournal';
import { VaultError } from '@/lib/memoryVault';

/**
 * Next.js 16 App Router Route Handler: /api/sessions — the conversation archive (Phase 11).
 * Writes are same-origin only; deletes and imports are recorded in the undo journal.
 */

const apiKeyOf = (req, body = {}) => req.headers.get('x-gemini-api-key') || body.apiKey || process.env.GEMINI_API_KEY || '';
const fail = (message, status = 400) => NextResponse.json({ success: false, message }, { status });

/**
 * GET /api/sessions
 *   (none)                  list with stats, settings, and the next greeting's session
 *   id=...                  one session with its transcript
 *   query=...&mode=words    search titles, recaps, and transcripts
 *   query=...&mode=meaning  rank recapped sessions by meaning (needs a Gemini key)
 *   export=json|md&ids=a,b  download (all sessions when ids is omitted)
 *   current=...             the live session id (marked "live" in lists)
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const currentId = searchParams.get('current') || undefined;
  try {
    const format = searchParams.get('export');
    if (format) {
      const ids = (searchParams.get('ids') || '').split(',').filter(Boolean);
      const md = format === 'md';
      const stamp = new Date().toISOString().slice(0, 10);
      return new NextResponse(exportSessions(ids, md ? 'md' : 'json'), {
        headers: {
          'Content-Type': md ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="ultron-conversations-${stamp}.${md ? 'md' : 'json'}"`,
        },
      });
    }

    const id = searchParams.get('id');
    if (id) return NextResponse.json({ success: true, session: getSession(id) });

    const query = (searchParams.get('query') || '').trim();
    if (query) {
      const apiKey = apiKeyOf(req);
      if (searchParams.get('mode') === 'meaning' && apiKey) {
        try {
          return NextResponse.json({ success: true, search_mode: 'meaning', sessions: await searchMeaning(query, apiKey, { currentId }) });
        } catch (err) {
          console.warn('[/api/sessions] Meaning search failed, matching words:', err.message);
        }
      }
      return NextResponse.json({ success: true, search_mode: 'words', sessions: searchWords(query, { currentId }) });
    }

    return NextResponse.json({ success: true, ...listSessions({ currentId }) });
  } catch (error) {
    if (error instanceof SessionError) return fail(error.message, 404);
    console.error('[/api/sessions] GET error:', error);
    return fail(`Session archive error: ${error.message}`, 500);
  }
}

/**
 * POST /api/sessions { action, ... }
 *   append      { session_id, started_at?, turns: [{ role, text, at }], final?, apiKey? }
 *               (also sent with navigator.sendBeacon when the HUD closes, which cannot set
 *               headers, hence the key in the body)
 *   greeting    { current_id } -> the recap the greeting mentions, once ("pop" is the old name)
 *   update      { id, title?, summary?, pinned?, greeting?: pending | queued | mentioned | skip }
 *   bulk_update { ids, pinned }
 *   regenerate  { id }         rewrite the title and recap
 *   delete      { ids }        -> { undo_id }
 *   restore     { undo_id }
 *   to_memory   { id }         save the recap into the memory vault
 *   import      { sessions }
 *   save        { turns }      Phase 8.5 form: archive and recap one finished conversation
 *   voice       { op: list | find | continue | forget, id?, query?, period?, current_id? }
 */
export async function POST(req) {
  const blocked = rejectCrossSiteRequest(req);
  if (blocked) return blocked;
  let body = {};
  try {
    body = JSON.parse(await req.text());
  } catch {
    // Empty or invalid body
  }

  try {
    switch (body.action) {
      case 'append': {
        const result = await appendTurns({ sessionId: body.session_id, startedAt: body.started_at, turns: body.turns, final: Boolean(body.final), apiKey: apiKeyOf(req, body) });
        return NextResponse.json({ success: true, ...result });
      }
      case 'save': {
        const result = await appendTurns({ sessionId: newSessionId(), turns: body.turns, final: true, apiKey: apiKeyOf(req, body) });
        return NextResponse.json({ success: true, saved: Boolean(result.recap?.saved), ...result });
      }
      case 'greeting':
      case 'pop':
        return NextResponse.json({ success: true, session: takeGreetingRecap(body.current_id) });
      case 'update':
        return NextResponse.json({ success: true, session: updateSession(body.id, body) });
      case 'bulk_update': {
        if (!Array.isArray(body.ids) || !body.ids.length || body.pinned === undefined) return fail('Give the session ids and what to change.');
        return NextResponse.json({ success: true, updated: bulkUpdate(body.ids, { pinned: body.pinned }) });
      }
      case 'regenerate': {
        const apiKey = apiKeyOf(req, body);
        if (!apiKey) return fail('Writing a recap needs a Gemini API key.');
        const result = await finishSession(body.id, apiKey, { force: true });
        if (!result.saved) return fail(result.reason);
        return NextResponse.json({ success: true, ...result, session: getSession(body.id) });
      }
      case 'delete': {
        if (!Array.isArray(body.ids) || !body.ids.length) return fail('Give the session ids to delete.');
        return NextResponse.json({ success: true, ...deleteSessions(body.ids) });
      }
      case 'restore': {
        const entry = body.undo_id ? takeUndo(body.undo_id) : null;
        if (!entry || entry.kind !== 'session_changed') return fail('That change can no longer be undone.', 404);
        return NextResponse.json({ success: true, ...revertSessions(entry.data), label: entry.label });
      }
      case 'to_memory':
        return NextResponse.json({ success: true, memory: recapToMemory(body.id) });
      case 'voice':
        return NextResponse.json({ action: 'voice', ...(await voiceRequest(body, apiKeyOf(req, body))) });
      case 'import': {
        const records = Array.isArray(body.sessions) ? body.sessions : body.archive?.sessions;
        return NextResponse.json({ success: true, ...importSessions(records) });
      }
      default:
        return fail(`Unknown sessions action "${body.action}".`);
    }
  } catch (error) {
    if (error instanceof SessionError || error instanceof VaultError) return fail(error.message);
    console.error('[/api/sessions] POST error:', error);
    return fail(`Session archive error: ${error.message}`, 500);
  }
}

const PERIOD_WORDS = { today: 'today', yesterday: 'yesterday', week: 'in the past week', month: 'in the past month', all: 'in the archive' };

async function voiceRequest(body, apiKey) {
  const currentId = body.current_id;
  if (body.op === 'list') {
    const period = PERIOD_WORDS[body.period] ? body.period : 'week';
    const sessions = sessionsInPeriod(period, currentId).slice(0, 8);
    return { success: true, sessions, message: sessions.length ? `${sessions.length} conversation(s) ${PERIOD_WORDS[period]}.` : `No archived conversations ${PERIOD_WORDS[period]}.` };
  }
  const target = await resolveSession({ id: body.id, query: body.query, period: body.period }, apiKey, currentId);
  if (body.op === 'find') {
    const sessions = target.session ? [target.session] : target.candidates || target.closest || [];
    return { success: true, sessions, message: sessions.length ? `${sessions.length} matching conversation(s).` : 'No archived conversation matches that.' };
  }
  if (target.none) return { success: false, message: 'No archived conversation clearly matches that, so nothing was changed.', ...(target.closest ? { closest: target.closest } : {}) };
  if (target.candidates) return { success: false, ambiguous: true, candidates: target.candidates, message: 'Several conversations could match; ask the operator which one, then call again with its id.' };
  const session = target.session;
  if (body.op === 'continue') {
    return { success: true, session, message: `Reopening "${session.title}" from ${session.when}.` };
  }
  if (body.op === 'forget') {
    const result = deleteSessions([session.id], `forgot the conversation "${session.title}"`);
    return { success: true, ...result, forgotten: session, message: `Deleted the conversation "${session.title}" from ${session.when}. "Undo" brings it back.` };
  }
  throw new SessionError(`Unknown session request "${body.op}".`);
}
