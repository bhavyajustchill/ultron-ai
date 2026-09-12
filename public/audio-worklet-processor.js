/**
 * AudioWorkletProcessor for high-performance off-thread microphone audio downsampling.
 * Converts 44.1kHz / 48kHz Float32 microphone input to 16kHz 16-bit Linear PCM (Int16)
 * for streaming directly into the Gemini 3.1 Live WebSocket API without blocking WebGL.
 * Buffers samples into ~32ms chunks (512 samples) with continuous phase carryover and linear interpolation.
 */
class PCMDownsamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    // 512 samples at 16kHz = 32ms of audio (1024 bytes), matching Google Gemini Live's recommended 20-40ms chunk size
    this.bufferSize = 512;
    this.outputBuffer = new Int16Array(this.bufferSize);
    this.outputIndex = 0;
    this.phase = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputData = input[0]; // Float32 samples from browser mic (e.g. 48kHz or 44.1kHz)
    const inputLength = inputData.length;
    const ratio = sampleRate / this.targetSampleRate;

    let inIdx = this.phase;
    while (inIdx < inputLength) {
      const idxFloor = Math.floor(inIdx);
      const idxCeil = Math.min(idxFloor + 1, inputLength - 1);
      const frac = inIdx - idxFloor;

      // Linear interpolation for smooth, antialiased downsampling
      const sample = inputData[idxFloor] * (1 - frac) + inputData[idxCeil] * frac;
      const clamped = Math.max(-1, Math.min(1, sample));
      this.outputBuffer[this.outputIndex++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

      if (this.outputIndex >= this.bufferSize) {
        // Post complete 32ms Int16 PCM chunk (1024 bytes)
        const chunk = this.outputBuffer.slice(0);
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
        this.outputIndex = 0;
      }

      inIdx += ratio;
    }

    // Preserve fractional phase across 128-sample Web Audio render quantums
    this.phase = inIdx - inputLength;
    return true;
  }
}

registerProcessor('pcm-downsampler-processor', PCMDownsamplerProcessor);
