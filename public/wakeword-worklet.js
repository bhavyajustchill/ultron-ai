/**
 * AudioWorklet for the offline wake word (Phase 8.12): the AudioContext runs at 16 kHz, so this
 * only gathers 1280-sample (80 ms) chunks and posts them on the int16 scale openWakeWord expects.
 */
class WakewordChunker extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(1280);
    this.filled = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = Math.max(-1, Math.min(1, channel[i])) * 32767;
      if (this.filled === this.buffer.length) {
        this.port.postMessage(this.buffer.slice(0));
        this.filled = 0;
      }
    }
    return true;
  }
}

registerProcessor('wakeword-chunker', WakewordChunker);
