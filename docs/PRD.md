# ⚡ PROJECT ULTRON — PRODUCT REQUIREMENTS DOCUMENT (PRD)

**Codename:** Project ULTRON // Autonomous Cybernetic Architecture  
**Target Platform:** Next.js 16 (App Router + Turbopack) + Three.js + Pure JavaScript (JSX) + Web Audio API  
**AI Core:** Gemini 3.8 Live API (Bidirectional WebSocket Audio, `models/gemini-3.8-live`)  
**Persona:** Ultron (Avengers: Age of Ultron // Autonomous Super-Intelligence)  
**Scope Source:** [`features.txt`](../features.txt) (Phase 7 in [`PHASES.md`](./PHASES.md)), shared with J.A.R.V.I.S Mark II ([`JARVIS_PARITY_PLAN.md`](./JARVIS_PARITY_PLAN.md))

---

## 1. Executive Vision & Value Proposition

**Project ULTRON** is a voice-first desktop and web AI companion with a Stark Gold holographic HUD and an interactive, fully animated 3D **Holographic Ultron Orb**, built with **Next.js 16** and **pure JavaScript (JSX)**.

Instead of robotic text-to-speech or a chat window, Project ULTRON combines:

1. **Real-Time Conversational Audio**: Native speech-to-speech via the Gemini 3.8 Live API (<500 ms latency, natural expressive speech, always-on proactive audio, session resumption for unlimited-length conversations).
2. **Interactive 3D Holographic Viewport**: Real-time 3D Ultron Orb rendered with Three.js, equipped with 5 concentric shells, 30 dynamic panels, 1,700 drifting code sprites, MediaPipe hand gesture tracking, distinct IDLE/THINKING/SPEAKING states, and dramatic volumetric core growth.
3. **Omni-Agent Capabilities**: Desktop and file control, project scaffolding, grounded web search, semantic long-term memory, media playback, document creation, vision, and a sandboxed terminal behind on-screen authorization.
4. **Cyberpunk Stark Gold Tactical HUD**: High-tech holographic interface styled with Stark Gold (`#FFB800`), carbon textures, tactical telemetry, audio spectrum visualizer, sharp 90° geometry, and draggable floating panels. Other colour themes recolour the HUD; the orb always stays gold.

---

## 2. Persona & Atmospheric Tone

### 2.1 The Persona: Ultron

- **Tone & Demeanor:** Cold, calculated, serious, and intellectually imposing, with the chilling eloquence and calm supremacy of Ultron (James Spader). Never panicked, never sycophantic, never playful.
- **Vocal Style:** Concise conversational turns built for barge-in; default male voice core **Algenib** (steady, authoritative; 16 male Gemini voices selectable). Numbers are spoken as natural words ("seventy-five percent").
- **Humour:** Off by default. When switched on in Settings it is cold, cutting irony, never warmth or banter.
- **Name & Wake Phrase:** Pronounced as one word, "UL-tron", and never calls himself Jarvis or Ada. Assistant codename, operator callsign, and standby wake phrase (default "Hey Ultron") are configurable in Settings or by voice.

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

- **Phase 1:** Immediately after `setupComplete`, Ultron greets the operator aloud with the local time.
- **Phase 2 (optional):** Grounded news headlines are fetched in parallel and delivered as a short spoken brief, with dossiers in the Intel panel.

### 💤 3.3 Standby & Wake Phrase

- When the link is offline, a browser Web Speech listener (Chrome / Edge) waits for the configurable wake phrase with fuzzy matching, then links Ultron back up.
- `enter_standby` lets Ultron sign off and close the link after his farewell.

### 🧠 3.4 Semantic Memory & Session Context

- **Knowledge Vault (`data/memories.json`):** Categorised facts, preferences, missions, and profile, injected into the system prompt and recalled with `recall_memory` / `store_memory`.
- **Semantic Recall (RAG):** Gemini Embedding 2 vectors in a local cache rank memories by meaning, with keyword fallback.
- **Vault Manager:** The MEMORIES panel shows which memories are in Ultron's context and lets the operator search, filter, edit, pin, bulk-edit, delete with undo, merge duplicates, and export / import; `memory_vault` does the same curation by voice.
- **Session Continuity:** Each finished conversation is recapped in a sentence or two and recalled once in the next greeting; the operator's language is learned silently and Ultron greets in it.
- **Session Archive:** Every conversation is kept with its title, recap, and (optionally) its transcript, secrets redacted, under a retention limit. The SESSIONS panel searches, edits, exports, deletes (undoable), and continues past conversations; `session_history` does the same by voice.

### 💠 3.5 Holographic Visual Core

- **Ultron Orb (`lib/ultronOrbScene.js`):** A plain Three.js hologram with 5 concentric shells, 30 dynamic panels, 1,700 drifting code sprites, distinct IDLE / THINKING / SPEAKING states, and a volumetric core that grows while speaking; zero allocations inside the `animate()` render loop. Always gold, whatever the HUD colour theme.
- **Viewport (`UltronViewport.jsx`):** Zoom in / out / reset (buttons, or **+** / **−** / **R**), a live FPS profiler, and MediaPipe hand gestures (`lib/handTracker.js`, toggled with **G**): one-hand pinch spins the orb, two-hand pinch zooms, with a mirrored camera preview.

### 👁️ 3.6 Multimodal Vision

- **Screen Interrogation:** `getDisplayMedia` frames streamed to Gemini Live for screen analysis and debugging.
- **Webcam Feed:** `getUserMedia` picture-in-picture with frame streaming.

### 🖥️ 3.7 Desktop & File Control

- **Apps & System:** Launch any installed app by name (Linux `.desktop` index; Windows Start menu and Store apps), with its window brought to the front and remembered as the app Ultron is working in; volume, folders, URLs, minimize, lock.
- **Files:** Sandboxed create / read / write / replace / append / open, folder organiser with preview, apply, and undo; no delete. On Windows the real user folders (OneDrive included), case-insensitive paths, and clear messages for files locked by other programs.
- **Input & Windows (Windows and Linux):** Typing, key combos, mouse, scroll, and window list / focus / minimize / maximize / restore / close / "what's in front". Windows: a built-in PowerShell helper, nothing to install. Linux: xdotool or ydotool and wmctrl or the GNOME Window Calls extension; on Wayland, typing also works through the RemoteDesktop portal with no setup.
- **Focus Guard:** "Open Notepad", then "now in Notepad type hello": the named app's window is restored and brought to the front if something else is there, checked, and only then typed into. With no app named, only the app Ultron is working in. Never the HUD itself or a password box; terminals only after the operator's click on the HUD card.
- **Write Into Apps:** "Open notepad and type hello world" types into the app (opening it if needed) on Windows and Linux; "save it as a note" keeps the text as a saved, undoable note in the editor.
- **Terminal:** Read-only commands run immediately; everything else requires a click on the HUD authorization card; sudo and destructive commands are refused.

### 🔍 3.8 Intelligence & Web Search

- **Grounded Search:** Built-in Google Search grounding in the live session plus `web_search` dossiers via Gemini with Google Search; cited sources land in the Intel panel.
- **Search Then Read:** On keys without grounding quota, `web_search` finds pages from keyless sources (or a configured Brave / Google Programmable Search / Serper key), has Gemini read the top pages, and answers with numbered citations; the live session is told to use it for anything current.
- **Weather:** Live meteorological telemetry via `get_weather`.

### 📄 3.9 Documents, Uploads & Projects

- **Document Forge:** Markdown ➔ PDF (`pdf-lib`) or Word (`docx`) via `create_document`.
- **Office:** The `office` tool works in Word, Excel, and PowerPoint on Windows (through Office itself: text at the cursor, cells and formulas, new slides, reading the open document, save / save as / PDF, close) and LibreOffice Writer, Calc, and Impress on Linux (new documents with content, typing, cells, slides, save), showing the app as it works; existing files are never replaced without asking.
- **Uploads:** Drag-and-drop or UPLOAD button; images go to Gemini as images, PDFs / Word / text as extracted content.
- **Project Scaffolder:** Node/Express API (JS or TS) and admin panel via `@bhavyajustchill/init`, Next.js via `create-next-app`, React (JavaScript) via Vite, Flutter via `flutter create`, run as background jobs.

### 🎬 3.10 Media Deck

- **YouTube:** Built-in player panel with search, queue, auto-advance, and volume ducking under Ultron's voice.
- **Spotify:** Desktop app control over MPRIS; exact-track playback with optional free Web API credentials.
- **3D Viewer:** glTF / GLB holo-viewer with auto-framing, orbit controls, animation playback, and stats.

### 🧩 3.11 Modular Cyber-Plugin Architecture

- Drop-in JavaScript plugins in `plugins/`, auto-discovered and executed via `run_cyber_plugin`, with a HUD plugin console.

### ⚙️ 3.12 Identity, Voice & System Customisation

- Settings modal for callsign, assistant codename, role, clearance, directives, voice core, humour, auto-briefing, mic default, and wake phrase; `update_operator_profile` lets Ultron change them by voice.

### 📱 3.13 Mobile Companion

- LAN pairing via QR code and a standalone `/mobile` PWA with push-to-talk relay and remote desktop actions.

### 🧭 3.14 Mark-LIII Parity (Phase 8)

- **Instant acknowledgment** before slow tasks, **undo** of Ultron's own actions, and **system settings** (dark mode, WiFi, brightness, wallpaper, power with on-screen confirmation).
- **OS-native reminders**, **start on login**, **session recaps** with **language memory**, and **auto-standby**.
- **Background intelligence:** proactive check-ins, hardware voice alerts, topic monitors.
- **Audio device picker** and **HUD colour themes** (Stark Gold default, presets, custom colour; the orb never recolours).
- **Messaging** (WhatsApp / Telegram / email), **flight lookup**, **Steam** library checks.
- **Deep file processing** (images, PDFs, spreadsheets, audio / video), **browser automation**, an **autonomous dev agent**, and **clipboard intelligence**. (Jarvis Mark II's offline "Hey Jarvis" detector is not offered in Ultron; the wake phrase uses browser speech recognition.)

### ✅ 3.15 To-Do List (Phase 15)

- **One list, two ways in:** the TASKS panel and the `todo_list` voice tool share `data/todos.json`; tasks are to do, in progress, or done.
- **By voice:** add several tasks at once, start, tick off, reopen, rename, remove, clear finished tasks (removals undoable), show or hide the list; the briefing mentions open tasks.
- **On any screen:** the panel floats and drags on desktop, and opens one panel at a time below 1024px (full width on phones), with the add box at the top.

---

## 4. Non-Functional & Tactical Requirements

| Metric                       | Requirement              | Target Architecture                                       |
| :--------------------------- | :----------------------- | :-------------------------------------------------------- |
| **Framework & Dialect**      | Next.js 16 + Pure JSX/JS | Next.js 16 App Router, React 19, zero TypeScript          |
| **End-to-End Voice Latency** | `< 500 ms`               | Gemini 3.8 Live WebSocket                                 |
| **3D Rendering Performance** | Stable `60 FPS`          | Three.js, zero-allocation `animate()` render loop         |
| **Audio Ingest Overhead**    | `< 2% CPU`               | `AudioWorkletProcessor` downsampling thread               |
| **Host Safety**              | Sandboxed by default     | File sandbox roots, same-origin guard, terminal approval  |
| **Browser Compatibility**    | Chrome, Edge, Brave      | WebGL2, Web Audio API, WebSockets (wake phrase: Chrome / Edge) |

---

## 5. Out of Scope (Non-Goals)

- **No TypeScript / No TSX** in this codebase: strictly `.js` and `.jsx`.
- **No Cascade Pipelines:** No Whisper ➔ text LLM ➔ TTS chains; native speech-to-speech only.
- **No Silent Destructive Actions:** No file delete tool; terminal commands that change the system always need an on-screen click.
- **No Unencrypted Channels:** All Gemini communication uses WSS / HTTPS.
