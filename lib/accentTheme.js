/**
 * HUD accent theming (Phase 8.7). The whole interface is designed around one electric aqua-cyan
 * (DESIGN_ACCENT); a chosen accent re-derives that family by rotating hue and scaling saturation /
 * lightness relative to it, so whites, greys, and status colours (amber, red, green) stay put. The
 * default accent is Arc Reactor Blue, a slightly bluer shift of that cyan design.
 * CSS reads it through variables (--jarvis-accent, --jarvis-accent-rgb, ...); Three.js and canvas
 * code, which cannot use CSS variables, tints its colours with makeTint().
 */

// The colour every themed value is authored in (tint is the identity for it)
export const DESIGN_ACCENT = '#00E5FF';
export const DEFAULT_ACCENT = '#00C3FF';

export const ACCENT_PRESETS = [
  { id: 'blue', name: 'Arc Reactor Blue', hex: '#00C3FF' },
  { id: 'arc', name: 'Arc Reactor Cyan', hex: '#00E5FF' },
  { id: 'gold', name: 'Mark III Gold', hex: '#FFC23D' },
  { id: 'red', name: 'Hot Rod Red', hex: '#FF3B4E' },
  { id: 'violet', name: 'Vibranium Violet', hex: '#A66BFF' },
  { id: 'emerald', name: 'Emerald Ops', hex: '#2BFFA3' },
  { id: 'ice', name: 'Ice White', hex: '#DDF6FF' },
];

// Common colour words people say, beyond the preset names
const COLOUR_WORDS = {
  cyan: '#00E5FF', aqua: '#00E5FF', teal: '#00E5FF', blue: '#3D8BFF', gold: '#FFC23D', yellow: '#FFE14D',
  orange: '#FF8A2B', red: '#FF3B4E', crimson: '#FF2D55', pink: '#FF5FC8', magenta: '#FF4DF0',
  purple: '#A66BFF', violet: '#A66BFF', green: '#2BFFA3', emerald: '#2BFFA3', lime: '#9DFF3D', white: '#DDF6FF',
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function normalizeHex(input) {
  const text = String(input || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(text)) return `#${text.split('').map((c) => c + c).join('')}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`.toUpperCase();
  return null;
}

/**
 * Accepts a preset id or name ("gold", "Mark III Gold"), a colour word ("purple"), or a hex code.
 */
export function resolveAccent(value) {
  const hex = normalizeHex(value);
  if (hex) return hex;
  const wanted = String(value || '').toLowerCase().trim();
  if (!wanted) return null;
  const preset = ACCENT_PRESETS.find((p) => p.id === wanted || p.name.toLowerCase() === wanted)
    || ACCENT_PRESETS.find((p) => p.name.toLowerCase().includes(wanted));
  if (preset) return preset.hex;
  const word = Object.keys(COLOUR_WORDS).find((w) => wanted.split(/[^a-z]+/).includes(w));
  return word ? COLOUR_WORDS[word] : null;
}

export function accentName(hex) {
  return ACCENT_PRESETS.find((p) => p.hex === normalizeHex(hex))?.name || normalizeHex(hex) || 'Arc Reactor Blue';
}

export function hexToRgb(hex) {
  const n = parseInt(normalizeHex(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const BASE_HSL = rgbToHsl(...hexToRgb(DESIGN_ACCENT));

/**
 * Returns tint(hex) -> hex, with tint.rgb(r, g, b) -> [r, g, b] for pixel loops. Colours designed
 * in DESIGN_ACCENT cyan come out in the accent's family; neutral colours pass through.
 */
export function makeTint(accentHex) {
  const accent = normalizeHex(accentHex) || DEFAULT_ACCENT;
  if (accent === DESIGN_ACCENT) {
    const identity = (hex) => hex;
    identity.rgb = (r, g, b) => [r, g, b];
    identity.accent = accent;
    return identity;
  }
  const [ah, as, al] = rgbToHsl(...hexToRgb(accent));
  const [bh, bs, bl] = BASE_HSL;
  const hueShift = ah - bh;
  const satScale = as / bs;
  // Shades darker than the base scale toward black, lighter ones toward white, so a dim
  // background tone stays dim and a highlight stays bright in every theme
  const mapLight = (l) => (l <= bl ? l * (al / bl) : 1 - (1 - l) * ((1 - al) / (1 - bl)));
  const rgb = (r, g, b) => {
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 0.04) return [r, g, b];
    // The more coloured the source, the more it follows the accent's lightness
    const light = l + (mapLight(l) - l) * s;
    return hslToRgb((h + hueShift + 360) % 360, clamp01(s * satScale), clamp01(light));
  };
  const tint = (hex) => rgbToHex(...rgb(...hexToRgb(hex)));
  tint.rgb = rgb;
  tint.accent = accent;
  return tint;
}

/**
 * CSS custom properties for an accent (applied to :root by the HUD).
 */
export function accentCssVars(accentHex) {
  const tint = makeTint(accentHex);
  const accent = tint.accent;
  const accent2 = tint('#00F0FF');
  const rgbList = (hex) => hexToRgb(hex).join(', ');
  return {
    '--jarvis-accent': accent,
    '--jarvis-accent-rgb': rgbList(accent),
    '--jarvis-accent-2': accent2,
    '--jarvis-accent-2-rgb': rgbList(accent2),
    '--jarvis-accent-soft': tint('#70F0FF'),
    '--jarvis-accent-dim': tint('#00364D'),
    // Backdrop glow behind the orb (one colour fading into --jarvis-accent-dim)
    '--jarvis-glow-1-rgb': tint.rgb(0, 215, 255).map(Math.round).join(', '),
  };
}

// localStorage keys for the saved theme; the vars are read by the inline boot script in app/layout.jsx
export const ACCENT_CACHE_KEY = 'jarvis_accent';
export const ACCENT_VARS_CACHE_KEY = 'jarvis_accent_vars';

/**
 * Browser only: puts an accent's CSS variables on :root and, with `cache`, remembers them so the
 * next load paints the theme before hydration. Shared by the HUD and the mobile companion.
 */
export function applyAccentToDocument(accentHex, { cache = true } = {}) {
  const vars = accentCssVars(accentHex);
  for (const [name, value] of Object.entries(vars)) document.documentElement.style.setProperty(name, value);
  if (!cache) return;
  try {
    localStorage.setItem(ACCENT_CACHE_KEY, normalizeHex(accentHex) || DEFAULT_ACCENT);
    localStorage.setItem(ACCENT_VARS_CACHE_KEY, JSON.stringify(vars));
  } catch {
    // Storage blocked: the theme still applies for this visit
  }
}
