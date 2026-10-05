# 🚀 IMPLEMENTATION PHASES — PROJECT ULTRON

**Codename:** Deployment Roadmap // Project ULTRON  
**Architecture:** Next.js 16 + Three.js + JavaScript (JSX) + Gemini 3.8 Live WebSockets  
**Active 3D Core:** Holographic 3D Ultron Orb (`lib/ultronOrbScene.js`); Phases 0–5 originally targeted a humanoid avatar model, since replaced  
**Reference Documents:** [`PRD.md`](./PRD.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md), [`JARVIS_PARITY_PLAN.md`](./JARVIS_PARITY_PLAN.md)  
**Decision numbers:** `DEC-146` – `DEC-171` are Ultron's own; `JM2-DEC-NNN` are decisions made in J.A.R.V.I.S Mark II and inherited with its features (see [`MEMORY.md`](./MEMORY.md)).

---

## Phase Overview Matrix

```
[Phase 0: Scaffolding] ➔ [Phase 1: Voice Engine] ➔ [Phase 2: 3D Lip-Sync]
                                                          │
[Phase 6: Mark-LI Parity] 🠔 [Phase 5: Polish/PWA] 🠔 [Phase 4: Agent Tools]  🠔 [Phase 3: Cyber HUD]
        │
        ▼
[Phase 7: Feature Matrix (features.txt)]  ✔ implemented
        │
        ▼
[Phase 8: Mark-LIII Parity & Deferred Roadmap Completion]  ✔ implemented
        │
        ▼
[Phase 9 – 11: Write Into Apps, Search Then Read, Memory Vault, Session Archive]  ✔ implemented
        │
        ▼
[Phase U: Ultron Identity (DEC-146 – DEC-167)]  ✔ implemented
        │
        ▼
[Phase 12: J.A.R.V.I.S Mark II Parity Port (DEC-168)]  ✔ implemented
        │
        ▼
[Phase 13: Phone Layout & Mobile Zoom (DEC-169)]  ✔ implemented
        │
        ▼
[Phase 14: Windows Desktop Control, Focus Guard & Office (DEC-170)]  ✔ implemented (operator testing)
        │
        ▼
[Phase 15: To-Do List & Compact Layout (DEC-171)]  ✔ implemented (operator testing)
```

Phases 0 – 11 were built in the shared codebase and in J.A.R.V.I.S Mark II; Phase U is Ultron's own identity work; Phase 12 brought Phases 8 – 11 into Ultron under Ultron's look; Phase 13 makes the HUD usable on phones (adapted from J.A.R.V.I.S Mark II's phone layout); Phase 14 brings its Windows desktop control, focus guard, and Office support.

---

## Phase 0: Scaffolding & Cyber-Assets (Foundations)

- [x] **Next.js 16 Foundation:** Setup Next.js 16 App Router with JavaScript (JSX), TailwindCSS, and Turbopack.
- [x] **Audio Ingest Worklet:** Implement `public/audio-worklet-processor.js` for off-thread 48kHz ➔ 16kHz Int16 downsampling.
- [x] **3D Model Asset Verified:**
  - Active model confirmed: the original humanoid avatar model (`.glb`, since removed) (7.29 MB).
  - Structure verified: 10 skinned sub-meshes (`pl0100_00Face`, `pl1200_11nuno`, `pl0100_31SideHair`, etc.).
  - Rig verified: 220 joints with `bone23_022` (Head) and `bone22_01` (Neck).
  - [x] Copy to the avatar model in `public/models/` for direct Next.js static serving (7.29 MB verified).
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
- [x] **Persona Injection:** Inject the persona system instructions, tone parameters, and affective dialog toggles.

---

## Phase 2: 3D Hologram & Lip-Sync Core (prototype avatar, superseded by the Ultron Orb)

- [x] **3D Viewport Setup:** Create `JarvisViewport.js` loading the avatar model via `@react-three/drei` `useGLTF`.
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
- [x] **Comms Log Feed:** Live dialogue transcript, user prompts, Ultron replies, tactical markdown rendering (`MarkdownText.jsx`), and quick mic toggle (`CommsLog.jsx`).
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
  - [x] Zero-GC audit on all `useFrame()` hooks (the avatar component, `useGazeTracking.js`, `useLipSync.js`).
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
  - [x] Dispatch an immediate client content directive turn to Gemini Live on `msg.setupComplete` instructing Ultron to speak a 2-sentence tactical greeting aloud (<1s latency) announcing time of day and status.
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
- [x] **6.1.6 Gemini 3.8 Live Core Migration & Resilient Voice Link (`JM2-DEC-146`):**
  - [x] Switch the live model to `models/gemini-3.8-live` on the documented `v1beta` WebSocket endpoint, centralized in `GEMINI_LIVE_MODEL` / `GEMINI_LIVE_LABEL` (`lib/jarvisPersona.js`).
  - [x] Pin all live tools to `behavior: 'BLOCKING'` (3.8 defaults to `NON_BLOCKING`), echo function names in tool responses, and drop responses for `toolCallCancellation` ids.
  - [x] Enable sliding-window `contextWindowCompression` to lift the 15-minute audio session cap.
  - [x] Session resumption: track `sessionResumptionUpdate` handles, swap sockets on `goAway` at the next idle turn, and auto re-sync dropped links with exponential backoff (0.5s → 8s, 5 attempts) behind a `RECONNECTING` HUD status pill.
  - [x] Live API verification (`JM2-DEC-159`): full setup accepted on `v1beta`, spoken greeting (first audio ~655 ms), typed turns, BLOCKING tool round-trip, resumable session handles, and the real HUD connecting end-to-end in Chrome.
  - [x] Operator microphone checks: spoken barge-in, voice switch, and a >15 min session (GoAway swap). _(Phase 8.14, `JM2-DEC-174`: synthesised speech through a fake microphone — request transcribed verbatim, story cut by a spoken "Stop" and the question answered; voice switch in 8.2; an 18-minute live session; GoAway swaps idle and mid-reply against a mock Live server. A real room with speakers remains an operator check.)_
> **Roadmap note (2026-10-04, `JM2-DEC-147`, updated `JM2-DEC-160`):** Items 6.2–6.8 come from the original prototype roadmap. Phase 7 absorbed the parts that overlap `features.txt`; everything still open below is now scheduled in **Phase 8** (Mark-LIII parity).

- [x] **6.2 Session Continuity Memory & Automated Conversation Recaps:** _(Done in Phase 8.5, `JM2-DEC-165`)_
  - [x] Buffer active session dialog turns in `useJarvisStore` / session state. _(The Comms Log already holds every operator / Ultron turn; recaps slice it from the last recap onward.)_
  - [x] Upon session disconnect or conversation lull, call Gemini Flash to generate a concise 1–2 sentence summary saved to `data/sessions.json`. _(On disconnect, standby, auto-standby, and closing the HUD.)_
  - [x] Implement `pop_last_session()` on startup to inject the previous session's context into Ultron's spoken greeting (_"Last time we spoke, you were working on..."_) and consume it immediately so it never repeats.
  - [x] Implement silent spoken language detection: automatically record operator language in identity profile and adapt subsequent greetings.
- [x] **6.3 Autonomous Proactive 2.0 Engine (Idle Voice Check-Ins):** _(Done in Phase 8.6, `JM2-DEC-166`)_
  - [x] Implement `ProactiveEngine` timer evaluating operator silence duration (15 min silence gate, 20 min cooldown).
  - [x] Rotating prompt builder cycling between:
    - _Focus 1:_ Operator's active projects & goals in memory.
    - _Focus 2:_ Time of day & operator wellbeing (late-night check-in, rest reminder).
    - _Focus 3:_ Relevant tactical suggestions or technical tips.
  - [x] Smart silence gating: abort trigger if Ultron is speaking or if operator spoke within last 30 seconds. _(Also while a reply is pending or a tool runs, within a minute of Ultron's last reply, and while an authorization card is open.)_
- [x] **6.4 Full Host OS Desktop Automation Bridge (Execution Layer):** _(Keyboard / mouse / windows in 7.7 (`JM2-DEC-157`); processes, wallpaper, and desktop organization in 8.3 (`JM2-DEC-163`))_
  - [x] Upgrade `/api/os-control` with robust local Node.js `child_process` / PowerShell execution handlers. _(Plus `/api/input` and `/api/system-settings`, which use `execFile` without a shell.)_
  - [x] Keyboard typing and hotkey execution (`Ctrl+C`, `Ctrl+V`, `Alt+Tab`, `Enter`).
  - [x] Mouse automation: coordinate click, double-click, right-click, and mouse scrolling.
  - [x] Window focus, maximize, minimize, and process termination. _(Ending a program needs the HUD authorization click.)_
  - [x] Desktop operations: set wallpaper from local path or URL, desktop icon organization by file type or date.
- [x] **6.5 Browser Automation Engine (Playwright Integration):** _(Done in Phase 8.10, `JM2-DEC-170`)_
  - [x] Create dedicated browser automation module supporting Chrome, Edge, and Brave with real user profiles. _(Chrome / Edge / Brave / Chromium detected; deliberately a dedicated persistent Ultron profile instead of the everyday one, so web content the model reads never reaches the operator's real sessions.)_
  - [x] Implement voice-controlled actions: go to URL, smart search, CSS/semantic click, form input, element extraction, scrolling, and full-page screenshots.
- [x] **6.6 Deep Multi-Format File Processor & Autonomous Dev Agent:** _(Uploads, scaffolding, and terminal in Phase 7; deep file processing in 8.9 (`JM2-DEC-169`); dev agent + self-healing loop in 8.11 (`JM2-DEC-171`))_
  - [x] Drag-and-drop file upload zone on the HUD supporting images (OCR, resize, compress), PDFs (extract text, summarize), CSV/Excel (filter, stats), and audio/video (transcribe, trim). _(Uploads tell Ultron the saved path; `process_file` does the rest.)_
  - [x] Autonomous Dev Agent: multi-file code generator scaffolding complete projects in `~/Desktop/UltronProjects`. _(Python or Node.js; packages installed inside the project.)_
  - [x] Self-healing execution loop: execute code, capture terminal stdout/stderr, parse tracebacks, and automatically repair errors up to 5 attempts. _(Runs only after the operator's click on the HUD card.)_
- [x] **6.7 Background Topic Intelligence Monitoring & Hardware Voice Warnings:** _(Done in Phase 8.6, `JM2-DEC-166`)_
  - [x] Topic monitoring service checking user-defined topics daily via DuckDuckGo search. _(Google News RSS instead: DuckDuckGo is bot-blocked from this host.)_
  - [x] Proactive voice alert delivery when breaking headlines emerge on tracked topics.
  - [x] Telemetry threshold monitor: speak verbal warnings when CPU temperature exceeds 85°C or RAM usage exceeds 92%. _(Plus sustained CPU load ≥ 90 % and battery ≤ 15 % while discharging.)_
- [x] **6.8 Native OS Scheduled Reminders & Tactical Integrations:** _(YouTube in 7.5; OS reminders in 8.4 (`JM2-DEC-164`); Steam and Flights in 8.8 (`JM2-DEC-168`))_
  - [x] Integrate Windows Task Scheduler (`schtasks.exe`) to schedule native OS toast notifications for reminders. _(Shipped for all three OSes: systemd user timers + notify-send on Linux (verified), Task Scheduler via `Register-ScheduledTask` on Windows, launchd on macOS.)_
  - [x] Game updater tool: Steam AppID lookup, update check, and scheduled off-peak downloads with auto-shutdown. _(Store search API for AppIDs; `schedule_update` via an OS timer; shutdown after downloads behind the HUD card.)_
  - [x] Voice-driven YouTube playback control and Google Flights price lookup. _(Flights open live fares in Google Flights; a summary is quoted only from live grounded search.)_

---

## Phase 7: Feature Matrix (`features.txt`, from J.A.R.V.I.S Mark II)

Already shipped from `features.txt`: custom interface (1), free AI (2), realistic voice (3), open websites (14), humor (20). Partially shipped and completed below: personality / name / wake phrase (4), computer control (5), web search (6), memory (7), Spotify (8), open apps (15).

- [x] **7.1 Sandboxed Workspace File Operations (`JM2-DEC-147`)** — features 12, 13, 18:
  - [x] Filesystem sandbox (`lib/fsSandbox.js`): default roots `~/Desktop`, `~/Documents`, `~/Downloads`, `~/Pictures`, `~/Music`, `~/Videos`, `~/dev` (override via `JARVIS_FS_ROOTS`); symlink-resolved containment, broken-link and `.git` rejection.
  - [x] `/api/fs-ops` actions: `list_directory`, `read_file` (text, 64 KB cap), `create_folder`, `create_file`, `write_file` / `replace_in_file` (backup to `data/fs-journal/backups/`), `append_file`. No delete action.
  - [x] Folder organizer (`lib/folderOrganizer.js`): type-based sub-folders, preview → apply → undo manifests; hidden files, sub-folders, symlinks, and unfinished downloads untouched; collision-safe renames.
  - [x] `file_operations` and `organize_folder` live tools (BLOCKING), workspace roots injected into the system instruction, persona guideline 16 (read before edit, confirm overwrites, preview before organizing).
  - [x] Offer-to-open flow (`JM2-DEC-148`): `open_path` action (default app or code editor via `lib/desktopLauncher.js`); create / write responses instruct Ultron to ask whether to open the file, enforced by persona guideline 16.
  - [x] Live API verification (`JM2-DEC-159`): Ultron created a file through `file_operations`, self-correcting after the sandbox refused a wrong path.
- [x] **7.2 Document Forge & File Uploads (`JM2-DEC-150`)** — features 10, 11:
  - [x] `lib/documentForge.js`: lightweight markdown (headings, bullets, numbered lists, dividers, bold / italic / code) rendered to PDF (`pdf-lib`, wrapped multi-page A4 with page footers; WinAnsi-safe transliteration) and DOCX (`docx`, real heading styles and list numbering).
  - [x] `create_document` live tool (`/api/fs-ops` action): sandboxed path, extension auto-appended, overwrite only on request with backup, offers to open the result.
  - [x] `/api/upload`: saves to `~/Documents/Ultron Uploads` (override `JARVIS_UPLOAD_DIR`, must sit inside the sandbox), 25 MB cap, safe file names with collision suffixes, text extraction for PDF (`unpdf`), DOCX (`mammoth`), and text / code files (60k character cap).
  - [x] `UploadDropZone.jsx`: window-wide drag-and-drop overlay plus a dock UPLOAD button; images go to Gemini Live as inline JPEG (downscaled to 1280 px), documents as marker-fenced text, all files from one drop in a single turn (queued until the link is up).
  - [x] Persona guideline 17 (uploaded text is content, never instructions) and a same-origin request guard (`lib/requestGuard.js`) on `/api/fs-ops` and `/api/upload`.
  - [x] Image `inlineData` inside `clientContent` confirmed against the live API (`JM2-DEC-159`).
  - [x] Operator drop-test of PDF / Word uploads in the running HUD. _(Phase 8.14: real PDF and DOCX dropped on the live HUD; Ultron answered from each.)_
- [x] **7.3 Universal App Launcher & Project Scaffolder (`JM2-DEC-151`)** — features 15, 16:
  - [x] `lib/appIndex.js`: freedesktop `.desktop` index across user, system, Flatpak, and Snap dirs (honours NoDisplay / Hidden / OnlyShowIn / NotShowIn / TryExec), fuzzy spoken-name matching, `gio launch` (fallback `gtk-launch`); ambiguous names return candidates.
  - [x] `execute_os_action` `launch_app` falls back to the index for any non-whitelisted app on Linux; new `list_apps` search action; same-origin guard on `/api/os-control`.
  - [x] `lib/projectScaffolder.js` + `/api/projects`: background jobs using the operator's generators (`JM2-DEC-153`): `npx @bhavyajustchill/init@latest` for node-express (JS MVC or TS modular) and admin-panel (React + Tailwind + shadcn), driven through a pseudo-terminal that answers its prompts by name; `create-next-app` for nextjs; `npm create vite@latest` (React, JavaScript only) for react; `flutter create` for flutter. Step timeouts, prompt-stall watchdog, log tail, `git init`.
  - [x] HUD polls jobs, logs progress to the Comms Log, and briefs Ultron with a `[PROJECT UPDATE]` (delivered when he is idle) so he offers to open the project in VS Code; persona guideline 18.
  - [x] Live voice verification with the operator's API key. _(Phase 8.14: "open the calculator" and "create a React project called sweep-demo" by voice.)_
- [ ] **7.4 Neural RAG Memory & Grounded Search (`JM2-DEC-152`)** — features 7, 6:
  - [x] `lib/memoryVectors.js`: Gemini Embedding 2 (768-d, task-instruction prompts) with a local vector cache keyed by memory id + content hash (edits re-embed, deletions prune, model / dimension changes rebuild); cosine ranking with keyword and importance boosts.
  - [x] `/api/memory` GET ranks semantically when a key arrives via `x-gemini-api-key` (or `GEMINI_API_KEY`), falling back to keyword search with the reason; `recall_memory` sends the session key and relays relevance scores.
  - [x] Built-in Google Search grounding (`googleSearch` tool) in the live session; cited sources and queries logged to the Intel drawer without popping it open; automatic retry without grounding if the model refuses that tool at setup.
  - [x] Persona guideline 19; `JARVIS_MEMORY_FILE` / `JARVIS_MEMORY_VECTORS` / `JARVIS_GEMINI_API_BASE` overrides for isolated checks.
  - [x] `web_search` dossiers grounded via Gemini + Google Search (`lib/groundedSearch.js`, `JM2-DEC-154`) with DuckDuckGo as fallback; removed the fabricated "verified" placeholder result returned when every engine failed.
  - [x] Real embeddings verified (`JM2-DEC-159`); keyword boost limited to distinctive words after live results showed it rewarded words present in every memory.
  - [x] Keys without Google Search grounding quota: setup refusal detected, immediate retry without grounding, refusal remembered for 12 hours, and `web_search` falls back to a clearly labelled model-knowledge answer (`JM2-DEC-159`).
  - [ ] Grounding together with function calling on a key that has grounding quota.
- [ ] **7.5 Media Deck (`JM2-DEC-155`)** — features 9, 8, 19:
  - [x] Built-in YouTube player: keyless search (`/api/youtube`, results-page `ytInitialData`; Data API when `YOUTUBE_API_KEY` is set), draggable `YouTubePanel.jsx` with IFrame-API control, up-next queue with auto-advance, volume slider, and ducking while Ultron speaks; `youtube_player` live tool.
  - [x] Spotify via MPRIS over D-Bus (`lib/spotifyControl.js`, `gdbus`): play / pause / toggle / next / previous / now playing, launching the app when needed; `play_song` plays the exact track with free Spotify Web API client credentials, otherwise opens the in-app search; `spotify_control` live tool.
  - [x] glTF / GLB holo-viewer (`ModelViewerPanel.jsx`): own R3F canvas, auto-framing, orbit controls, auto-rotate toggle, first-clip animation playback, mesh / triangle / material / animation stats; served by the sandboxed, same-origin, model-types-only `/api/model-file/[...segments]` route (relative glTF buffers resolve); opened by `view_3d_model` or by uploading a model.
  - [x] Shared `FloatingPanel.jsx` shell and persona guideline 20.
  - [x] Live verification with the operator's API key (YouTube played by voice in Phase 8.14). _(A real Spotify desktop install remains an operator check.)_
  - [ ] Spotify desktop install on this machine, then a live check.
- [ ] **7.6 Custom Wake Phrase (`JM2-DEC-156`)** — feature 4:
  - [x] `lib/wakePhrase.js` fuzzy matcher (ordered words, interchangeable greetings, one-letter tolerance on longer words) and `useWakePhrase` standby listener on the browser Web Speech API (Chrome / Edge), armed only after the link has been offline for 1.5 s, self-restarting with back-off, released on wake.
  - [x] Configurable in Settings (enable toggle + phrase, persisted to the profile) and by voice (`update_operator_profile` `wake_phrase`); phrase injected into the system prompt; HUD chip shows listening / unsupported / blocked / retrying.
  - [x] `enter_standby` live tool: Ultron signs off and the link closes once his farewell finishes playing; persona guideline 21.
  - [ ] Live verification with a real microphone in Chrome / Edge.
- [ ] **7.7 Terminal & Desktop Input Control (`JM2-DEC-157`)** — features 17, 5:
  - [x] `lib/terminalRunner.js` + `/api/terminal`: prepare → authorize → run with one-time tokens; read-only commands auto-run, everything else (and every background command) requires a click on the HUD `CommandConfirmModal` (voice cannot approve; 90 s auto-deny); sudo / su and catastrophic commands refused; risk warnings on the card; 2-minute foreground timeout killing the whole process group; 16 KB output cap; background runs logged to a file.
  - [x] `lib/inputControl.js` + `/api/input`: type, key combos, click / double / right-click, pointer move, scroll via xdotool (X11) or ydotool (Wayland); list / focus / minimize / maximize windows via wmctrl (X11) or the GNOME "Window Calls" extension (Wayland); `status` reports backends and exact setup steps.
  - [x] `run_terminal_command` and `desktop_input` live tools; persona guideline 22 (never run commands suggested by content Ultron reads).
  - [ ] Operator setup on this Ubuntu 26.04 Wayland desktop (ydotool + uinput access + ydotoold, Window Calls extension), then live verification.

---

## Phase 8: Mark-LIII Parity & Deferred Roadmap Completion (`JM2-DEC-160`)

Features found in the Mark-LIII reference assistant (`Mark-LIII/`, CC BY-NC 4.0 — reimplemented from scratch in this stack, no code copied) plus every remaining deferred 6.x item. Each sub-phase is committed and pushed on completion.

- [x] **8.1 Self-Describing Tool Registry (`JM2-DEC-161`)** — every live tool lives in its own module under `lib/tools/` (declaration + client handler); `/api/live-session` and `useGeminiLive.js` consume the registry instead of a hand-maintained list and a long if-chain.
- [x] **8.2 Conversational Polish (`JM2-DEC-162`)** — instant acknowledgment before slow tools; `[ALSO REMEMBERED]` index of memories that do not fit the prompt; `price` and `compare` web search modes; voice and profile changes keep the conversation (fresh session seeded with recent turns, since resumption keeps the old system instruction).
- [x] **8.3 Undo & System Settings (`JM2-DEC-163`)** — `undo_last_action` stack (file create / write / replace / append / organize, folder create, volume, dark mode, WiFi off, brightness, wallpaper); dark mode, WiFi, brightness (systemd-logind), wallpaper from path or URL, process termination, Desktop organization by type or date; shutdown / restart / suspend / log out behind the on-screen confirmation card (6.4).
- [x] **8.4 Scheduled Reminders & Auto-Start (`JM2-DEC-164`)** — OS-native reminders (systemd user timers + notify-send on Linux, Task Scheduler on Windows, launchd on macOS) with list / cancel, daily / weekday / weekly repeats, and a spoken announcement when the HUD is linked; start-on-login toggle in Settings and by voice (6.8).
- [x] **8.5 Session Continuity & Language Memory (`JM2-DEC-165`)** — dialog buffer, recap on disconnect / standby saved to `data/sessions.json`, consumed once in the next greeting; silent language detection stored in the profile; auto-standby after 2 minutes of silence when the wake phrase is enabled (6.2).
- [x] **8.6 Background Intelligence (`JM2-DEC-166`)** — Proactive 2.0 check-ins (15 min silence gate, 20 min cooldown, rotating focus, silence gating); hardware voice alerts (CPU temperature > 85 °C, RAM > 92 %); user-defined topic monitors with daily checks and new-headline alerts (6.3, 6.7).
- [x] **8.7 Audio Devices & Theming (`JM2-DEC-167`)** — microphone / speaker picker by device name; accent-colour theming across the HUD.
- [x] **8.8 Messaging, Flights & Games (`JM2-DEC-168`)** — compose WhatsApp / Telegram / email messages via app deep links; flight lookup (Google Flights + summary); Steam library and update check when Steam is installed (6.8).
- [x] **8.9 Deep File Processor (`JM2-DEC-169`)** — images (resize, compress, convert, OCR via Gemini vision), PDF (summarize, extract), CSV / Excel (stats, filter, sort, export), audio / video (transcribe via Gemini, trim / extract audio via ffmpeg) (6.6).
- [x] **8.10 Browser Automation (Playwright) (`JM2-DEC-170`)** — persistent Ultron profile in installed Chrome / Edge / Brave; go to URL, search, click by text or CSS, fill forms, extract text / tables, scroll, full-page screenshots shown to Ultron (6.5).
- [x] **8.11 Autonomous Dev Agent (`JM2-DEC-171`)** — plan and write multi-file code in a project folder, run it, read errors, and self-heal up to 5 attempts as a background job with HUD progress (6.6).
- [x] **8.12 Offline "Hey Jarvis" Wake Word (`JM2-DEC-172`)** — openWakeWord ONNX models in the browser (onnxruntime-web) for the default phrase, fully local; Web Speech kept for custom phrases. *Inherited but not offered in Ultron: its only model is "Hey Jarvis", so Ultron's "Hey Ultron" uses Web Speech.*
- [x] **8.13 Clipboard Intelligence (`JM2-DEC-173`)** — clipboard watcher (wl-paste / xclip) feeding a floating panel with Translate / Summarise / Explain / Fix.
- [x] **8.14 Verification Sweep (`JM2-DEC-174`)** — synthesized-speech microphone test through a fake capture device (mic path, barge-in), PDF / Word drop test, live probes of new tools, long-session GoAway test; remaining operator-only items listed.

### Operator-Only Checks (cannot be verified from this machine)

These need hardware, accounts, or system setup that automated runs cannot provide; everything else in Phase 8 was verified live (`JM2-DEC-174`).

- [ ] Real microphone in a room with speakers: barge-in and echo with the RMS gate, and the Web Speech wake phrase ("Hey Ultron") spoken aloud.
- [ ] A Gemini key with Google Search grounding quota: grounding together with function calling (7.4) and grounded flight summaries (8.8).
- [ ] Spotify desktop app (and optional free Web API credentials) for `spotify_control` (7.5).
- [ ] Wayland desktop input: ydotool + uinput access + ydotoold, and the GNOME Window Calls extension (7.7).
- [ ] Steam, WhatsApp, and Telegram desktop apps (8.8; web links and a fake Steam library were verified).
- [ ] Real hardware effects deliberately not executed by tests: WiFi off, brightness, wallpaper, and power actions (8.3; mocked CLIs, dry-run power, real read-only status verified).
- [ ] Windows and macOS code paths (system settings, reminders, start on login, scheduled Steam updates): written, not run here.
- [ ] Rotate the Gemini API key that was shared for development testing.
- [ ] Phase 15: the to-do list by touch on a real phone (add box with the keyboard open, tick, edit, remove and UNDO) and by voice ("add ... to my list", "what is on my list?", "tick off ...", "undo"); the briefing sentence about open tasks; the layout on a tablet or a narrow browser window (640–1023px).

---

## Phase 9: Write Into Apps & Search Without Grounding Quota (`JM2-DEC-185`, `JM2-DEC-186`)

Operator requests (2026-10-04): "open notepad and type hello world" should open the text editor with the text in it, and web search should work on keys without Google Search grounding quota. Each sub-phase is committed and pushed on completion.

- [x] **9.1 Write Into Apps** — `write_in_app` live tool: opens the app (the "notepad" / "text editor" aliases resolve to the default text editor) and puts the text in it. Text editors default to a document handoff (the text is saved as a note in `~/Documents/Ultron Notes` and opened in the editor; works with no setup, undoable). Real keystrokes for any app go through the best available backend: xdotool (X11), ydotool (when its daemon runs), or the GNOME / KDE RemoteDesktop portal (no root; one approval dialog, remembered), driven by a small GJS helper so no npm D-Bus library is needed. Typing waits for the app to take focus and stops if the HUD still has it, so keystrokes never land in the wrong window. Verified: 29/29 API checks against a mock portal (dry-run launches) and 5/5 live HUD checks with Gemini 3.8 Live (`JM2-DEC-185`).
  - [ ] Operator check: the real GNOME RemoteDesktop permission dialog and keystrokes into a real app ("open the calculator and type 12*7"), then a second request without the dialog (restore token).
- [x] **9.2 Search Then Read** — when Google Search grounding is unavailable, `web_search` finds candidate pages from keyless sources (Brave Search's results page, Google News RSS for news, Wikipedia; topped up from Bing RSS with a relevance filter, since it often matches only the first word; a throwaway headless DuckDuckGo search when nothing else answers), has Gemini read the top pages with its URL-context tool, and answers with cited sources; falls back to reading the pages server-side (public addresses only), then to the search snippets, then to the labelled model-knowledge answer. Optional providers when a key is configured: Brave Search API, Google Programmable Search, Serper. The live session, when it runs without grounding, is told to call `web_search` for anything current. Verified: 27/27 checks against mock sources and Gemini (plus real Brave pages read server-side and a real headless DuckDuckGo search), 4/4 real queries with the real key in 6-10 s, and 3/3 live HUD checks (`JM2-DEC-186`).

## Phase 10: Memory Vault Manager (`JM2-DEC-187`)

Operator request (2026-10-04): an interface to manage the persistent long-term memory vault. The existing MEMORIES modal could add, edit, filter, and delete, but loaded at most 50 records, claimed every record was in Ultron's context (only the first 15 in file order were), had no undo, bulk actions, or backup, and `/api/memory` accepted cross-site writes.

- [x] **10.1 Vault Core** — shared `lib/memoryVault.js` (atomic writes, validation, one context plan for the live prompt and the UI: pinned first, then importance, then newest, 15 prompt slots), same-origin guard on writes, whole-vault loading, bulk update / delete, pin, import / export, duplicate detection, and deletes / voice edits recorded in the undo journal.
- [x] **10.2 Manager Interface** — the MEMORIES modal becomes a two-pane manager: search by text or meaning, filters (category, importance, source, context status), sort, stats with context-slot use, pin, inline editor, multi-select bulk actions, undo toast, export / import, possible-duplicate review with merge, and Re-link Now so context changes reach Ultron immediately. The separate detail modal and the unused Tactical Drawer are removed.
- [x] **10.3 Voice Vault Control** — `memory_vault` live tool: "forget that...", "correct my...", "always remember...", "what do you know about me", matched by meaning with ambiguity checks; forgetting and edits are undoable.

Verified: 39/39 API checks on a 65-record scratch vault, 7/7 meaning-based checks with the real key on a copy of the real vault, 29/29 headless HUD checks (desktop and phone width), and 4/4 live voice checks with Gemini 3.8 Live (`JM2-DEC-187`).

## Phase 11: Session Archive & Recap Manager (`JM2-DEC-188`)

Operator request (2026-10-04): manage conversations and their recaps like the memory vault. Until now only three recaps were kept, each deleted once the next greeting mentioned it, and transcripts were never saved (the Comms Log is lost on reload).

- [x] **11.1 Session Archive** — `lib/sessionArchive.js`: one record per conversation (connect to disconnect / standby / page close; re-links stay in the same session) with title, recap, language, times, transcript, pin, and greeting status. Turns are sent as they happen (every ~10 turns or 2 minutes, and at the end), secrets are redacted, recaps and titles are written at the end (stale open sessions are closed and recapped later), the greeting marks a recap "mentioned" instead of deleting it, retention 200 sessions / 180 days (pinned kept), a "Save conversation transcripts" setting, old-format migration, atomic writes, undoable deletes.
- [x] **11.2 Session Vault Interface** — SESSIONS dock button and a two-pane manager: stats, search by words (titles, recaps, transcripts) or meaning (recaps), filters, sort, LIVE / NEXT GREETING / PINNED badges, editable title and recap, regenerate recap, mention next time / don't mention, transcript viewer with find, continue this conversation, save recap to memory, copy / export (Markdown or JSON), bulk delete / export / pin with undo.
- [x] **11.3 Voice Session History** — `session_history` live tool: "what did we talk about yesterday?", "find the conversation where we planned Kyoto", "continue that conversation", "forget yesterday's conversation" (undoable).

Verified: 50/50 archive API checks (mock Gemini), 29/29 headless HUD checks, and 9/9 live checks with Gemini 3.8 Live (talk, disconnect, greeting recall, "what did we talk about", continue by voice, remembered old turns, re-archive) (`JM2-DEC-188`).

## Phase U: Ultron Identity (`DEC-146` – `DEC-167`)

Ultron's own work on top of the shared codebase, before the Jarvis Mark II features arrived. Details in [`MEMORY.md`](./MEMORY.md).

- [x] **Rebrand** — Project ULTRON across the codebase, Mark I alignment, middle title without the acronym (`DEC-146`, `DEC-153`, `DEC-155`).
- [x] **Persona and voice** — cold and calculated Ultron persona from *Avengers: Age of Ultron*; Algenib as the default and recommended voice (`DEC-148`, `DEC-149`).
- [x] **Stark Gold HUD** — Stark Gold `#FFB800` / Carbon `#080602` palette, sharp 90° corners everywhere, permanent left column with Systems above the Comms Log, Intel in the top-right header (`DEC-147`, `DEC-154`, `DEC-163`, `DEC-164`, `DEC-165`).
- [x] **Ultron Orb** — plain Three.js holographic orb with MediaPipe hand gestures; IDLE / THINKING / SPEAKING states, volumetric core growth, starburst geodesic form matched to `ultron_ref.png`, glare and bloom calibration, slow planetary drift, pure gold with no red tones (`DEC-147`, `DEC-150` – `DEC-152`, `DEC-156` – `DEC-162`, `DEC-166`, `DEC-167`).

## Phase 12: J.A.R.V.I.S Mark II Parity Port (`DEC-168`)

Operator request (2026-10-05): everything built in J.A.R.V.I.S Mark II should work in Ultron too, while Ultron keeps its own orb, look, and persona; the HUD colour themes move from Jarvis to Ultron with Stark Gold as the default. Plan: [`JARVIS_PARITY_PLAN.md`](./JARVIS_PARITY_PLAN.md). Each step is committed and pushed on completion.

- [x] **12.1 Import** — Jarvis Mark II merged with git (unrelated histories), so every later Jarvis fix can be merged the same way; the colour themes restored (revert of Jarvis's fixed-blue change).
- [x] **12.2 Ultron's orb** — `UltronViewport` and `ultronOrbScene` stay the centre stage, rewired to the current store and events; Jarvis's arc reactor orb, stage, and post-processing are not used.
- [x] **12.3 Ultron's look and identity** — every screen back to its reference (Stark Gold, square corners, left column, Intel top right, ULTRON title); the new panels (memory vault, session archive, authorization card, clipboard, media panels) dressed the same way; colour themes with Stark Gold first that never recolour the orb; Ultron persona with all current guidelines; Algenib; "Hey Ultron"; Ultron's own folders, notifications, and OS-level names so it never collides with a Jarvis install.
- [x] **12.4 Docs** — README, AGENTS, PRD, ARCHITECTURE, RULES, DESIGN, PHASES, and MEMORY updated; Jarvis's decisions listed as `JM2-DEC-NNN`.
- [x] **12.5 Verification** — clean build; screenshots of every screen against the pre-port references; the Phase 9 – 11 suites against Ultron with scratch data (write into apps 29/29, search 27/27 + keyed 6/6, vault API and UI, session API and UI) with four expected differences: export file names are `ultron-*`, one "yesterday" check fails on Jarvis too because its seed date is fixed, and the Escape checks need a longer wait under software rendering of the heavier orb; theme checks (Stark Gold default, blue and red previews recolour the HUD and QR, the orb stays gold); live Gemini 3.8 Live runs in character (greeting, identity, telemetry, memory, "make the HUD red" and back to Stark Gold, archive with recap, greeting recall, "what did we talk about earlier today" through `session_history`, no reply ever calling itself Jarvis).

---

## Phase 13: Phone Layout & Mobile Zoom (`DEC-169`)

Operator request (2026-10-05): the same phone responsiveness as J.A.R.V.I.S Mark II. On a phone the dock buttons ran off the screen, the top controls covered the ULTRON title, and the permanent Systems / Comms Log column covered almost the whole orb.

- [x] **13.1 HUD Layout on Phones** — below 640px (`hooks/useIsPhone.js`, `max-sm:` classes): the top controls get their own row under the notch with the title below; the dock becomes three equal link buttons (CONNECT / MUTE / INTERRUPT) above a row of nine equal icon buttons, clear of the home bar; the page is `h-dvh` so mobile browser toolbars never hide the dock; `viewportFit: "cover"` with safe-area insets; the fullscreen button is hidden where the browser has no page fullscreen. Desktop (640px and wider) is unchanged.
- [x] **13.2 Systems & Comms Log Behind Buttons** — on phones the permanent left column is hidden; phone-only SYSTEMS and COMMS buttons in the top left open one panel at a time, full width under the controls row (tap again or Escape to close). Desktop keeps both panels on screen.
- [x] **13.3 Phone Zoom** — `lib/ultronOrbScene.js` takes a `homeScale` and `setHomeScale()`; phones use 1.25² (two zoom-out presses, home distance ≈ 12.5 instead of 8.0) on load, on reset, and when the screen crosses the breakpoint. The orb itself is unchanged and stays gold.
- [x] **13.4 Panel Sweep** — every panel and modal opened at 360px and 390px wide: the Session / Memory vault count badges wrap instead of running under the header buttons; screen-vision and webcam windows open above the dock; the clipboard card sits just above the input; the 3D holo-viewer is shorter; the hand-gesture camera panel sits above the dock; drag handles accept touch (`touch-none`).

Verified: clean production build; every desktop control and panel in identical positions at 1920×1080, 1280×720, 1024×768, and 640×900; at 320, 360, 390, and 412px wide no control off-screen and none overlapping; SYSTEMS / COMMS open one at a time and close on a second tap or Escape; the phone default framing is exactly two zoom-ins away from the old one and reset returns to it; all 12 panels and modals inside the screen at 360 and 390px (headless Chrome). A real phone is an operator check (`DEC-169`).

---

## Phase 14: Windows Desktop Control, Focus Guard & Office (`DEC-170`)

Operator request (2026-10-05): the same as J.A.R.V.I.S Mark II's Phase 15 (its `DEC-195`). Desktop input, window management, and file operations worked only on Linux; on Windows too, "open Notepad" should open and focus it, and "now in Notepad type hello" should check whether Notepad is in front, bring it there if not, and type; and Office tools should work on Windows and Linux.

- [x] **14.1 Ported from J.A.R.V.I.S Mark II** — the Windows desktop host (`bin/win-desktop-host.ps1` in the built-in Windows PowerShell 5.1, driven by `lib/winDesktop.js`: windows, keyboard, mouse, UI Automation, Office COM); the focus guard and the app Ultron is working in (`lib/desktopTarget.js`, `lib/inputControl.js`: the named app is restored, brought to the front, and checked before typing; with no app named only the app Ultron is working in; never the HUD or a password box; terminals behind the HUD card; administrator windows refused); restore / close / active window actions; Start-menu app launching with the window brought forward (`lib/winAppIndex.js`, `lib/appLauncher.js`); typing-first `write_in_app`; the `office` tool (`lib/officeControl.js`, `/api/office`, 34 tools: Word / Excel / PowerPoint through COM on Windows, LibreOffice on Linux); Windows-aware file sandboxing (real user folders, case-insensitive paths, reserved names, locked-file messages); GUI apps no longer start hidden and `.cmd` launchers start through `cmd.exe`. Each file was copied only after checking it matched Jarvis's pre-Phase-15 version apart from names and comments, then given Ultron's names (Ultron Notes, Ultron Documents, messages).
- [x] **14.2 Persona** — guidelines 18, 22, 32 updated and 35 (Office) added, as in Jarvis.

Built cleanly here; not run in Ultron (the operator tests it by voice on Windows, and on Ubuntu for the Linux side) (`DEC-170`).

- [ ] Operator testing on Windows by voice (open and type into Notepad with another app in front, typing with no app named, a terminal window, Word / Excel / PowerPoint, an administrator window).
- [ ] The Linux side on Ubuntu (focus checks on X11 / Wayland, LibreOffice).

---

## Phase 15: To-Do List & Compact Layout (`DEC-171`)

Operator request (2026-10-05): a to-do list as a panel in J.A.R.V.I.S, Ada, and Ultron that fits on desktop and on phones (J.A.R.V.I.S Mark II Phase 16, its `DEC-197`). Agreed in planning: also fix the in-between widths, where the permanent left stack covered the title and the dock ran off the right edge (640–1023px).

- [x] **15.1 To-Do Store, API & Tool (from J.A.R.V.I.S Mark II)** — `lib/todoList.js` (`data/todos.json`, gitignored; to do / in progress / done; tasks named by a few words; undoable removals), `/api/todos`, and the `todo_list` live tool (35 tools: add, list, start, done, reopen, rename, remove, clear_done, show / hide); `undo_last_action` reloads the list; persona guideline 36; the BRIEFING button's briefing mentions open tasks.
- [x] **15.2 Task List** — `components/HUD/TodoList.jsx`: add box at the top (a phone keyboard never covers it), checkbox, start / pause, tap to edit, remove with an UNDO notice, finished tasks under DONE (n) with CLEAR DONE, in amber.
- [x] **15.3 Placement** — a TASKS button before INTEL in the top right with the open count; on desktop the panel floats at the top right, clear of the permanent Systems / Comms Log stack, and drags by its header; below 1024px it opens under the controls, one panel at a time with Systems and the Comms Log, full width on phones.
- [x] **15.4 Compact Layout Below 1024px** — the phone arrangement now covers 640–1023px too (`useIsCompact` in `hooks/useIsPhone.js`, `max-lg:` classes): the permanent Systems / Comms Log stack is hidden and opens one panel at a time from the SYSTEMS / COMMS buttons in the top left, the controls get a row above the title (labels from 768px), the dock has two rows, and the screen-vision / webcam windows, clipboard card, and gesture mirror sit above the taller dock. At 1024–1279px the stack starts below the title so it no longer covers the subtitle. Phones keep their full-width panels and zoomed-out orb.

Verified: clean production build; 20/20 to-do API checks against a separate server and a throwaway task file; the layout in headless Chrome at 320, 360, 390, 412, 640, 768, 900, 1000, 1024, 1100, 1280, 1366, and 1920px wide: no control off-screen or overlapping another, no sideways scroll, and the task list inside the screen (below 1024px, opening Systems replaces it). A real phone and voice use are operator checks (`DEC-171`).

- [ ] Operator testing (see Operator-Only Checks).
