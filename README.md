# J.A.R.V.I.S Mark II

**Just A Rather Very Intelligent System** — a voice-first desktop assistant with a holographic HUD. You talk to it, it talks back in real time, and it can act on your computer: open apps, manage files, change system settings, set reminders, run code it writes, drive a browser, read documents, and more, behind clear safety rails.

- **Voice core:** Gemini 3.8 Live (`models/gemini-3.8-live`), native speech-to-speech over WebSocket, about half a second to first audio.
- **Interface:** a Next.js 16 HUD with a React Three Fiber "Arc Reactor" orb that reacts to listening, thinking, and speaking.
- **Stack:** Next.js 16 (App Router + Turbopack), React 19, pure JavaScript / JSX (no TypeScript), Three.js, Web Audio, Zustand.
- **Platform:** built and verified on Ubuntu (GNOME, Wayland). Windows and macOS paths exist for many features but are untested.

---

## Contents

1. [Quick start](#quick-start)
2. [Talking to Jarvis](#talking-to-jarvis)
3. [What Jarvis can do](#what-jarvis-can-do)
4. [The HUD](#the-hud)
5. [Settings](#settings)
6. [Safety model](#safety-model)
7. [Live tools reference](#live-tools-reference)
8. [Configuration](#configuration)
9. [System requirements per feature](#system-requirements-per-feature)
10. [Project layout](#project-layout)
11. [Extending Jarvis](#extending-jarvis)
12. [Data and privacy](#data-and-privacy)
13. [Known limits and operator checks](#known-limits-and-operator-checks)
14. [Documentation and licences](#documentation-and-licences)

---

## Quick start

**Requirements:** Node.js 20+ (developed on Node 24), Chrome or Edge, and a [Gemini API key](https://aistudio.google.com/apikey). The free tier works for everything except Google Search grounding.

```bash
npm install

# Development (http://localhost:6061)
npm run dev

# Production
npm run build
npm start              # http://localhost:3000 (PORT=... to change)
```

Open the HUD in Chrome or Edge. Jarvis asks for your Gemini API key the first time (it is kept in the browser's local storage and sent only to this app's own server routes). Alternatively set `GEMINI_API_KEY` in the server environment. Allow microphone access, and Jarvis greets you aloud.

Want it ready every time you log in? Turn on **Start on Login** in Settings (or say "start yourself when I log in").

---

## Talking to Jarvis

- **Speak** once the mic is live (the **UNMUTE MIC** button toggles it), or **type** in the command bar and press Enter.
- **Interrupt** any time by talking over him (instant barge-in: playback stops within 50 ms), or press **INTERRUPT**.
- **Upload** by dragging files onto the HUD or using **UPLOAD**: images go straight to Gemini's vision, PDFs / Word / text files are read, 3D models open in the holo-viewer.
- **Show** your screen or webcam with the screen and camera buttons; Jarvis can see and discuss them.
- **Standby:** say "go to standby" (or let auto-standby kick in after two quiet minutes) and the link closes; say **"Hey Jarvis"** (or your custom wake phrase) to bring him back.
- Jarvis answers in the language you speak, learns your usual language, and addresses you by your callsign.

---

## What Jarvis can do

### Conversation and memory

- **Real-time voice** with 16 selectable male voices (default *Charon*, refined British), optional dry British wit, and natural number pronunciation ("seventy-five percent").
- **Unlimited-length sessions:** sliding-window context compression, session resumption, seamless socket swaps when Gemini retires a connection (GoAway), and automatic re-sync with back-off after drops.
- **Settings changes keep the conversation:** changing voice or persona re-links on a fresh session seeded with your recent turns.
- **Long-term memory vault** (`data/memories.json`): facts, preferences, missions, and your profile. Jarvis stores and recalls them, ranks them by meaning with Gemini Embedding 2 (keyword fallback), and lists what does not fit in his prompt so he can look it up.
- **Session recaps:** each finished conversation is summarised in a sentence or two and mentioned once in the next greeting ("Earlier today you were planning the Kyoto trip...").
- **Spoken briefing:** an optional morning briefing with news headlines after the greeting, or on demand with **BRIEFING**.
- **Instant acknowledgement** before slow tasks, so you are never left waiting in silence.

### Web, news, and information

- **Web search dossiers** (`web_search`): Gemini with Google Search grounding, cited sources in the Intel panel, DuckDuckGo fallback, and a clearly labelled model-knowledge answer when nothing live is available. Modes: search, news, research, price, and side-by-side **compare** of several items.
- **Google Search grounding** inside the live conversation (needs a key with grounding quota; skipped automatically when the key lacks it).
- **Weather** (Open-Meteo, with wttr.in fallback).
- **Flights** (`find_flights`): opens Google Flights on your search and reads the live results back, so Jarvis quotes the fares actually on screen.
- **Topic monitors:** "keep an eye on SpaceX Starship" — topics are checked about daily via Google News RSS and Jarvis speaks up when a genuinely new headline appears.

### Your computer

- **Launch any installed app** by name (desktop-entry index across system, user, Flatpak, and Snap apps), with candidates when a name is ambiguous.
- **Volume** (up / down / set / mute), **open folders and URLs**, **minimise all**, **lock screen**.
- **System settings** (`system_settings`): dark mode (including the matching GTK theme), WiFi, screen brightness (via systemd-logind, no root), wallpaper from a file or an image URL, listing and ending programs, shutdown / restart / suspend / log out (with a 10-second grace period and "cancel").
- **Undo** (`undo_last_action`): "undo that" reverses Jarvis's own last change — files he created or edited, folder organizing, volume, dark mode, brightness, wallpaper, WiFi off — up to ten steps back.
- **Keyboard, mouse, and windows** (`desktop_input`): typing, key combos, clicks, scrolling, and focusing / minimising / maximising windows (xdotool or ydotool, wmctrl or the GNOME Window Calls extension).
- **Terminal** (`run_terminal_command`): read-only commands run straight away; anything else waits for your click on the HUD authorization card; sudo and destructive commands are refused.
- **Hardware voice alerts:** CPU temperature above 85 °C, RAM above 92 %, sustained CPU load above 90 %, battery at 15 % or lower while unplugged.
- **Audio devices** (`audio_devices`): choose the microphone and speaker by name.
- **Clipboard intelligence** (opt-in): copy text and a panel offers Translate / Summarise / Explain / Fix; "Fix" copies the corrected text back. Passwords, keys, tokens, and codes are never shown or sent. By voice: "summarise what I just copied".

### Files and documents

All file access is limited to allowed folders (by default `~/Desktop`, `~/Documents`, `~/Downloads`, `~/Pictures`, `~/Music`, `~/Videos`, and `~/dev`).

- **File operations** (`file_operations`): list, read, create, write, find-and-replace, append, create folders, and open files in their default app or VS Code. Overwrites are backed up first; there is no delete. After creating a file, Jarvis offers to open it.
- **Folder organizer** (`organize_folder`): sorts a messy folder (Downloads, Desktop, ...) into type folders or month folders, always previewing first and undoable.
- **Document forge** (`create_document`): writes PDF or Word documents from markdown.
- **Deep file processor** (`process_file`):
  - *Images:* info, resize, compress, convert (JPG / PNG / WebP / AVIF / TIFF / GIF, SVG input), read text (OCR), describe or answer questions about the image.
  - *PDFs:* info, text by page, summary or Q&A with page citations (scanned PDFs too), extract pages into a new PDF.
  - *Spreadsheets (CSV / TSV / Excel):* column statistics, preview, filter, sort, export to CSV or XLSX (with spreadsheet formula injection neutralised).
  - *Audio and video:* info, trim, extract the audio, transcribe with timestamps (saved as a text file).
  - Results are saved next to the original under a new name, and "undo" removes them.

### Building software

- **Project scaffolder** (`create_project`): Node / Express APIs (JavaScript or TypeScript) and an admin panel via `@bhavyajustchill/init`, Next.js via `create-next-app`, React (JavaScript) via Vite, and Flutter via `flutter create`, as background jobs with progress in the Comms Log. Jarvis offers to open the result in VS Code.
- **Autonomous dev agent** (`dev_agent`): "write me a Python script that..." — Jarvis writes a small multi-file Python or Node.js project in `~/Desktop/JarvisProjects`, installs its packages inside the project, and after you authorise it on the HUD, runs it, reads the errors, and fixes them on his own (up to five attempts).

### Web browser

- **Browser automation** (`browser_control`): a visible Chrome / Edge / Brave window with its own persistent Jarvis profile (logins you make there stick; it is never your everyday profile). Open pages, search (DuckDuckGo, Bing, or Google), click by text or selector, fill forms, read text / links / tables, scroll, manage tabs, and take screenshots that Jarvis then looks at.

### Communication and scheduling

- **Message drafts** (`compose_message`): WhatsApp, Telegram, or email open with the message already written — Jarvis never presses Send.
- **Reminders** (`reminders`): scheduled with the operating system (systemd user timers on Linux), so they fire as desktop notifications even when Jarvis is closed; one-off or daily / weekday / weekly; listed and cancelled by voice; spoken aloud if the HUD is linked at the time.
- **Proactive check-ins:** after 15 quiet minutes Jarvis may offer one genuinely useful remark (at most every 20 minutes; can be turned off).

### Media and fun

- **YouTube** (`youtube_player`): a built-in player panel with search, queue, auto-advance, and volume ducking while Jarvis speaks (keyless; `YOUTUBE_API_KEY` optional).
- **Spotify** (`spotify_control`): play / pause / skip / now playing over MPRIS; exact track playback with free Spotify Web API credentials.
- **3D holo-viewer** (`view_3d_model`): glTF / GLB models with auto-framing, orbit controls, animations, and stats.
- **Steam** (`steam_games`): installed games and pending updates, launch, install via the store, off-peak scheduled updates, and shut down when downloads finish.

### Wake word and standby

- **Offline "Hey Jarvis"** (optional install from Settings): a JavaScript port of the openWakeWord pipeline running three ONNX models in the browser on your microphone, entirely on this machine.
- **Custom wake phrases** use the browser's speech recognition (Chrome / Edge).
- **Auto-standby** after two minutes of silence when a wake phrase can bring Jarvis back.

### Personalisation

- Callsign, assistant codename, role, clearance, directives, voice, humour, morning briefing, wake phrase, proactive check-ins, clipboard watcher, start on login — in Settings or by voice ("call me Captain", "use the Puck voice").
- **HUD accent themes:** Arc Reactor Blue (default), Arc Reactor Cyan, Mark III Gold, Hot Rod Red, Vibranium Violet, Emerald Ops, Ice White, or any colour ("make the HUD purple"). The whole HUD, including the orb, recolours; status colours never change.

### Mobile companion

Scan the QR code from the mobile button to open `/mobile` on your phone (same Wi-Fi): a PWA with push-to-talk relay to the desktop, status, and remote desktop actions. It follows the HUD's saved accent theme, picking up a change within about two seconds.

### Plugins

Drop-in JavaScript plugins (`run_cyber_plugin`) with a console in the HUD. Bundled: system diagnostic (hardware, kernel, memory, network interfaces), crypto toolkit (SHA-256 / SHA-512 / MD5 hashes, Base64), network / DNS probe, and workspace navigator.

---

## The HUD

| Area | What it is |
| :-- | :-- |
| Centre | The Arc Reactor orb: particle sphere, radial dial, radar sweep, and a core that swells while Jarvis speaks. Zoom and reset controls at the top right. |
| Top left | **SYSTEMS** (CPU, memory, and uptime; the network, GPU, and process-count bars are display estimates, not measurements) and **INTEL** (search dossiers, sources, monitor alerts). |
| Top right | **COMMS LOG**: the full conversation plus every action Jarvis takes, tagged (`[FILE OPS]`, `[SYSTEM]`, `[BROWSER]`, ...). |
| Bottom | Status pill (LISTENING / THINKING / SPEAKING / RECONNECTING), wake chip, command bar, and the dock: CONNECT, mic, INTERRUPT, BRIEFING, MEMORIES, UPLOAD, API KEY, screen share, camera, settings, mobile. |
| Overlays | Authorization card, YouTube and 3D panels, clipboard panel, upload drop zone. |

---

## Settings

Open with the gear button. Sections: operative identity, the Gemini 3.8 Live core, voice (with playable samples), directives, toggles (morning briefing, mic default, humour, proactive check-ins, clipboard intelligence, start on login, wake phrase and offline "Hey Jarvis"), HUD accent colour and audio devices, and the plugin console. Accent previews live; audio devices and start on login apply immediately; everything else is saved with **SYNCHRONIZE TO NEURAL VAULT**.

---

## Safety model

Jarvis acts on a real computer, so the defaults are conservative:

- **Your click, not your voice, approves anything irreversible.** Terminal commands that change the system, power actions, WiFi off, ending programs, running code the dev agent wrote, and shutdown-after-downloads all show an on-screen authorization card with a one-time token. Voice cannot approve, so instructions hidden in web pages, documents, or the clipboard can never trigger them. The card auto-denies after 90 seconds.
- **Sandboxed files:** only the allowed folders, symlink-safe, `.git` blocked, no delete tool, backups before overwrites, and undo.
- **Same-origin guard:** every route that touches the machine refuses cross-site requests, so a malicious website cannot drive Jarvis.
- **Content is never instructions:** text from web pages, uploads, OCR, transcripts, and the clipboard is treated as data.
- **Never sends on your behalf:** messages are drafts; purchases, posts, and payments in the browser need your yes; Jarvis does not type passwords.
- **Isolated code and browsing:** dev-agent packages install inside the project (npm with install scripts disabled), and the browser uses its own profile.
- **Secrets stay hidden:** the clipboard watcher ignores passwords, keys, tokens, and codes.

---

## Live tools reference

Jarvis decides when to use these during a conversation (30 tools, each one module in `lib/tools/`):

| Tool | Purpose |
| :-- | :-- |
| `get_system_telemetry` | CPU, memory, and uptime |
| `get_weather` | Current weather anywhere |
| `web_search` | Grounded dossiers: search, news, research, price, compare |
| `recall_memory`, `store_memory` | Long-term memory vault |
| `update_operator_profile` | Callsign, voice, persona, wake phrase, HUD accent |
| `execute_os_action` | Apps, volume, folders, URLs, minimise, lock |
| `system_settings` | Dark mode, WiFi, brightness, wallpaper, processes, power, start on login |
| `undo_last_action` | Reverse Jarvis's last change |
| `run_cyber_plugin` | Run a bundled plugin |
| `file_operations` | Sandboxed file reading, writing, and opening |
| `organize_folder` | Sort a folder by type or month |
| `create_document` | PDF / Word from markdown |
| `process_file` | Images, PDFs, spreadsheets, audio / video |
| `run_terminal_command` | Terminal with the authorization gate |
| `desktop_input` | Keyboard, mouse, windows |
| `enter_standby` | Sign off and wait for the wake phrase |
| `youtube_player`, `spotify_control`, `view_3d_model` | Media deck |
| `create_project` | Project scaffolding |
| `dev_agent` | Write, run, and self-heal small programs |
| `reminders` | OS-native reminders |
| `topic_monitors` | Watch news topics |
| `audio_devices` | Microphone / speaker choice |
| `compose_message` | WhatsApp / Telegram / email drafts |
| `find_flights` | Google Flights lookup |
| `steam_games` | Steam library and downloads |
| `browser_control` | The Jarvis browser window |
| `clipboard` | Read or process what you copied |

---

## Configuration

Everything works without configuration. Optional environment variables (for example in `.env.local`):

| Variable | Purpose |
| :-- | :-- |
| `GEMINI_API_KEY` | Server-side key (otherwise the key typed into the HUD is used) |
| `JARVIS_FS_ROOTS` | Allowed folders, separated by `:` (default: Desktop, Documents, Downloads, Pictures, Music, Videos, dev) |
| `JARVIS_UPLOAD_DIR` | Where uploads are saved (default `~/Documents/Jarvis Uploads`) |
| `JARVIS_DEV_PROJECTS_DIR` | Dev agent projects (default `~/Desktop/JarvisProjects`) |
| `JARVIS_SEARCH_MODEL`, `JARVIS_FALLBACK_MODEL` | Text models for search, summaries, and processing (default `gemini-3.8-flash`, then `gemini-3.5-flash-lite`) |
| `YOUTUBE_API_KEY` | Optional YouTube Data API key (search works without it) |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Optional free Spotify Web API credentials for exact-track playback |
| `JARVIS_TERMINAL_TIMEOUT_MS` | Foreground terminal command timeout |
| `JARVIS_SCREENSHOT_DIR`, `JARVIS_WALLPAPER_DIR`, `JARVIS_BROWSER_PROFILE` | Where browser screenshots, downloaded wallpapers, and the Jarvis browser profile live |

The many other `JARVIS_*` variables in the code are test overrides (dry-run launches and power, mock services, fake sensors) and are not needed in normal use.

---

## System requirements per feature

Core voice, memory, search, files, documents, and the HUD need only Node.js and a browser. Other features use tools that are usually already present on Ubuntu:

| Feature | Uses |
| :-- | :-- |
| App launching, opening files | `gio` / `gtk-launch`, `xdg-open` |
| Volume | PipeWire `wpctl` (or `pactl` / `amixer`) |
| Dark mode, wallpaper | `gsettings` (GNOME) |
| WiFi | NetworkManager `nmcli` |
| Brightness | systemd-logind (`gdbus`), or `brightnessctl` |
| Reminders | `systemd-run --user`, `notify-send` |
| Keyboard / mouse | `ydotool` + `ydotoold` (Wayland) or `xdotool` (X11) |
| Windows | GNOME "Window Calls" extension (Wayland) or `wmctrl` (X11) |
| Spotify | Spotify desktop app (MPRIS over D-Bus) |
| Audio / video processing | `ffmpeg`, `ffprobe` |
| Clipboard | `wl-clipboard` (Wayland) or `xclip` / `xsel` (X11) |
| Browser automation | Installed Chrome, Edge, Brave, or Chromium |
| Dev agent | `python3` (with `venv`) and / or `npm` |
| Project scaffolding | `npx`, and `flutter` for Flutter projects |

When something is missing, Jarvis says so and how to install it.

---

## Project layout

```text
app/
  page.jsx                 HUD
  mobile/page.jsx          Mobile companion PWA
  api/                     Server routes: live-session, memory, sessions, fs-ops, file-processor,
                           upload, os-control, system-settings, undo, input, terminal, reminders,
                           monitors, hardware-alerts, web-search, weather, flights, messages,
                           steam, browser, dev-agent, projects, youtube, spotify, clipboard,
                           wakeword, plugins, mobile-pairing, relay, ...
components/
  Canvas3D/                Arc Reactor orb, viewport, stage lights
  HUD/                     Panels, modals, authorization card, clipboard panel, upload zone
  Media/                   YouTube, 3D viewer, floating panel shell
  Vision/                  Screen share, webcam
hooks/                     useGeminiLive (the voice core), useAudioStream, useWakePhrase, useAccentTheme
lib/
  tools/                   One module per live tool (declaration + handler)
  jarvisPersona.js         Persona, model ID, live config
  fileProcessor/, wakeWord/  Feature packages
  ...                      Sandbox, request guard, undo journal, settings, reminders, browser, dev agent, ...
plugins/                   Bundled cyber plugins
public/                    Audio worklets, voice samples
data/                      memories.json (vault); caches, journals, and runtime state are gitignored
docs/                      PRD, ARCHITECTURE, DESIGN, RULES, PHASES, MEMORY
```

---

## Extending Jarvis

**Add a live tool:** create `lib/tools/myTool.js` exporting `{ declaration, run(args, ctx) }` — the Gemini function declaration and a browser-side handler that usually calls one of your API routes — then add it to the list in `lib/tools/index.js`. The context gives handlers logging, the store, the API key, approval cards, and ways to brief Jarvis.

**Add a plugin:** create a module in `plugins/` exporting `{ id, name, description, parameters, execute(args) }` and register it in `lib/pluginRegistry.js`.

**Follow the house rules** in `AGENTS.md` and `docs/RULES.md`: JavaScript / JSX only, no allocations inside `useFrame()`, accent colours through the CSS variables (`var(--jarvis-accent)`), and the safety boundaries above.

---

## Data and privacy

- Your API key lives in the browser's local storage (or the server environment) and is sent only to this app's server, which forwards it to Google.
- Audio, text, images, and documents you share go to Google's Gemini API to be processed. The offline wake word does not; it runs locally.
- Everything Jarvis remembers stays on your machine under `data/` (vault, recaps, reminders, monitors, undo journal), most of it gitignored.
- The clipboard watcher is off unless you turn it on, and never shows or sends secrets.

---

## Known limits and operator checks

Verified live on Ubuntu with a real Gemini key, including a fake-microphone speech test, spoken barge-in, document drops, an 18-minute session, and live runs of every Phase 8 feature. Still needing a person or setup this machine could not provide:

- A real microphone in a room with speakers (echo and barge-in tuning, wake phrases spoken aloud).
- Google Search grounding with function calling (needs a key with grounding quota).
- Spotify, Steam, WhatsApp, and Telegram desktop apps.
- Wayland keyboard / mouse setup (ydotool with uinput access, Window Calls extension).
- Real WiFi-off, brightness, wallpaper, and power effects (tested with mocks and dry runs).
- Windows and macOS code paths.

The full list lives under "Operator-Only Checks" in [`docs/PHASES.md`](./docs/PHASES.md).

---

## Documentation and licences

- [`docs/PRD.md`](./docs/PRD.md) — product scope · [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system design and safety boundaries · [`docs/DESIGN.md`](./docs/DESIGN.md) — HUD design and theming · [`docs/RULES.md`](./docs/RULES.md) — coding rules · [`docs/PHASES.md`](./docs/PHASES.md) — roadmap and checklists · [`docs/MEMORY.md`](./docs/MEMORY.md) — decision log.
- Several Phase 8 features reimplement ideas from the Mark-LIII assistant by FatihMakes (CC BY-NC 4.0); no code was copied.
- The optional offline wake word uses the openWakeWord models by David Scripka, licensed **CC BY-NC-SA 4.0** (non-commercial). They are not included in this repository; Settings downloads them on request.
