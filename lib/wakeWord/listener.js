import { WakeWordDetector, SAMPLE_RATE } from '@/lib/wakeWord/detector';

/**
 * Browser side of the offline "Hey Jarvis" listener (Phase 8.12): ONNX Runtime (WebAssembly, served
 * from this app's static files) runs the openWakeWord models on 80 ms microphone chunks, entirely on this machine.
 * Returns a stop() function. `deviceId` picks the microphone (Phase 8.7 choice).
 */
export async function startOfflineWakeListener({ onWake, deviceId, threshold = 0.5 }) {
  // The bundler emits ONNX Runtime's .wasm with this app's static files, so nothing loads from a CDN
  const ort = await import('onnxruntime-web/wasm');
  ort.env.wasm.numThreads = 1; // no cross-origin isolation here, so no wasm threads
  const model = async (name) => {
    const res = await fetch(`/api/wakeword/model/${name}`);
    if (!res.ok) throw new Error(`Wake word model "${name}" is not installed.`);
    return new Uint8Array(await res.arrayBuffer());
  };
  const detector = await WakeWordDetector.create(ort, { mel: await model('mel'), embedding: await model('embedding'), wakeword: await model('wakeword') }, { threshold });

  const audio = { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) };
  const stream = await navigator.mediaDevices.getUserMedia({ audio });
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  await context.audioWorklet.addModule('/wakeword-worklet.js');
  const source = context.createMediaStreamSource(stream);
  const chunker = new AudioWorkletNode(context, 'wakeword-chunker');
  const silent = context.createGain();
  silent.gain.value = 0; // keep the graph pulling audio without playing the mic back
  source.connect(chunker).connect(silent).connect(context.destination);

  // Chunks are processed strictly in order: the features are a stream, so none may be skipped
  const queue = [];
  let processing = false;
  let stopped = false;
  const drain = async () => {
    if (processing) return;
    processing = true;
    while (queue.length && !stopped) {
      const { detected } = await detector.process(queue.shift());
      if (detected && !stopped) onWake();
    }
    processing = false;
  };
  chunker.port.onmessage = ({ data }) => {
    if (queue.length > 50) queue.splice(0, queue.length - 50); // fell far behind: keep the latest 4 s
    queue.push(data);
    drain();
  };

  return () => {
    stopped = true;
    chunker.port.onmessage = null;
    source.disconnect();
    chunker.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    context.close().catch(() => {});
  };
}
