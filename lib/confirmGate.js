import crypto from 'crypto';

/**
 * Server half of the on-screen confirmation gate for irreversible system actions (Phase 8.3):
 * power, WiFi off, and ending processes. A prepared action is held here with a one-time token
 * and runs only when the HUD card's AUTHORIZE click sends that token back, so a voice request
 * (or text Jarvis read somewhere) can never complete one on its own.
 */

const PENDING_TTL_MS = 2 * 60 * 1000;

// Route handlers are bundled separately, so the map lives on globalThis to be shared
const pending = globalThis.__jarvisPendingConfirms || (globalThis.__jarvisPendingConfirms = new Map());

function sweep() {
  for (const [id, entry] of pending) {
    if (Date.now() - entry.createdAt > PENDING_TTL_MS) pending.delete(id);
  }
}

/**
 * Holds `payload` for confirmation and returns the card request ({ id, kind, title, detail, warnings, needs_confirmation }).
 * The secret execution token is NEVER returned until the operator authorizes the request.
 */
export function prepareConfirm({ title, detail, warnings = [], payload, kind = 'system' }) {
  sweep();
  const request = {
    id: crypto.randomUUID(),
    kind,
    title,
    detail,
    warnings,
    needs_confirmation: true,
  };
  pending.set(request.id, { token: null, payload, createdAt: Date.now(), authorized: false });
  return request;
}

/**
 * Authorizes a prepared action and mints a single-use execution token.
 * Only called when the operator authorizes the card on the HUD.
 */
export function authorizeConfirm(id) {
  sweep();
  const entry = pending.get(id);
  if (!entry) return null;
  entry.authorized = true;
  entry.token = crypto.randomBytes(16).toString('hex');
  return entry.token;
}

/**
 * Consumes a confirmation: returns its payload, or null when unknown, expired, not authorized, or token mismatch.
 */
export function takeConfirm(id, token) {
  sweep();
  const entry = pending.get(id);
  if (!entry || !entry.authorized || !entry.token) return null;
  if (typeof token !== 'string' || token.length !== entry.token.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(entry.token))) return null;
  pending.delete(id);
  return entry.payload;
}

export function cancelConfirm(id) {
  return pending.delete(id);
}

