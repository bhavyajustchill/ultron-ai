# 🛡️ AI CODING RULES & GUARDRAILS — PROJECT ULTRON
**Codename:** Protocol-Rules // Engineering Standards  
**Scope:** Next.js 16, React 19, JavaScript (JSX), Three.js, Web Audio API  

---

## 1. Strict JavaScript & JSX Conventions

* **No TypeScript / No TSX:** 
  - All source files MUST use `.js` or `.jsx` extensions.
  - Strictly NO `.ts` or `.tsx` files.
  - Do not use TypeScript type annotations, interfaces, or type assertions.
  - If code documentation is needed, use standard JSDoc comments (`/** @param {Object} props */`).
* **Component Architecture:**
  - Standard Functional Components with clean prop destructuring:
    ```jsx
    export const AdaAvatar = ({ lipSyncRef, scale = 1.8 }) => { ... };
    ```
  - Next.js Client Components that handle 3D Canvas, Web Audio, or WebSockets MUST declare `'use client';` at the very top.
  - Server Components should be used for initial page shells, metadata, and static UI wrappers.
* **State Management:**
  - Avoid putting high-frequency streaming audio data (FFT bins, PCM chunks) into React state. Use `useRef` or Zustand stores to avoid re-rendering the whole DOM on every audio frame.

---

## 2. 3D WebGL & React Three Fiber (R3F) Guardrails

* **Zero Garbage Collection in `useFrame`:**
  - NEVER instantiate new `Vector3`, `Euler`, `Matrix4`, or `Color` objects inside `useFrame()`. Reuse pre-allocated instance variables outside the frame loop.
  - NEVER call `setState()` inside `useFrame()`. Update `ref.current.morphTargetInfluences` or bone transforms directly.
* **Asset Disposal & Cleanup:**
  - Always clean up Three.js materials, textures, and geometries when unmounting components to avoid WebGL context leaks.
* **Asset Optimization:**
  - All 3D models must be Draco or Meshopt compressed.
  - Textures must be power-of-two ($1024 \times 1024$ or $2048 \times 2048$) in WebP or optimized PNG format.

---

## 3. Web Audio API & Streaming Guardrails

* **Off-Thread Audio Processing:**
  - Microphone downsampling MUST execute inside an `AudioWorkletProcessor` (`audio-worklet-processor.js`), NEVER on the main browser thread.
* **Autoplay Policy Handling:**
  - Check and handle `audioContext.state === 'suspended'` on user click/interaction before attempting playback or recording.
* **Zero Audio Glitch Scheduling:**
  - Incoming 24kHz PCM chunks must be queued using precise Web Audio clock time (`audioContext.currentTime + offset`) to ensure gapless streaming.
* **Barge-In (Instant Interruption):**
  - When the operator speaks or clicks the interrupt button, immediately call `stopAndFlush()` to terminate active audio sources and reset the jitter queue within 50ms.

---

## 4. Cyberpunk UI & Styling Conventions

* **Color Tokens:**
  - Only use configured Tailwind cyberpunk tokens: `var(--ada-scarlet)`, `var(--cyber-cyan)`, `var(--carbon-900)`, etc.
  - Never use plain browser default reds or blues.
* **Visual Hierarchy:**
  - Keep the 3D viewport of Ada Wong unobstructed in the center.
  - Telemetry, comms logs, and controls must reside on the peripheral HUD borders with glassmorphism (`backdrop-blur-md`, subtle border opacity).
* **Typography:**
  - Headers and status badges: `font-orbitron`.
  - Transcripts, latency numbers, and telemetry: `font-mono` (`JetBrains Mono`).
  - General readout: `font-rajdhani`.

---

## 5. Error Handling & Tool Execution

* **Graceful Degradation:**
  - If WebGL2 is unsupported, display a high-tech fallback HUD terminal instead of a blank screen.
  - If the Gemini 2.5 Live WebSocket drops connection, immediately show a reconnecting status pill and execute exponential backoff.
* **Non-Blocking Tool Calls:**
  - Long-running tools (like deep web search or local file scans) must never freeze the audio thread or 3D animation loop.
  - Always inform the user via Ada's voice channel or HUD comms log while a tool is in flight.
