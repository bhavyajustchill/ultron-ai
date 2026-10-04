/**
 * Microphone / speaker selection (Phase 8.7). Browsers identify devices by an opaque id that can
 * change (e.g. after site data is cleared), so a choice is saved as { id, label } and resolved
 * by id first, then by its label. Browser-only functions; safe to import on the server.
 */

const STORAGE_KEYS = { input: 'jarvis_audio_input', output: 'jarvis_audio_output' };
// Chrome's virtual entries that mirror another device
const PSEUDO_IDS = new Set(['default', 'communications']);

export function loadDeviceChoice(kind) {
  try {
    const choice = JSON.parse(localStorage.getItem(STORAGE_KEYS[kind]) || 'null');
    return choice?.id ? choice : null;
  } catch {
    return null;
  }
}

export function saveDeviceChoice(kind, choice) {
  try {
    if (choice?.id) localStorage.setItem(STORAGE_KEYS[kind], JSON.stringify({ id: choice.id, label: choice.label || '' }));
    else localStorage.removeItem(STORAGE_KEYS[kind]);
  } catch {
    // Storage blocked: the choice lasts for this visit only
  }
}

export function canChooseOutput() {
  return typeof window !== 'undefined' && typeof window.AudioContext?.prototype?.setSinkId === 'function';
}

/**
 * Lists { inputs, outputs, labelled }. Device names are hidden until the page has microphone
 * permission; `requestLabels` asks for it with a short-lived stream.
 */
export async function listAudioDevices({ requestLabels = false } = {}) {
  if (!navigator.mediaDevices?.enumerateDevices) return { inputs: [], outputs: [], labelled: false };
  let devices = await navigator.mediaDevices.enumerateDevices();
  if (requestLabels && !devices.some((d) => d.kind === 'audioinput' && d.label)) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    devices = await navigator.mediaDevices.enumerateDevices();
  }
  const pick = (kind) => {
    const seen = new Set();
    return devices
      .filter((d) => d.kind === kind && !PSEUDO_IDS.has(d.deviceId) && d.deviceId)
      .filter((d) => !seen.has(d.deviceId) && seen.add(d.deviceId))
      .map((d) => ({ id: d.deviceId, label: d.label || '' }));
  };
  const inputs = pick('audioinput');
  return { inputs, outputs: pick('audiooutput'), labelled: inputs.some((d) => d.label) };
}

/**
 * The current id for a saved choice (by id, else by label), or null to use the system default.
 */
export function resolveDevice(devices, choice) {
  if (!choice?.id) return null;
  return devices.find((d) => d.id === choice.id) || (choice.label && devices.find((d) => d.label === choice.label)) || null;
}

/**
 * Best device for a spoken name ("headset", "USB mic", "speakers"): every word must appear in the
 * label; among matches the shortest label wins (the most specific device).
 */
export function matchDeviceByName(devices, name) {
  const words = String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !['the', 'my', 'mic', 'microphone', 'speaker', 'speakers', 'output', 'input'].includes(w));
  const candidates = devices.filter((d) => d.label);
  if (!words.length) {
    // Only generic words ("speakers"): fall back to a substring match on the raw text
    const raw = String(name || '').toLowerCase().trim();
    return candidates.find((d) => d.label.toLowerCase().includes(raw)) || null;
  }
  return candidates
    .filter((d) => words.every((w) => d.label.toLowerCase().includes(w)))
    .sort((a, b) => a.label.length - b.label.length)[0] || null;
}
