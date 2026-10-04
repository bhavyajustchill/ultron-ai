/**
 * HUD colour (DEC-189): the interface is fixed to Arc Reactor Blue. Its colours are authored in
 * electric aqua-cyan (DESIGN_ACCENT) and shifted to blue by ACCENT_TINT, which leaves whites,
 * greys, and status colours (amber, red, green) as they are. CSS reads the blue family from the
 * --jarvis-accent* variables in app/globals.css (their values are ACCENT_TINT of the cyan design);
 * Three.js and canvas code, which cannot read CSS variables, passes its colours through
 * ACCENT_TINT. The selectable themes of Phase 8.7 were removed in DEC-189.
 */

// The colour every accent value is authored in (the tint maps it to HUD_ACCENT)
export const DESIGN_ACCENT = '#00E5FF';
// Arc Reactor Blue
export const HUD_ACCENT = '#00C3FF';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function normalizeHex(input) {
  const text = String(input || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(text)) return `#${text.split('').map((c) => c + c).join('')}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text}`.toUpperCase();
  return null;
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
  const accent = normalizeHex(accentHex) || HUD_ACCENT;
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

// tint(hex) for colours designed in DESIGN_ACCENT cyan (tint.rgb(r, g, b) for pixel loops)
export const ACCENT_TINT = makeTint(HUD_ACCENT);

// The neon highlight tone (--jarvis-accent-2), e.g. for the pairing QR code's modules
export const HUD_NEON = ACCENT_TINT('#00F0FF');
