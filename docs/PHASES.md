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
        │
        ▼
[Phase 7: J.A.R.V.I.S Feature Matrix (features.txt)]  ◀ ACTIVE
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
- [x] **6.1.5 Mark-LIII Settings Suite & Dynamic Neural Memory Ingestion:** _(Shipped as `SciFiSettingsModal.jsx` behind the header ⚙ button rather than a sidebar tab; the voice selector now covers 16 male Gemini voices.)_
  - [x] Implement Left-Sidebar Settings tab (`SETTINGS` / `⚙`) in `TelemetryPanel.jsx` with header shortcut button.
  - [x] Provide configurable Operative Identity inputs: Name to Call (`callsign` e.g. "Bhavya Sir"), Role, Clearance, and Directives.
  - [x] Provide Assistant Customization: Assistant Codename and Gemini Prebuilt Voice Selector (`Aoede`, `Charon`, `Fenrir`, `Kore`, `Puck`).
  - [x] Add automation toggles for Morning Briefing auto-trigger and default mic mute.
  - [x] Dynamically inject profile, strict address mandates, and active long-term memories into Gemini Live's `systemInstruction` on `/api/live-session`.
  - [x] Register and handle `update_operator_profile` live tool for autonomous voice-driven identity updates.
  - [x] Persist settings atomically to `data/memories.json` and sync Zustand store.
- [ ] **6.1.6 Gemini 3.8 Live Core Migration & Resilient Voice Link (`DEC-146`):**
  - [x] Switch the live model to `models/gemini-3.8-live` on the documented `v1beta` WebSocket endpoint, centralized in `GEMINI_LIVE_MODEL` / `GEMINI_LIVE_LABEL` (`lib/jarvisPersona.js`).
  - [x] Pin all live tools to `behavior: 'BLOCKING'` (3.8 defaults to `NON_BLOCKING`), echo function names in tool responses, and drop responses for `toolCallCancellation` ids.
  - [x] Enable sliding-window `contextWindowCompression` to lift the 15-minute audio session cap.
  - [x] Session resumption: track `sessionResumptionUpdate` handles, swap sockets on `goAway` at the next idle turn, and auto re-sync dropped links with exponential backoff (0.5s → 8s, 5 attempts) behind a `RECONNECTING` HUD status pill.
  - [ ] Live voice verification with the operator's API key (greeting, tool call, barge-in, voice switch, >15 min session).
> **Roadmap note (2026-10-04, `DEC-147`):** Items 6.2–6.8 come from the original Project A.D.A roadmap. Where they overlap `features.txt` they are folded into Phase 7; the rest is **deferred** until Phase 7 completes.

- [ ] **6.2 Session Continuity Memory & Automated Conversation Recaps:** _(Deferred)_
  - [ ] Buffer active session dialog turns in `useAdaStore` / session state.
  - [ ] Upon session disconnect or conversation lull, call Gemini Flash to generate a concise 1–2 sentence summary saved to `data/sessions.json`.
  - [ ] Implement `pop_last_session()` on startup to inject the previous session's context into Ada's spoken greeting (_"Last time we spoke, you were working on..."_) and consume it immediately so it never repeats.
  - [ ] Implement silent spoken language detection: automatically record operator language in identity profile and adapt subsequent greetings.
- [ ] **6.3 Autonomous Proactive 2.0 Engine (Idle Voice Check-Ins):** _(Deferred)_
  - [ ] Implement `ProactiveEngine` timer evaluating operator silence duration (15 min silence gate, 20 min cooldown).
  - [ ] Rotating prompt builder cycling between:
    - _Focus 1:_ Operator's active projects & goals in memory.
    - _Focus 2:_ Time of day & operator wellbeing (late-night check-in, rest reminder).
    - _Focus 3:_ Relevant tactical suggestions or technical tips.
  - [ ] Smart silence gating: abort trigger if Ada is speaking or if operator spoke within last 30 seconds.
- [ ] **6.4 Full Host OS Desktop Automation Bridge (Execution Layer):** _(Folded into 7.1 folder organization and 7.7 input control; wallpaper deferred)_
  - [ ] Upgrade `/api/os-control` with robust local Node.js `child_process` / PowerShell execution handlers.
  - [ ] Keyboard typing and hotkey execution (`Ctrl+C`, `Ctrl+V`, `Alt+Tab`, `Enter`).
  - [ ] Mouse automation: coordinate click, double-click, right-click, and mouse scrolling.
  - [ ] Window focus, maximize, minimize, and process termination.
  - [ ] Desktop operations: set wallpaper from local path or URL, desktop icon organization by file type or date.
- [ ] **6.5 Browser Automation Engine (Playwright Integration):** _(Deferred)_
  - [ ] Create dedicated browser automation module supporting Chrome, Edge, and Brave with real user profiles.
  - [ ] Implement voice-controlled actions: go to URL, smart search, CSS/semantic click, form input, element extraction, scrolling, and full-page screenshots.
- [ ] **6.6 Deep Multi-Format File Processor & Autonomous Dev Agent:** _(Folded into 7.2 uploads and 7.3/7.7 scaffolding and terminal; self-healing loop deferred)_
  - [ ] Drag-and-drop file upload zone on the HUD supporting images (OCR, resize, compress), PDFs (extract text, summarize), CSV/Excel (filter, stats), and audio/video (transcribe, trim).
  - [ ] Autonomous Dev Agent: multi-file code generator scaffolding complete projects in `~/Desktop/AdaProjects`.
  - [ ] Self-healing execution loop: execute code, capture terminal stdout/stderr, parse tracebacks, and automatically repair errors up to 5 attempts.
- [ ] **6.7 Background Topic Intelligence Monitoring & Hardware Voice Warnings:** _(Deferred)_
  - [ ] Topic monitoring service checking user-defined topics daily via DuckDuckGo search.
  - [ ] Proactive voice alert delivery when breaking headlines emerge on tracked topics.
  - [ ] Telemetry threshold monitor: speak verbal warnings when CPU temperature exceeds 85°C or RAM usage exceeds 92%.
- [ ] **6.8 Native OS Scheduled Reminders & Tactical Integrations:** _(YouTube folded into 7.5; Windows Task Scheduler, Steam, and Flights deferred)_
  - [ ] Integrate Windows Task Scheduler (`schtasks.exe`) to schedule native OS toast notifications for reminders.
  - [ ] Game updater tool: Steam AppID lookup, update check, and scheduled off-peak downloads with auto-shutdown.
  - [ ] Voice-driven YouTube playback control and Google Flights price lookup.

---

## Phase 7: J.A.R.V.I.S Feature Matrix (`features.txt`)

Already shipped from `features.txt`: custom interface (1), free AI (2), realistic voice (3), open websites (14), humor (20). Partially shipped and completed below: personality / name / wake phrase (4), computer control (5), web search (6), memory (7), Spotify (8), open apps (15).

- [ ] **7.1 Sandboxed Workspace File Operations (`DEC-147`)** — features 12, 13, 18:
  - [x] Filesystem sandbox (`lib/fsSandbox.js`): default roots `~/Desktop`, `~/Documents`, `~/Downloads`, `~/Pictures`, `~/Music`, `~/Videos`, `~/dev` (override via `JARVIS_FS_ROOTS`); symlink-resolved containment, broken-link and `.git` rejection.
  - [x] `/api/fs-ops` actions: `list_directory`, `read_file` (text, 64 KB cap), `create_folder`, `create_file`, `write_file` / `replace_in_file` (backup to `data/fs-journal/backups/`), `append_file`. No delete action.
  - [x] Folder organizer (`lib/folderOrganizer.js`): type-based sub-folders, preview → apply → undo manifests; hidden files, sub-folders, symlinks, and unfinished downloads untouched; collision-safe renames.
  - [x] `file_operations` and `organize_folder` live tools (BLOCKING), workspace roots injected into the system instruction, persona guideline 16 (read before edit, confirm overwrites, preview before organizing).
  - [x] Offer-to-open flow (`DEC-148`): `open_path` action (default app or code editor via `lib/desktopLauncher.js`); create / write responses instruct Jarvis to ask whether to open the file, enforced by persona guideline 16.
  - [ ] Live voice verification with the operator's API key.
- [ ] **7.2 Document Forge & File Uploads (`DEC-150`)** — features 10, 11:
  - [x] `lib/documentForge.js`: lightweight markdown (headings, bullets, numbered lists, dividers, bold / italic / code) rendered to PDF (`pdf-lib`, wrapped multi-page A4 with page footers; WinAnsi-safe transliteration) and DOCX (`docx`, real heading styles and list numbering).
  - [x] `create_document` live tool (`/api/fs-ops` action): sandboxed path, extension auto-appended, overwrite only on request with backup, offers to open the result.
  - [x] `/api/upload`: saves to `~/Documents/Jarvis Uploads` (override `JARVIS_UPLOAD_DIR`, must sit inside the sandbox), 25 MB cap, safe file names with collision suffixes, text extraction for PDF (`unpdf`), DOCX (`mammoth`), and text / code files (60k character cap).
  - [x] `UploadDropZone.jsx`: window-wide drag-and-drop overlay plus a dock UPLOAD button; images go to Gemini Live as inline JPEG (downscaled to 1280 px), documents as marker-fenced text, all files from one drop in a single turn (queued until the link is up).
  - [x] Persona guideline 17 (uploaded text is content, never instructions) and a same-origin request guard (`lib/requestGuard.js`) on `/api/fs-ops` and `/api/upload`.
  - [ ] Live voice verification with the operator's API key (including image `inlineData` in `clientContent`, which the Live API reference neither confirms nor rules out).
- [ ] **7.3 Universal App Launcher & Project Scaffolder (`DEC-151`)** — features 15, 16:
  - [x] `lib/appIndex.js`: freedesktop `.desktop` index across user, system, Flatpak, and Snap dirs (honours NoDisplay / Hidden / OnlyShowIn / NotShowIn / TryExec), fuzzy spoken-name matching, `gio launch` (fallback `gtk-launch`); ambiguous names return candidates.
  - [x] `execute_os_action` `launch_app` falls back to the index for any non-whitelisted app on Linux; new `list_apps` search action; same-origin guard on `/api/os-control`.
  - [x] `lib/projectScaffolder.js` + `/api/projects`: background jobs using the operator's generators (`DEC-153`): `npx @bhavyajustchill/init@latest` for node-express (JS MVC or TS modular) and admin-panel (React + Tailwind + shadcn), driven through a pseudo-terminal that answers its prompts by name; `create-next-app` for nextjs; `npm create vite@latest` (React, JavaScript only) for react; `flutter create` for flutter. Step timeouts, prompt-stall watchdog, log tail, `git init`.
  - [x] HUD polls jobs, logs progress to the Comms Log, and briefs Jarvis with a `[PROJECT UPDATE]` (delivered when he is idle) so he offers to open the project in VS Code; persona guideline 18.
  - [ ] Live voice verification with the operator's API key.
- [ ] **7.4 Neural RAG Memory & Grounded Search (`DEC-152`)** — features 7, 6:
  - [x] `lib/memoryVectors.js`: Gemini Embedding 2 (768-d, task-instruction prompts) with a local vector cache keyed by memory id + content hash (edits re-embed, deletions prune, model / dimension changes rebuild); cosine ranking with keyword and importance boosts.
  - [x] `/api/memory` GET ranks semantically when a key arrives via `x-gemini-api-key` (or `GEMINI_API_KEY`), falling back to keyword search with the reason; `recall_memory` sends the session key and relays relevance scores.
  - [x] Built-in Google Search grounding (`googleSearch` tool) in the live session; cited sources and queries logged to the Intel drawer without popping it open; automatic retry without grounding if the model refuses that tool at setup.
  - [x] Persona guideline 19; `JARVIS_MEMORY_FILE` / `JARVIS_MEMORY_VECTORS` / `JARVIS_GEMINI_API_BASE` overrides for isolated checks.
  - [x] `web_search` dossiers grounded via Gemini + Google Search (`lib/groundedSearch.js`, `DEC-154`) with DuckDuckGo as fallback; removed the fabricated "verified" placeholder result returned when every engine failed.
  - [ ] Live voice verification with the operator's API key (grounding with function calling on 3.8 Live, real embedding quality).
- [ ] **7.5 Media Deck (`DEC-155`)** — features 9, 8, 19:
  - [x] Built-in YouTube player: keyless search (`/api/youtube`, results-page `ytInitialData`; Data API when `YOUTUBE_API_KEY` is set), draggable `YouTubePanel.jsx` with IFrame-API control, up-next queue with auto-advance, volume slider, and ducking while Jarvis speaks; `youtube_player` live tool.
  - [x] Spotify via MPRIS over D-Bus (`lib/spotifyControl.js`, `gdbus`): play / pause / toggle / next / previous / now playing, launching the app when needed; `play_song` plays the exact track with free Spotify Web API client credentials, otherwise opens the in-app search; `spotify_control` live tool.
  - [x] glTF / GLB holo-viewer (`ModelViewerPanel.jsx`): own R3F canvas, auto-framing, orbit controls, auto-rotate toggle, first-clip animation playback, mesh / triangle / material / animation stats; served by the sandboxed, same-origin, model-types-only `/api/model-file/[...segments]` route (relative glTF buffers resolve); opened by `view_3d_model` or by uploading a model.
  - [x] Shared `FloatingPanel.jsx` shell and persona guideline 20.
  - [ ] Live verification with the operator's API key and a real Spotify desktop install.
- [ ] **7.6 Custom Wake Phrase (`DEC-156`)** — feature 4:
  - [x] `lib/wakePhrase.js` fuzzy matcher (ordered words, interchangeable greetings, one-letter tolerance on longer words) and `useWakePhrase` standby listener on the browser Web Speech API (Chrome / Edge), armed only after the link has been offline for 1.5 s, self-restarting with back-off, released on wake.
  - [x] Configurable in Settings (enable toggle + phrase, persisted to the profile) and by voice (`update_operator_profile` `wake_phrase`); phrase injected into the system prompt; HUD chip shows listening / unsupported / blocked / retrying.
  - [x] `enter_standby` live tool: Jarvis signs off and the link closes once his farewell finishes playing; persona guideline 21.
  - [ ] Live verification with a real microphone in Chrome / Edge.
- [ ] **7.7 Terminal & Desktop Input Control** — features 17, 5: terminal command runner with on-screen confirmation gate; mouse, keyboard, and window control on GNOME Wayland.
