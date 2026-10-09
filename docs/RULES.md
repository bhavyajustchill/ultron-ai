# 🛡️ AI CODING RULES & GUARDRAILS — PROJECT ULTRON
**Codename:** Protocol-Rules // Engineering Standards  
**Scope:** Next.js 16, React 19, JavaScript (JSX), Three.js, Web Audio API  
**Reference Documents:** [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`DESIGN.md`](./DESIGN.md), [`ECOSYSTEM.md`](./ECOSYSTEM.md)

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
    export const ArcReactorOrb = ({ getInputByteFrequencyData, pcmPlayer, onToggleListening }) => { ... };
    ```
  - Next.js Client Components that handle 3D Canvas, Web Audio, or WebSockets MUST declare `'use client';` at the very top.
  - Server Components should be used for initial page shells, metadata, and static UI wrappers.
* **State Management:**
  - Avoid putting high-frequency streaming audio data (FFT bins, PCM chunks) into React state. Use `useRef` or the Zustand store (`useJarvisStore` in `lib/store.js`) to avoid re-rendering the whole DOM on every audio frame.

---

## 2. 3D WebGL Guardrails (Three.js Orb & R3F Model Viewer)

* **Zero Garbage Collection in the frame loop:**
  - The Ultron Orb (`lib/ultronOrbScene.js`) is a plain Three.js scene: NEVER instantiate new `Vector3`, `Euler`, `Matrix4`, or `Color` objects inside its `animate()` loop. Reuse pre-allocated instance variables.
  - The 3D model viewer (`components/Media/ModelViewerPanel.jsx`) uses React Three Fiber: the same rule applies inside `useFrame()`, and NEVER call `setState()` there. Mutate refs (positions, rotations, material uniforms, light intensities) directly.
* **The orb keeps its gold:** the orb never reads the HUD colour theme. Its colours are Ultron's own and do not change with the theme.
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
  - When the operator clicks the interrupt button, immediately call `stopAndFlush()` to terminate active audio sources and reset the jitter queue within 50ms.
  - Speech does not interrupt (`DEC-172`): while Ultron is replying (speaking, running a tool call, or within 300 ms of his voice stopping) the microphone sends silence to Gemini, so only INTERRUPT can cut a reply short.

---

## 4. Cyberpunk UI & Styling Conventions

* **Color Tokens:**
  - HUD accent colours go through the theme variables: `var(--jarvis-accent)`, `var(--jarvis-accent-2)`, `var(--jarvis-accent-soft)`, `var(--jarvis-accent-dim)`, and `rgba(var(--jarvis-accent-rgb), a)`, so colour themes apply (Stark Gold is the default value). Canvas and Three.js colours use `useAccentTint()`. Fixed tokens: `var(--amber-alert)`, `var(--carbon-900)`, etc.
  - Tailwind arbitrary values must not contain spaces (`rgba(255,184,0,0.25)`, not `rgba(255, 184, 0,0.25)`); a class with spaces is silently dropped.
  - Never use plain browser default reds or blues.
* **Visual Hierarchy:**
  - Keep the Ultron Orb unobstructed in the center; Systems and Comms Log stay stacked in the left column, Intel top right.
  - Sharp 90° corners everywhere (no `rounded-*`, no chamfer clip-paths on panels); `app/globals.css` enforces this for HUD panels.
  - Telemetry, comms logs, and controls must reside on the peripheral HUD borders with glassmorphism (`backdrop-blur-md`, subtle border opacity).
* **Typography:**
  - Headers and status badges: `font-orbitron`.
  - Transcripts, latency numbers, and telemetry: `font-mono` (`JetBrains Mono`).
  - General readout: `font-rajdhani`.

---

## 5. Error Handling & Tool Execution

* **Graceful Degradation:**
  - If WebGL2 is unsupported, display a high-tech fallback HUD terminal instead of a blank screen.
  - If the Gemini Live WebSocket drops connection, immediately show a reconnecting status pill (`RECONNECTING`) and execute exponential backoff, resuming the session via its latest resumption handle.
* **Non-Blocking Tool Calls:**
  - Long-running tools (like deep web search or local file scans) must never freeze the audio thread or 3D animation loop.
  - Always inform the user via Ultron's voice channel or HUD comms log while a tool is in flight.

---

## 6. Cross-Machine & Ecosystem Portability Guardrails

* **Dual-Machine Workstation Topology:**
  - The codebase must run seamlessly on both development workstations:
    - **Linux:** `/home/bhavyajustchill/dev/_Fun/desktop_ai/ultron-ai` (Ubuntu 26.04, Wayland/bash)
    - **Windows:** `F:\__Development\__Fun\desktop_ai\ultron-ai` (Windows 11, PowerShell/cmd)
* **Path Normalization:**
  - NEVER hardcode absolute Unix or Windows paths in runtime logic. Always use `path.join()`, `path.resolve()`, or `os.homedir()`.
  - Filesystem sandbox roots must resolve relative to user homedir on both machines.
* **Portable Relative Sibling References:**
  - All 5 desktop AI projects (`jarvis-mark-ii`, `ada_autonomous-desktop-agent`, `alfred`, `ev`, `ultron-ai`) sit side-by-side in `desktop_ai/`.
  - Always reference sibling assistants using portable relative paths (`../<sibling>` from repository root; `../../<sibling>/docs/` from markdown docs).
  - Git remotes must use portable relative URLs (`../jarvis-mark-ii`). See [`ECOSYSTEM.md`](./ECOSYSTEM.md) for full details.
