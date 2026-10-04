import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * openWakeWord model files for the offline "Hey Jarvis" listener (Phase 8.12). They are licensed
 * CC BY-NC-SA 4.0 (non-commercial), so Jarvis does not ship them: the operator installs them from
 * Settings, downloaded from the openWakeWord v0.5.1 release and checked against pinned SHA-256s.
 *
 * Test override: JARVIS_WAKEWORD_DIR, JARVIS_WAKEWORD_BASE_URL.
 */

export const WAKEWORD_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.JARVIS_WAKEWORD_DIR || path.join(process.cwd(), 'data', 'wakeword'));
const BASE_URL = process.env.JARVIS_WAKEWORD_BASE_URL || 'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1';

export const WAKEWORD_MODELS = {
  mel: { file: 'melspectrogram.onnx', bytes: 1087958, sha256: 'ba2b0e0f8b7b875369a2c89cb13360ff53bac436f2895cced9f479fa65eb176f' },
  embedding: { file: 'embedding_model.onnx', bytes: 1326578, sha256: '70d164290c1d095d1d4ee149bc5e00543250a7316b59f31d056cff7bd3075c1f' },
  wakeword: { file: 'hey_jarvis_v0.1.onnx', bytes: 1271370, sha256: '94a13cfe60075b132f6a472e7e462e8123ee70861bc3fb58434a73712ee0d2cb' },
};

export const WAKEWORD_LICENSE =
  'openWakeWord pre-trained models by David Scripka, licensed CC BY-NC-SA 4.0 (non-commercial use, share-alike, attribution). Code: Apache-2.0.';

export function modelPath(name) {
  const model = WAKEWORD_MODELS[name];
  return model ? path.join(/*turbopackIgnore: true*/ WAKEWORD_DIR, model.file) : null;
}

export function wakewordStatus() {
  const models = Object.entries(WAKEWORD_MODELS).map(([name, model]) => {
    const file = modelPath(name);
    return { name, file: model.file, installed: fs.existsSync(file) && fs.statSync(file).size === model.bytes };
  });
  return { installed: models.every((m) => m.installed), models, license: WAKEWORD_LICENSE };
}

/**
 * Downloads any missing model, refusing a file whose SHA-256 does not match the pinned value.
 */
export async function installWakewordModels() {
  fs.mkdirSync(WAKEWORD_DIR, { recursive: true });
  for (const [name, model] of Object.entries(WAKEWORD_MODELS)) {
    const target = modelPath(name);
    if (fs.existsSync(target) && fs.statSync(target).size === model.bytes) continue;
    const res = await fetch(`${BASE_URL}/${model.file}`, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`Downloading ${model.file} failed (HTTP ${res.status}).`);
    const bytes = Buffer.from(await res.arrayBuffer());
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    if (digest !== model.sha256) throw new Error(`${model.file} did not match its expected checksum, so it was not installed.`);
    fs.writeFileSync(`${target}.tmp`, bytes);
    fs.renameSync(`${target}.tmp`, target);
  }
  return wakewordStatus();
}

export function removeWakewordModels() {
  for (const name of Object.keys(WAKEWORD_MODELS)) fs.rmSync(modelPath(name), { force: true });
  return wakewordStatus();
}
