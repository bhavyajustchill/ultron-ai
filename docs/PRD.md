# ⚡ PROJECT J.A.R.V.I.S MARK II — PRODUCT REQUIREMENTS DOCUMENT (PRD)

**Codename:** Mark II // Autonomous Desktop System  
**Target Platform:** Next.js 16 (App Router) + React Three Fiber (Three.js) + JavaScript (JSX) + Web Audio API  
**AI Core:** Gemini 3.8 Live API (Bidirectional WebSocket Audio, `models/gemini-3.8-live`)  
**Persona:** J.A.R.V.I.S — "Just A Rather Very Intelligent System"  
**Scope Source:** [`features.txt`](../features.txt) (Phase 7 in [`PHASES.md`](./PHASES.md))

---

## 1. Executive Vision & Value Proposition

**J.A.R.V.I.S Mark II** is a voice-first desktop and web AI companion with a cyberpunk tactical HUD, built with **Next.js 16** and **pure JavaScript (JSX)**.

Instead of robotic text-to-speech or a chat window, J.A.R.V.I.S combines:

1. **Real-Time Conversational Audio**: Native speech-to-speech via the Gemini 3.8 Live API (<500 ms latency, natural expressive speech, always-on proactive audio, session resumption for unlimited-length conversations).
2. **Holographic Arc Reactor Orb**: A React Three Fiber visual core whose particle sphere, radial dial, radar sweep, and white-hot core react live to listening, thinking, and speaking.
3. **Omni-Agent Capabilities**: Desktop and file control, project scaffolding, grounded web search, semantic long-term memory, media playback, document creation, vision, and a sandboxed terminal behind on-screen authorization.
4. **Cyberpunk Tactical HUD**: Glassmorphic electric aqua-cyan interface with telemetry, comms log, intel dossiers, and draggable floating panels.

---

## 2. Persona & Atmospheric Tone

### 2.1 The Persona: J.A.R.V.I.S

- **Tone & Demeanor:** Refined, British-cadenced, composed, analytical, and reassuring; polite yet subtly witty. Never panicked, never sycophantic.
- **Vocal Style:** Concise conversational turns built for barge-in; default male voice core **Charon** (16 male Gemini voices selectable). Numbers are spoken as natural words ("seventy-five percent").
- **Humour:** Optional dry British wit and deadpan understatement (Settings toggle).
- **Name & Wake Phrase:** Assistant codename, operator callsign, and standby wake phrase (default "Hey Jarvis") are configurable in Settings or by voice.

### 2.2 Target Operator

Developers and power users who want a voice-first assistant that can act on their machine: open apps, manage files, scaffold projects, run commands with approval, and look things up — with a striking visual presence.

---

## 3. Core Feature Scope

### 🎙️ 3.1 Real-Time Audio Engine & Expressive Voice Core

- **Native Bidirectional Streaming:** 16 kHz PCM mic ingest via `AudioWorkletNode` ➔ WebSocket ➔ Gemini 3.8 Live ➔ 24 kHz PCM playback through a jitter-buffered gapless player.
- **Instant Barge-In:** `stopAndFlush()` silences playback within 50 ms of the operator speaking.
- **Session Resilience:** Sliding-window context compression, resumption handles, GoAway socket swaps, and exponential-backoff re-sync behind a `RECONNECTING` status pill.
- **Zero Subscription Cost:** Runs on the Gemini Live API free tier.

### 🌅 3.2 Spoken Startup Greeting & Two-Phase Briefing

- **Phase 1:** Immediately after `setupComplete`, Jarvis greets the operator aloud with the local time.
- **Phase 2 (optional):** Grounded news headlines are fetched in parallel and delivered as a short spoken brief, with dossiers in the Intel panel.

### 💤 3.3 Standby & Wake Phrase

- When the link is offline, a browser Web Speech listener (Chrome / Edge) waits for the configurable wake phrase with fuzzy matching, then links Jarvis back up.
- `enter_standby` lets Jarvis sign off and close the link after his farewell.

### 🧠 3.4 Semantic Memory & Session Context

- **Knowledge Vault (`data/memories.json`):** Categorised facts, preferences, missions, and profile, injected into the system prompt and recalled with `recall_memory` / `store_memory`.
- **Semantic Recall (RAG):** Gemini Embedding 2 vectors in a local cache rank memories by meaning, with keyword fallback.
- **Vault Manager:** The MEMORIES panel shows which memories are in Jarvis's context and lets the operator search, filter, edit, pin, bulk-edit, delete with undo, merge duplicates, and export / import; `memory_vault` does the same curation by voice.
- **Session Continuity:** Each finished conversation is recapped in a sentence or two and recalled once in the next greeting; the operator's language is learned silently and Jarvis greets in it.

### 💠 3.5 Holographic Visual Core

- **Arc Reactor Orb (`ArcReactorOrb.jsx`):** Fibonacci particle sphere, static radial stator dial, rotating radar sweep, bloom flare, and a core that swells while speaking; zero allocations inside `useFrame()`.
- **Viewport (`JarvisViewport.jsx`):** Zoom in / out / reset controls and a live FPS profiler.

### 👁️ 3.6 Multimodal Vision

- **Screen Interrogation:** `getDisplayMedia` frames streamed to Gemini Live for screen analysis and debugging.
- **Webcam Feed:** `getUserMedia` picture-in-picture with frame streaming.

### 🖥️ 3.7 Desktop & File Control

- **Apps & System:** Launch any installed app by name (`.desktop` index), volume, folders, URLs, minimize, lock.
- **Files:** Sandboxed create / read / write / replace / append / open, folder organiser with preview, apply, and undo; no delete.
- **Input & Windows:** Typing, key combos, mouse, scroll, and window focus / minimize / maximize via xdotool or ydotool and wmctrl or the GNOME Window Calls extension; on Wayland, typing also works through the RemoteDesktop portal with no setup.
- **Write Into Apps:** "Open notepad and type hello world" opens the default text editor with the text as a saved, undoable note; other apps are launched and typed into once they have focus.
- **Terminal:** Read-only commands run immediately; everything else requires a click on the HUD authorization card; sudo and destructive commands are refused.

### 🔍 3.8 Intelligence & Web Search

- **Grounded Search:** Built-in Google Search grounding in the live session plus `web_search` dossiers via Gemini with Google Search; cited sources land in the Intel panel.
- **Search Then Read:** On keys without grounding quota, `web_search` finds pages from keyless sources (or a configured Brave / Google Programmable Search / Serper key), has Gemini read the top pages, and answers with numbered citations; the live session is told to use it for anything current.
- **Weather:** Live meteorological telemetry via `get_weather`.

### 📄 3.9 Documents, Uploads & Projects

- **Document Forge:** Markdown ➔ PDF (`pdf-lib`) or Word (`docx`) via `create_document`.
- **Uploads:** Drag-and-drop or UPLOAD button; images go to Gemini as images, PDFs / Word / text as extracted content.
- **Project Scaffolder:** Node/Express API (JS or TS) and admin panel via `@bhavyajustchill/init`, Next.js via `create-next-app`, React (JavaScript) via Vite, Flutter via `flutter create`, run as background jobs.

### 🎬 3.10 Media Deck

- **YouTube:** Built-in player panel with search, queue, auto-advance, and volume ducking under Jarvis's voice.
- **Spotify:** Desktop app control over MPRIS; exact-track playback with optional free Web API credentials.
- **3D Viewer:** glTF / GLB holo-viewer with auto-framing, orbit controls, animation playback, and stats.

### 🧩 3.11 Modular Cyber-Plugin Architecture

- Drop-in JavaScript plugins in `plugins/`, auto-discovered and executed via `run_cyber_plugin`, with a HUD plugin console.

### ⚙️ 3.12 Identity, Voice & System Customisation

- Settings modal for callsign, assistant codename, role, clearance, directives, voice core, humour, auto-briefing, mic default, and wake phrase; `update_operator_profile` lets Jarvis change them by voice.

### 📱 3.13 Mobile Companion

- LAN pairing via QR code and a standalone `/mobile` PWA with push-to-talk relay and remote desktop actions.

### 🧭 3.14 Mark-LIII Parity (Phase 8)

- **Instant acknowledgment** before slow tasks, **undo** of Jarvis's own actions, and **system settings** (dark mode, WiFi, brightness, wallpaper, power with on-screen confirmation).
- **OS-native reminders**, **start on login**, **session recaps** with **language memory**, and **auto-standby**.
- **Background intelligence:** proactive check-ins, hardware voice alerts, topic monitors.
- **Audio device picker** and **accent theming**.
- **Messaging** (WhatsApp / Telegram / email), **flight lookup**, **Steam** library checks.
- **Deep file processing** (images, PDFs, spreadsheets, audio / video), **browser automation**, an **autonomous dev agent**, an **offline "Hey Jarvis"** wake word, and **clipboard intelligence**.

---

## 4. Non-Functional & Tactical Requirements

| Metric                       | Requirement              | Target Architecture                                       |
| :--------------------------- | :----------------------- | :-------------------------------------------------------- |
| **Framework & Dialect**      | Next.js 16 + Pure JSX/JS | Next.js 16 App Router, React 19, zero TypeScript          |
| **End-to-End Voice Latency** | `< 500 ms`               | Gemini 3.8 Live WebSocket                                 |
| **3D Rendering Performance** | Stable `60 FPS`          | React Three Fiber, zero-allocation `useFrame()`           |
| **Audio Ingest Overhead**    | `< 2% CPU`               | `AudioWorkletProcessor` downsampling thread               |
| **Host Safety**              | Sandboxed by default     | File sandbox roots, same-origin guard, terminal approval  |
| **Browser Compatibility**    | Chrome, Edge, Brave      | WebGL2, Web Audio API, WebSockets (wake phrase: Chrome / Edge) |

---

## 5. Out of Scope (Non-Goals)

- **No TypeScript / No TSX** in this codebase: strictly `.js` and `.jsx`.
- **No Cascade Pipelines:** No Whisper ➔ text LLM ➔ TTS chains; native speech-to-speech only.
- **No Silent Destructive Actions:** No file delete tool; terminal commands that change the system always need an on-screen click.
- **No Unencrypted Channels:** All Gemini communication uses WSS / HTTPS.
