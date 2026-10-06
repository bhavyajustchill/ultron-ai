/**
 * In-memory storage and validation for mobile companion pairing tokens.
 * Minted by /api/mobile-pairing and validated by /api/relay.
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const tokenStore = globalThis.__jarvisPairingTokens || (globalThis.__jarvisPairingTokens = new Map());

function sweep() {
  const now = Date.now();
  for (const [token, meta] of tokenStore.entries()) {
    if (now > meta.expiresAt) {
      tokenStore.delete(token);
    }
  }
}

export function registerPairingToken(token, ttlMs = TOKEN_TTL_MS) {
  if (!token || typeof token !== 'string') return;
  sweep();
  tokenStore.set(token, {
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  });
}

export function isValidPairingToken(token) {
  if (!token || typeof token !== 'string') return false;
  sweep();
  const meta = tokenStore.get(token);
  if (!meta) return false;
  if (Date.now() > meta.expiresAt) {
    tokenStore.delete(token);
    return false;
  }
  return true;
}

export function revokePairingToken(token) {
  return tokenStore.delete(token);
}
