/**
 * PCMStreamPlayer — Low-latency gapless 24kHz raw PCM audio player for Gemini Live API.
 * Uses Web Audio API with clock-synced jitter scheduling and sub-50ms instant barge-in flush.
 */
export class PCMStreamPlayer {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.ctx = null;
    this.analyser = null;
    this.nextStartTime = 0;
    this.activeSources = new Set();
    this.frequencyData = null;
    this.onPlaybackStateChange = null;
    this.suspendedQueue = [];
  }

  initContext() {
    if (this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.drainSuspendedQueue();
        }).catch(() => {});
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass({ sampleRate: this.sampleRate });

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.smoothingTimeConstant = 0.2;
    this.analyser.connect(this.ctx.destination);

    // Pre-allocate frequency data array to prevent garbage collection in render loops
    this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
    this.nextStartTime = 0;

    this.ctx.onstatechange = () => {
      if (this.ctx && this.ctx.state === 'running') {
        this.drainSuspendedQueue();
      }
    };
  }

  drainSuspendedQueue() {
    if (!this.ctx || this.ctx.state !== 'running' || this.suspendedQueue.length === 0) return;
    const queue = this.suspendedQueue;
    this.suspendedQueue = [];
    for (const chunk of queue) {
      this._scheduleChunk(chunk);
    }
  }

  /**
   * Schedules a raw 24kHz Int16 or Float32 PCM chunk for gapless playback.
   * @param {ArrayBuffer|Int16Array|Uint8Array} rawChunk
   */
  playChunk(rawChunk) {
    this.initContext();

    if (this.ctx.state === 'suspended') {
      this.suspendedQueue.push(rawChunk);
      this.ctx.resume().then(() => {
        this.drainSuspendedQueue();
      }).catch(() => {});
      return;
    }

    this._scheduleChunk(rawChunk);
  }

  _scheduleChunk(rawChunk) {
    // Convert chunk to Float32Array
    let float32Array;
    if (rawChunk instanceof Float32Array) {
      float32Array = rawChunk;
    } else if (rawChunk instanceof Int16Array) {
      float32Array = new Float32Array(rawChunk.length);
      for (let i = 0; i < rawChunk.length; i++) {
        float32Array[i] = rawChunk[i] / 32768;
      }
    } else if (rawChunk instanceof ArrayBuffer) {
      const int16 = new Int16Array(rawChunk);
      float32Array = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32Array[i] = int16[i] / 32768;
      }
    } else if (rawChunk instanceof Uint8Array) {
      // Decode 16-bit little endian bytes to Float32
      const int16 = new Int16Array(
        rawChunk.buffer,
        rawChunk.byteOffset,
        Math.floor(rawChunk.byteLength / 2)
      );
      float32Array = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32Array[i] = int16[i] / 32768;
      }
    } else {
      console.warn('[PCMStreamPlayer] Unrecognized chunk format:', rawChunk);
      return;
    }

    if (float32Array.length === 0) return;

    // Create single-channel audio buffer
    const buffer = this.ctx.createBuffer(1, float32Array.length, this.sampleRate);
    buffer.copyToChannel(float32Array, 0);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.analyser);

    // Schedule gapless playback with jitter compensation
    const currentTime = this.ctx.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.035; // 35ms initial jitter buffer
    }

    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0 && this.onPlaybackStateChange) {
        this.onPlaybackStateChange(false);
      }
    };

    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange(true);
    }
  }

  /**
   * Instant Barge-in: Truncates all playing/queued audio within 50ms and resets playback queue.
   */
  stopAndFlush() {
    this.suspendedQueue = [];
    // Immediately stop and disconnect all scheduled sources
    for (const source of this.activeSources) {
      try {
        source.stop(0);
        source.disconnect();
      } catch {
        // Source may already have completed
      }
    }
    this.activeSources.clear();

    if (this.ctx) {
      this.nextStartTime = this.ctx.currentTime;
    }

    if (this.onPlaybackStateChange) {
      this.onPlaybackStateChange(false);
    }
  }

  /**
   * Reads current FFT frequency spectrum into the pre-allocated Uint8Array.
   * Zero GC allocation for use inside useFrame or requestAnimationFrame.
   */
  getByteFrequencyData() {
    if (this.analyser && this.frequencyData) {
      this.analyser.getByteFrequencyData(this.frequencyData);
      return this.frequencyData;
    }
    return null;
  }

  /**
   * Calculates instantaneous RMS vocal power from the frequency data (0 to 1).
   */
  getInstantEnergy() {
    const data = this.getByteFrequencyData();
    if (!data || data.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return sum / (data.length * 255);
  }

  destroy() {
    this.stopAndFlush();
    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        this.ctx.close();
      } catch {
        // Ignore close errors
      }
    }
    this.ctx = null;
    this.analyser = null;
  }
}
