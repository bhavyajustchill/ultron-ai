/**
 * Offline "Hey Jarvis" detector (Phase 8.12): a streaming JavaScript port of the openWakeWord
 * pipeline (Apache-2.0 code by David Scripka; the pre-trained models are CC BY-NC-SA 4.0 and are
 * downloaded by the operator, not shipped). Audio runs fully on-device through three ONNX models:
 *
 *   16 kHz int16 audio, 80 ms chunks (1280 samples, plus 480 samples of overlap)
 *     → melspectrogram.onnx   → 8 frames × 32 mel bins per chunk (scaled x / 10 + 2)
 *     → embedding_model.onnx  → one 96-value embedding per chunk from the last 76 mel frames
 *     → hey_jarvis_v0.1.onnx  → wake score 0..1 from the last 16 embeddings (~1.3 s of audio)
 *
 * The ONNX runtime is injected (onnxruntime-web in the browser), so the same code runs in tests.
 */

export const SAMPLE_RATE = 16000;
export const SAMPLES_PER_CHUNK = 1280;
const OVERLAP_SAMPLES = 480; // 3 hops of 160 samples so consecutive mel windows line up
const MEL_BINS = 32;
const MEL_WINDOW = 76;
const EMBEDDING_SIZE = 96;
const EMBEDDINGS_FOR_SCORE = 16;
const MAX_MEL_FRAMES = 970;
const MAX_EMBEDDINGS = 120;

export class WakeWordDetector {
  constructor(ort, sessions, { threshold = 0.5, cooldownMs = 2000 } = {}) {
    this.ort = ort;
    this.sessions = sessions;
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
    this.reset();
  }

  /**
   * `sources` are model bytes (ArrayBuffer / Uint8Array) or URLs, keyed mel / embedding / wakeword.
   */
  static async create(ort, sources, options) {
    const load = (source) => ort.InferenceSession.create(source);
    const [mel, embedding, wakeword] = await Promise.all([load(sources.mel), load(sources.embedding), load(sources.wakeword)]);
    return new WakeWordDetector(ort, { mel, embedding, wakeword }, options);
  }

  reset() {
    this.tail = new Float32Array(OVERLAP_SAMPLES);
    // openWakeWord starts the mel buffer at ones so the first embeddings are well-formed
    this.melFrames = Array.from({ length: MEL_WINDOW }, () => new Float32Array(MEL_BINS).fill(1));
    this.embeddings = [];
    this.lastTriggerAt = 0;
  }

  /**
   * Feeds one 80 ms chunk (1280 samples on the int16 scale, i.e. -32768..32767, as float32) and
   * returns { score, detected }. score is null until ~1.3 s of audio has been heard.
   */
  async process(chunk, now = Date.now()) {
    if (chunk.length !== SAMPLES_PER_CHUNK) throw new Error(`Expected ${SAMPLES_PER_CHUNK} samples, got ${chunk.length}.`);
    const { ort, sessions } = this;

    const audio = new Float32Array(OVERLAP_SAMPLES + SAMPLES_PER_CHUNK);
    audio.set(this.tail, 0);
    audio.set(chunk, OVERLAP_SAMPLES);
    this.tail = audio.slice(-OVERLAP_SAMPLES);

    const melOut = await sessions.mel.run({ [sessions.mel.inputNames[0]]: new ort.Tensor('float32', audio, [1, audio.length]) });
    const mel = melOut[sessions.mel.outputNames[0]];
    const frames = mel.dims[2];
    for (let f = 0; f < frames; f++) {
      const row = new Float32Array(MEL_BINS);
      for (let b = 0; b < MEL_BINS; b++) row[b] = mel.data[f * MEL_BINS + b] / 10 + 2;
      this.melFrames.push(row);
    }
    if (this.melFrames.length > MAX_MEL_FRAMES) this.melFrames.splice(0, this.melFrames.length - MAX_MEL_FRAMES);

    const window = new Float32Array(MEL_WINDOW * MEL_BINS);
    this.melFrames.slice(-MEL_WINDOW).forEach((row, i) => window.set(row, i * MEL_BINS));
    const embOut = await sessions.embedding.run({ [sessions.embedding.inputNames[0]]: new ort.Tensor('float32', window, [1, MEL_WINDOW, MEL_BINS, 1]) });
    this.embeddings.push(Float32Array.from(embOut[sessions.embedding.outputNames[0]].data));
    if (this.embeddings.length > MAX_EMBEDDINGS) this.embeddings.shift();
    if (this.embeddings.length < EMBEDDINGS_FOR_SCORE) return { score: null, detected: false };

    const features = new Float32Array(EMBEDDINGS_FOR_SCORE * EMBEDDING_SIZE);
    this.embeddings.slice(-EMBEDDINGS_FOR_SCORE).forEach((e, i) => features.set(e, i * EMBEDDING_SIZE));
    const scoreOut = await sessions.wakeword.run({ [sessions.wakeword.inputNames[0]]: new ort.Tensor('float32', features, [1, EMBEDDINGS_FOR_SCORE, EMBEDDING_SIZE]) });
    const score = scoreOut[sessions.wakeword.outputNames[0]].data[0];
    const detected = score >= this.threshold && now - this.lastTriggerAt > this.cooldownMs;
    if (detected) this.lastTriggerAt = now;
    return { score, detected };
  }
}
