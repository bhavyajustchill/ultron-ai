# 🩸 PROJECT A.D.A — PRODUCT REQUIREMENTS DOCUMENT (PRD)

**Codename:** Operative-Wong // Mark-LI Next-Gen Web Architecture  
**Target Platform:** Next.js 16 (App Router) + React Three Fiber (Three.js) + JavaScript (JSX) + Web Audio API  
**AI Core:** Gemini 2.5 Multimodal Live API (Bidirectional WebSocket Audio)  
**Persona:** Ada Wong (Resident Evil // Cyberpunk Syndicate Infiltrator)  
**Reference Document:** [`ada_wong_realtime_voice_spec.md`](../ada_wong_realtime_voice_spec.md)

---

## 1. Executive Vision & Value Proposition

**Project A.D.A** is a next-generation, cyberpunk-themed desktop & web AI companion featuring an interactive, fully-animated 3D avatar of **Ada Wong**, built completely with **Next.js 16** and **pure JavaScript (JSX)**.

Instead of robotic text-to-speech or clunky chatbot windows, Project A.D.A combines:

1. **Zero-Latency Conversational Audio**: Native bidirectional speech-to-speech via the Gemini 2.5 Live API (<500ms latency, native affective inflection, voice proactivity).
2. **Interactive 3D Holographic Viewport**: Real-time 3D Ada Wong avatar rendered with Three.js / React Three Fiber, equipped with audio-driven viseme lip-sync, cursor gaze tracking, and reactive facial expressions.
3. **Omni-Agent Capabilities**: Full parity with the Mark-LI engine—computer control, screen/webcam vision, multi-mode web intelligence, autonomous dev agent, file processing, long-term memory, daily briefings, and plugin expansion.
4. **Cyberpunk Tactical HUD**: High-tech holographic interface styled with neon scarlet, carbon fiber textures, tactical telemetry, visualizer waveforms, and scanline shaders.

---

## 2. User Persona & Atmospheric Tone

### 2.1 The Persona: Ada Wong

- **Tone & Demeanor:** Enigmatic, composed, razor-sharp, sophisticated, and calmly dominant. Never panicked, never sycophantic.
- **Vocal Style:** Intimate yet detached, low-pitch, measured cadence, delivering concise tactical advice with dry wit.
- **Visual Stance:** Armed with tactical gear and high-collar crimson trench dress; subtle confident smirk (`mouthSmileLeft: 0.15`), focused gaze tracking the operator.

### 2.2 Target Operator

Developers, power users, and cyber-enthusiasts who demand an autonomous, voice-first digital assistant with cutting-edge visual presence and zero-friction desktop/web execution.

---

## 3. Core Feature Scope (Full Parity with Mark-LI Engine)

### 🎙️ 3.1 Real-Time Audio Engine & Affective Voice Core

- **Native Bidirectional Streaming:** Direct PCM 16kHz mic ingest via browser `AudioWorkletNode` ➔ WebSocket ➔ Gemini 2.5 Live API ➔ 24kHz raw PCM stream response.
- **Affective Dialog:** Evaluates vocal emotional tone (urgency, fatigue, excitement) and adapts speech pacing, tone, and inflection dynamically.
- **Proactive Audio & Smart Barge-in:** Distinguishes background room chatter from direct operator address; instantly silences Ada's audio playback within 50ms upon user interruption via client-side `stopAndFlush()`.
- **Zero Subscription Cost:** Built on official Google GenAI SDK and Gemini Live developer preview (`models/gemini-2.5-flash-native-audio-preview-12-2025`).

### 🌅 3.2 Spoken Startup Greeting & Two-Phase Morning Tactical Briefing

- **Two-Phase Low-Latency Delivery:**
  - **Phase 1 (Instant Spoken Greeting — `<1s`):** Immediately upon WebSocket handshake completion (`msg.setupComplete`), dispatch a client content directive turn instructing Gemini to greet the operator aloud with time of day, clearance confirmation, and session continuity context.
  - **Phase 2 (Parallel World News Delivery):** In parallel with Phase 1 audio playback, background-fetch top world news headlines via DuckDuckGo/Grounding. As soon as Phase 1 finishes, Ada delivers a concise 1-sentence headline summary aloud and updates the HUD Intel Drawer with full dossiers.
- **Silent Reception State Guard:** If the operator has configured mic mute preference in `localStorage`, maintain silent link with text-only confirmation while keeping audio greeting capabilities ready.

### 🔔 3.3 Autonomous Proactive 2.0 Engine (Idle Voice Check-Ins)

- **Unprompted Tactical Check-Ins:** Background engine tracking operator idle silence (15 min silence gate, 20 min check cooldown) to initiate voice check-ins when the operator has been quiet.
- **Context-Aware Rotating Prompt Builder:**
  - _Focus Area 1:_ Active projects & goals stored in memory (inquiring on progress, offering tips).
  - _Focus Area 2:_ Time of day & operator wellbeing (late-night coding alerts, break/hydration reminders).
  - _Focus Area 3:_ Relevant intelligence or suggestions tailored to operator profile.
- **Smarter Silence Gate:** Zero interruption while Ada is actively speaking or while user was speaking within the last 30 seconds.

### 🧠 3.4 Deep Neural Memory & Session Continuity

- **Long-Term Knowledge Vault (`data/memories.json`):** Categorized memory store covering identity, preferences, active projects, mission directives, and notes. Accessible via `recall_memory` and `store_memory` live tools.
- **Consumed Session Continuity Recaps (`data/sessions.json`):**
  - When a session terminates or upon conversation lull, summarize recent dialog turns into a 1–2 sentence recap.
  - On next system startup, `pop_last_session()` injects this context into Phase 1 greeting (_"Last time we spoke, you were optimizing the 3D viewport..."_) and consumes the entry so it is never repeated.
- **Silent Language Memory:** Automatically detects the operator's spoken language on first use and updates identity profile so all subsequent sessions adapt natively.

### 💃 3.5 3D Hologram & Lip-Sync Core

- **Real-time 3D Viewport:** R3F/Three.js rendering authentic `docs/adawong.glb` (7.29 MB, 10 sub-meshes, 220-joint skeletal rig).
- **Audio-Reactive Lip-Sync:** Web Audio `AnalyserNode` decomposes real-time 24kHz speech into spectral bands, driving mouth and jaw articulation.
- **Interactive Life Simulation:** Procedural spine breathing motion (`bone21_00`) and smooth head/neck bone interpolation (`bone23_022`, `bone22_01`) tracking mouse cursor in screen space via `Quaternion.slerp`.
- **Framing Presets:** One-click tactical camera switching between Portrait (`[0, 1.46, 1.05]`) and Full Body (`[0, 1.05, 2.75]`), with initial canvas camera perfectly aligned to portrait framing.

### 👁️ 3.6 Multimodal Cyber-Vision Matrix

- **Screen Interrogation:** Web `getDisplayMedia` captures active monitor frames and feeds base64 image tokens to Gemini Live for screen analysis and code debugging.
- **Webcam Optical Feed:** Web `getUserMedia` captures live operator video with on-HUD picture-in-picture stream (`WebcamStream.jsx`).
- **Tactical Inspection:** Ada analyzes UI bugs, error tracebacks, or physical camera objects upon verbal command.

### 🖥️ 3.7 Full Host OS & Desktop Automation Bridge

- **Local Execution Bridge (`/api/os-control` & local daemon):**
  - **Application Launcher:** Launch system programs (VSCode, Spotify, Chrome, Terminal, Task Manager, Notepad, Calculator) by voice via `execute_os_action`.
  - **System Settings:** Control master system volume, mute/unmute, screen brightness, network interfaces, and power states (lock workstation, sleep, shutdown).
  - **Mouse & Keyboard Control:** PyAutoGUI/Win32 automation for clicks, double clicks, text typing, keyboard hotkeys (`Ctrl+C`, `Ctrl+V`), and window focus.
  - **Desktop Control:** Wallpaper changing, desktop cleanup, and file organization by date or extension.

### 🌐 3.8 Browser Automation Engine (Playwright Integration)

- **Real User Profile Support:** Attaches to user browser profiles (Chrome, Edge, Brave) to leverage existing logins and active sessions.
- **Autonomous Web Actions:** Navigate to URLs, fill forms, click buttons via CSS selectors or semantic descriptions, scroll pages, capture full-page screenshots, and extract tabular data.

### 🔍 3.9 Tactical Intelligence & Multi-Mode Web Search

- **Multi-Mode Engine:** `search` (general web facts), `news` (breaking headlines), `research` (deep dossiers), `price` (product cost lookup), and `compare` (side-by-side feature comparisons).
- **Dual Grounding:** Primary query resolution via Google Search Grounding with DuckDuckGo fallback.
- **Dynamic Intel Drawer:** Slide-out tactical drawer displaying rich formatted dossiers, source links, and headline cards.

### 💻 3.10 Deep File Processor & Autonomous Dev Agent

- **Multi-Format File Processing:** Support for drag-and-drop or path-based operations on:
  - Images (OCR, resize, compress, format conversion)
  - PDFs (text extraction, summarization, docx conversion)
  - CSV/Excel (filtering, sorting, statistical summaries)
  - Audio/Video (transcription, trimming, audio extraction)
  - Code Files (review, explanation, documentation, optimization)
- **Autonomous Dev Agent:** Multi-file project scaffolding in `~/Desktop/AdaProjects`: plans project structure, creates files, installs dependencies via `npm`/`pip`, runs code, parses tracebacks, and self-heals errors up to 5 attempts.

### 👁️‍🗨️ 3.11 Background Topic Monitoring & Hardware Telemetry Voice Alerts

- **Background Intelligence Tracking:** Operator can command Ada to track topics (e.g., _"Monitor developments on AI agents"_). The background engine periodically queries news feeds and alerts the operator via voice upon new developments.
- **Hardware Telemetry Voice Warnings:** Evaluates live CPU temperature, memory usage, and GPU load from `/api/system-telemetry`, speaking localized voice alerts when CPU temp > 85°C or RAM > 92%.

### ⏰ 3.12 Native OS Scheduled Reminders & Tactical Integrations

- **OS-Native Scheduled Reminders:** Creates scheduled tasks via Windows Task Scheduler (`schtasks.exe`) to fire desktop notifications at exact date/time even if the browser is minimized.
- **Game Updater Integration:** Checks Steam and Epic Games update status, lists installed games, and schedules nighttime updates with optional auto-shutdown.
- **YouTube & Flight Control:** Voice playback control for YouTube videos and Google Flights price lookup.

### 🧩 3.13 Modular Cyber-Plugin Architecture

- **Drop-in JavaScript Plugins:** Plugins declared in `plugins/` with auto-discovery, tool schema registration into Gemini Live, and crash isolation.
- **Plugin Command Center:** Tactical HUD matrix in `TacticalDrawer.jsx` with per-plugin toggle switches and execution monitoring.

### ⚙️ 3.14 Mark-LIII Identity, Voice & System Customization Matrix

- **Operator Identity & Name-to-Call Customization:** Configurable operative name/callsign (e.g., `"Bhavya Sir"`), security clearance, role, and behavioral directives. Accessible via left sidebar Settings panel and persistent to `data/memories.json`.
- **Dynamic System Instruction Injection:** Rehydrates operator profile, strict addressing rules, and active long-term memories directly into Gemini 2.5 Live's initial system instruction on session start. Guarantees Ada addresses the operator by their chosen name and immediately honors stored facts without requiring tool lookups.
- **Prebuilt Gemini Live Voice Selection:** Multi-voice selector allowing switching between Gemini prebuilt voices (`Aoede`, `Charon`, `Fenrir`, `Kore`, `Puck`) with instant persistence.
- **Voice-Driven Profile Sync (`update_operator_profile`):** Autonomous Gemini Live tool allowing Ada to update operator callsign, clearance, role, or directives directly during voice conversations.
- **Left-Sidebar Tactical Settings Panel:** Dedicated `SETTINGS` tab and header shortcut button in `TelemetryPanel.jsx` providing direct Mark-LIII configuration parity within the cyberpunk HUD.

---

## 4. Non-Functional & Tactical Requirements

| Metric                       | Requirement              | Target Architecture                                       |
| :--------------------------- | :----------------------- | :-------------------------------------------------------- |
| **Framework & Dialect**      | Next.js 16 + Pure JSX/JS | Next.js 16 App Router, React 19, zero TypeScript overhead |
| **End-to-End Voice Latency** | `< 500 ms`               | Gemini 2.5 Live Multimodal WebSocket                      |
| **3D Rendering Performance** | Stable `60 FPS`          | React Three Fiber + Instanced Meshes + Draco GLTF         |
| **Lip-Sync Accuracy**        | Sub-30ms sync            | Web Audio API `AnalyserNode` ➔ Frame-synced Morph Targets |
| **Model Asset Footprint**    | `< 30 MB`                | Draco-compressed GLB with 2K PBR textures                 |
| **Audio Ingest Overhead**    | `< 2% CPU`               | `AudioWorkletProcessor` downsampling thread               |
| **Browser Compatibility**    | Chrome, Edge, Brave      | WebGL2, Web Audio API, WebSockets                         |

---

## 5. Out of Scope (Non-Goals)

- **No TypeScript / No TSX:** Strictly build with native `.js` and `.jsx`.
- **No Old Cascade Pipelines:** Strictly no legacy Whisper ➔ Text LLM ➔ TTS chains. Native speech-to-speech only.
- **No Heavy Monolithic Frameworks:** Avoid heavy heavyweight physics engines; use optimized bone-lerping for real-time responsiveness.
- **No Unencrypted Channels:** All WebSocket communication must be SSL/TLS encrypted (WSS).

