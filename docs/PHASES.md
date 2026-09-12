# 🚀 IMPLEMENTATION PHASES — PROJECT A.D.A

**Codename:** Deployment Roadmap // Operative-Wong  
**Architecture:** Next.js 16 + Three.js (R3F) + JavaScript (JSX) + Gemini Live WebSockets  
**Active 3D Model:** [`adawong.glb`](./adawong.glb) (7.29 MB, 10 Meshes, 220 Joints)  
**Reference Document:** [`ada_wong_realtime_voice_spec.md`](../ada_wong_realtime_voice_spec.md)

---

## Phase Overview Matrix

```
[Phase 0: Scaffolding] ➔ [Phase 1: Voice Engine] ➔ [Phase 2: 3D Lip-Sync]
                                                          │
[Phase 6: Mark-LI Parity] 🠔 [Phase 5: Polish/PWA] 🠔 [Phase 4: Agent Tools]  🠔 [Phase 3: Cyber HUD]
```

---

## Phase 0: Scaffolding & Cyber-Assets (Foundations)

- [x] **Next.js 16 Foundation:** Setup Next.js 16 App Router with JavaScript (JSX), TailwindCSS, and Turbopack.
- [x] **Audio Ingest Worklet:** Implement `public/audio-worklet-processor.js` for off-thread 48kHz ➔ 16kHz Int16 downsampling.
- [x] **3D Model Asset Verified:**
  - Active model confirmed: [`docs/adawong.glb`](./adawong.glb) (7.29 MB).
  - Structure verified: 10 skinned sub-meshes (`pl0100_00Face`, `pl1200_11nuno`, `pl0100_31SideHair`, etc.).
  - Rig verified: 220 joints with `bone23_022` (Head) and `bone22_01` (Neck).
  - [x] Copy to `public/models/adawong.glb` for direct Next.js static serving (7.29 MB verified).
- [x] **Design Tokens & Fonts:** Configure Tailwind cyberpunk variables, scanline animations, and import fonts (`Orbitron`, `JetBrains Mono`, `Rajdhani`).

---

## Phase 1: Real-Time Audio Engine & Gemini Live WebSocket

- [x] **WebSocket Proxy Gateway:** Next.js 16 API route `/api/live-session/route.js` creating ephemeral sessions and minting secure Gemini WebSocket connections.
- [x] **Bi-directional Live Stream:**
  - Client `useGeminiLive.js` hook connecting to `models/gemini-3.1-flash-live-preview`.
  - Stream 16kHz PCM chunks via `session.send_realtime_input`.
  - Receive 24kHz raw PCM server chunks asynchronously.
- [x] **Gapless Audio Player (`pcmPlayer.js`):**
  - Schedule chunks with `AudioBufferSourceNode` using jitter buffers.
  - Implement instant barge-in `stopAndFlush()` triggered on user speech or manual interrupt.
- [x] **Persona Injection:** Inject Ada Wong system instructions, tone parameters, and affective dialog toggles.

---

## Phase 2: 3D Hologram & Lip-Sync Core with `adawong.glb`

- [x] **3D Viewport Setup:** Create `AdaViewport.js` loading `adawong.glb` via `@react-three/drei` `useGLTF`.
- [x] **Lighting & Shadows:** Configure cyberpunk dual-rim lighting (Scarlet `#FF003C` + Cyan `#00F0FF`).
- [x] **Gaze Tracking System (`useGazeTracking.js`):**
  - Target `bone23_022` (Head) and `bone22_01` (Neck).
  - Interpolate bone rotations smoothly toward normalized mouse screen space via `Quaternion.slerp`.
- [x] **Audio-Reactive Lip-Sync (`useLipSync.js`):**
  - Connect `pcmPlayer.js` output to `AnalyserNode`.
  - Drive facial animation (morph targets if baked, or jaw bone child nodes of `bone23_022`).
- [x] **Procedural Idle Motion:**
  - Sine-based breathing motion on spine `bone21_00` and root node.

---

## Phase 3: Cyberpunk Tactical HUD & Interface

- [x] **HUD Shell:** Built high-contrast glassmorphic HUD overlay components (`TelemetryPanel.jsx`, `TacticalDrawer.jsx`, `AudioWaveform.jsx`).
- [x] **Audio Waveform Canvas:** Real-time oscillating neon frequency visualizer (`AudioWaveform.jsx`).
- [x] **Comms Log Feed:** Live dialogue transcript, user prompts, Ada replies, tactical markdown rendering (`MarkdownText.jsx`), and quick mic toggle (`CommsLog.jsx`).
- [x] **Telemetry Dashboard:** Live holographic gauges displaying latency, audio status (`LISTENING`, `THINKING`, `SPEAKING`, `CONNECTED`), 220-joint skeletal parameters, and system metrics (`TelemetryPanel.jsx`).
- [x] **Tactical Intel Drawer:** Smooth sliding bottom panel with tabs for Operative Dossier, Neural Intel, and System Matrix (`TacticalDrawer.jsx`).

---

## Phase 4: Full Mark-LI Feature Parity & Tool Suite

- [x] **Multimodal Vision:**
  - [x] Integrate `navigator.mediaDevices.getDisplayMedia` for real-time desktop screen interrogation (`ScreenShareModal.jsx`).
  - [x] Integrate `navigator.mediaDevices.getUserMedia` for operator webcam optical inspection (`WebCamPiP.jsx`).
- [x] **Intelligence & Search Tools:**
  - [x] Register `web_search` tool (Grounded Gemini Search + DuckDuckGo fallback).
  - [x] Auto-render search results, flight tables, and news headlines into the Intel Drawer.
- [x] **Deep Memory & Briefing Protocol:**
  - [x] Long-term memory store (`data/memories.json` + `/api/memory`) for operator identity, profile, and directives.
  - [x] Registered `recall_memory` and `store_memory` tools for dynamic voice-driven recall and preservation.
  - [x] Interactive `MEMORY VAULT` tab in Tactical Drawer with manual entry and profile configuration.
  - [x] **Morning & Tactical Briefing Protocol (UI & Memory Baseline):** Text telemetry briefing, HUD trigger button, and long-term memory integration. _(Real-time spoken Gemini audio delivery & news audio streaming detailed in Phase 6.1)._
- [x] **Local Companion Bridge (OS Automation):**
  - [x] Live System Telemetry Bridge & Mark-LI SYS MONITOR (CPU, MEM, NET, GPU, TMP, Uptime, Processes, OS) via `/api/system-telemetry`.
  - [x] Registered `get_system_telemetry` Gemini 2.5 Live tool for real-time vocal resource reporting.
  - [x] Native OS desktop action controller (`/api/os-control`) for volume, whitelisted app launch, workspace folder, minimize, and lock screen.
  - [x] Registered `execute_os_action` Gemini 2.5 Live tool for vocal desktop automation.
- [x] **Cyber-Plugin Matrix:**
  - [x] Drop-in JavaScript plugin architecture in `plugins/` (`systemDiagnostic`, `cyberCrypto`, `networkPing`, `workspaceNavigator`).
  - [x] Plugin discovery, registry, and execution route (`lib/pluginRegistry.js`, `/api/plugins`).
  - [x] Registered `run_cyber_plugin` Gemini 2.5 Live tool for voice-activated plugin execution.
  - [x] Interactive `OS & PLUGINS` tab in Tactical Drawer with desktop controls and live plugin console.

---

## Phase 5: Post-Processing, Performance Polish & Mobile PWA

- [x] **Post-Processing Shaders & Opt-Out Tuning:**
  - [x] Pure WebGL direct rasterization baseline for maximum FPS; optional Cyber-Optics shader controls in `TacticalDrawer.jsx` and top camera bar `[FX: ON/OFF]`.
- [x] **Performance Benchmarks & Profiler:**
  - [x] Ensure consistent 60–120+ FPS on integrated and dedicated GPUs (verified at 120–220 FPS).
  - [x] Zero-GC audit on all `useFrame()` hooks (`AdaAvatar.jsx`, `useGazeTracking.js`, `useLipSync.js`).
  - [x] Live 1-second sampled zero-allocation FPS & frame time telemetry profiler integrated into `TelemetryPanel.jsx` (`RenderProfilerBadge`).
  - [x] Verify end-to-end voice latency remains under 500ms with real-time status indicators.
- [x] **Mobile Remote Dashboard (PWA):**
  - [x] Local LAN network discovery via `os.networkInterfaces()` and pairing endpoint (`/api/mobile-pairing`).
  - [x] High-contrast SVG QR Code generator (`lib/qrCode.js`) and tactical pairing dialog (`MobilePairingModal.jsx`).
  - [x] Standalone mobile PWA dashboard (`/mobile`) with Web App Manifest (`app/manifest.js`), responsive viewport, and touch controls.
  - [x] Bidirectional Push-to-Talk (PTT) mobile mic relay and remote desktop OS action bridge (`/api/relay`).

---

## Phase 6: Advanced Mark-LI Parity & Autonomous Agent Capabilities

- [x] **6.1 Spoken Startup Greeting & Two-Phase Morning Tactical Briefing:**
  - [x] Dispatch an immediate client content directive turn to Gemini Live on `msg.setupComplete` instructing Ada to speak a 2-sentence tactical greeting aloud (<1s latency) announcing time of day and status.
  - [x] Pre-fetch top world news headlines in parallel via DuckDuckGo/Grounding while Phase 1 audio plays.
  - [x] Automatically deliver spoken news summary upon Phase 1 completion and populate the HUD Intel Drawer with headline dossiers.
  - [x] Respect `localStorage` microphone mute preference: greet via audio while maintaining mic muted state.
- [ ] **6.1.5 Mark-LIII Settings Suite & Dynamic Neural Memory Ingestion:**
  - [ ] Implement Left-Sidebar Settings tab (`SETTINGS` / `⚙`) in `TelemetryPanel.jsx` with header shortcut button.
  - [ ] Provide configurable Operative Identity inputs: Name to Call (`callsign` e.g. "Bhavya Sir"), Role, Clearance, and Directives.
  - [ ] Provide Assistant Customization: Assistant Codename and Gemini Prebuilt Voice Selector (`Aoede`, `Charon`, `Fenrir`, `Kore`, `Puck`).
  - [ ] Add automation toggles for Morning Briefing auto-trigger and default mic mute.
  - [ ] Dynamically inject profile, strict address mandates, and active long-term memories into Gemini Live's `systemInstruction` on `/api/live-session`.
  - [ ] Register and handle `update_operator_profile` live tool for autonomous voice-driven identity updates.
  - [ ] Persist settings atomically to `data/memories.json` and sync Zustand store.
- [ ] **6.2 Session Continuity Memory & Automated Conversation Recaps:**
  - [ ] Buffer active session dialog turns in `useAdaStore` / session state.
  - [ ] Upon session disconnect or conversation lull, call Gemini Flash to generate a concise 1–2 sentence summary saved to `data/sessions.json`.
  - [ ] Implement `pop_last_session()` on startup to inject the previous session's context into Ada's spoken greeting (_"Last time we spoke, you were working on..."_) and consume it immediately so it never repeats.
  - [ ] Implement silent spoken language detection: automatically record operator language in identity profile and adapt subsequent greetings.
- [ ] **6.3 Autonomous Proactive 2.0 Engine (Idle Voice Check-Ins):**
  - [ ] Implement `ProactiveEngine` timer evaluating operator silence duration (15 min silence gate, 20 min cooldown).
  - [ ] Rotating prompt builder cycling between:
    - _Focus 1:_ Operator's active projects & goals in memory.
    - _Focus 2:_ Time of day & operator wellbeing (late-night check-in, rest reminder).
    - _Focus 3:_ Relevant tactical suggestions or technical tips.
  - [ ] Smart silence gating: abort trigger if Ada is speaking or if operator spoke within last 30 seconds.
- [ ] **6.4 Full Host OS Desktop Automation Bridge (Execution Layer):**
  - [ ] Upgrade `/api/os-control` with robust local Node.js `child_process` / PowerShell execution handlers.
  - [ ] Keyboard typing and hotkey execution (`Ctrl+C`, `Ctrl+V`, `Alt+Tab`, `Enter`).
  - [ ] Mouse automation: coordinate click, double-click, right-click, and mouse scrolling.
  - [ ] Window focus, maximize, minimize, and process termination.
  - [ ] Desktop operations: set wallpaper from local path or URL, desktop icon organization by file type or date.
- [ ] **6.5 Browser Automation Engine (Playwright Integration):**
  - [ ] Create dedicated browser automation module supporting Chrome, Edge, and Brave with real user profiles.
  - [ ] Implement voice-controlled actions: go to URL, smart search, CSS/semantic click, form input, element extraction, scrolling, and full-page screenshots.
- [ ] **6.6 Deep Multi-Format File Processor & Autonomous Dev Agent:**
  - [ ] Drag-and-drop file upload zone on the HUD supporting images (OCR, resize, compress), PDFs (extract text, summarize), CSV/Excel (filter, stats), and audio/video (transcribe, trim).
  - [ ] Autonomous Dev Agent: multi-file code generator scaffolding complete projects in `~/Desktop/AdaProjects`.
  - [ ] Self-healing execution loop: execute code, capture terminal stdout/stderr, parse tracebacks, and automatically repair errors up to 5 attempts.
- [ ] **6.7 Background Topic Intelligence Monitoring & Hardware Voice Warnings:**
  - [ ] Topic monitoring service checking user-defined topics daily via DuckDuckGo search.
  - [ ] Proactive voice alert delivery when breaking headlines emerge on tracked topics.
  - [ ] Telemetry threshold monitor: speak verbal warnings when CPU temperature exceeds 85°C or RAM usage exceeds 92%.
- [ ] **6.8 Native OS Scheduled Reminders & Tactical Integrations:**
  - [ ] Integrate Windows Task Scheduler (`schtasks.exe`) to schedule native OS toast notifications for reminders.
  - [ ] Game updater tool: Steam AppID lookup, update check, and scheduled off-peak downloads with auto-shutdown.
  - [ ] Voice-driven YouTube playback control and Google Flights price lookup.

