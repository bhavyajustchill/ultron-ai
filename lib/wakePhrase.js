/**
 * Wake-phrase matching for standby mode (Phase 7.6). Pure functions shared by the HUD
 * listener and automated checks. Speech recognisers mangle names and greetings, so the
 * phrase's words must appear in order, but greetings are interchangeable ("hi" ~ "hey")
 * and longer words tolerate one wrong letter ("javis" ~ "jarvis").
 */

export const DEFAULT_WAKE_PHRASE = 'Hey Ultron';

// The offline openWakeWord model knows only this phrase; any other phrase uses Web Speech
export const OFFLINE_WAKE_PHRASE = 'Hey Jarvis';

// How recognisers spell the name Ultron beyond one wrong letter
const ULTRON_NAMES = new Set(['ultron', 'oltron', 'altron', 'ultrun', 'eltron', 'alltron']);
const NAME_ALIASES = { ultron: ULTRON_NAMES };

const GREETINGS = new Set(['hey', 'hi', 'hay', 'hai', 'ok', 'okay', 'hello', 'yo']);

export function normalizeWords(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = saved;
    }
  }
  return row[b.length];
}

function wordMatches(heard, expected) {
  if (heard === expected) return true;
  if (NAME_ALIASES[expected]?.has(heard)) return true;
  if (GREETINGS.has(expected) && GREETINGS.has(heard)) return true;
  return expected.length >= 5 && Math.abs(heard.length - expected.length) <= 1 && editDistance(heard, expected) <= 1;
}

/**
 * True when the transcript contains the wake phrase's words consecutively and in order.
 */
export function matchesWakePhrase(transcript, phrase = DEFAULT_WAKE_PHRASE) {
  const heard = normalizeWords(transcript);
  const expected = normalizeWords(phrase);
  if (expected.length === 0) return false;
  for (let start = 0; start + expected.length <= heard.length; start++) {
    if (expected.every((word, i) => wordMatches(heard[start + i], word))) return true;
  }
  return false;
}
