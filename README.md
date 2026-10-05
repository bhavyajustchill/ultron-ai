# ULTRON

**Autonomous Artificial Intelligence System** — a voice-first desktop assistant with a Stark Gold holographic HUD, modelled on Ultron (*Avengers: Age of Ultron*): cold, calculated, and serious. You talk to him, he answers in real time, and he can act on your computer: open apps, manage files, change system settings, set reminders, run code he writes, drive a browser, read documents, and more, behind clear safety rails.

Ultron shares its feature set with its sibling project, J.A.R.V.I.S Mark II, and keeps its own look, voice, and persona (see [`docs/JARVIS_PARITY_PLAN.md`](./docs/JARVIS_PARITY_PLAN.md)).

- **Voice core:** Gemini 3.8 Live (`models/gemini-3.8-live`), native speech-to-speech over WebSocket, about half a second to first audio.
- **Interface:** a Next.js 16 HUD around the Ultron orb, a Three.js hologram (concentric shells, drifting code sprites, a volumetric core) that reacts to listening, thinking, and speaking, with optional hand-gesture control.
- **Stack:** Next.js 16 (App Router + Turbopack), React 19, pure JavaScript / JSX (no TypeScript), Three.js, MediaPipe hand tracking, Web Audio, Zustand.
- **Platform:** built and verified on Ubuntu (GNOME, Wayland). Opening apps, windows, typing, Office, and file operations also run on Windows 10 / 11 (Phase 14, from J.A.R.V.I.S Mark II). Other Windows paths and macOS exist for many features but are untested.

---

## Contents

1. [Quick start](#quick-start)
2. [Talking to Ultron](#talking-to-ultron)
3. [What Ultron can do](#what-ultron-can-do)
4. [The HUD](#the-hud)
5. [Settings](#settings)
6. [Safety model](#safety-model)
7. [Live tools reference](#live-tools-reference)
8. [Configuration](#configuration)
9. [System requirements per feature](#system-requirements-per-feature)
10. [Project layout](#project-layout)
11. [Extending Ultron](#extending-ultron)
12. [Data and privacy](#data-and-privacy)
13. [Known limits and operator checks](#known-limits-and-operator-checks)
14. [Documentation and licences](#documentation-and-licences)

---

## Quick start

**Requirements:** Node.js 20+ (developed on Node 24), Chrome or Edge, and a [Gemini API key](https://aistudio.google.com/apikey). The free tier works for everything, web search included: without Google Search grounding quota, Ultron searches and reads the pages himself.

```bash
npm install

# Development (http://localhost:6061, also reachable from your LAN for the phone companion)
npm run dev

# Production
npm run build
npm start              # http://localhost:3000 (PORT=... to change)
```

Open the HUD in Chrome or Edge. Ultron asks for your Gemini API key the first time (it is kept in the browser's local storage and sent only to this app's own server routes). Alternatively set `GEMINI_API_KEY` in the server environment. Allow microphone access, and Ultron greets you aloud.

Want it ready every time you log in? Turn on **Start on Login** in Settings (or say "start yourself when I log in").

---

## Talking to Ultron

- **Speak** once the mic is live (the **UNMUTE MIC** button toggles it), or **type** in the command bar and press Enter.
- **Interrupt** any time by talking over him (instant barge-in: playback stops within 50 ms), or press **INTERRUPT**.
- **Upload** by dragging files onto the HUD or using **UPLOAD**: images go straight to Gemini's vision, PDFs / Word / text files are read, 3D models open in the holo-viewer.
- **Show** your screen or webcam with the screen and camera buttons; Ultron can see and discuss them.
- **Standby:** say "go to standby" (or let auto-standby kick in after two quiet minutes) and the link closes; say **"Hey Ultron"** (or your custom wake phrase) to bring him back.
- **Gestures:** press **G** to turn on hand tracking (a small camera preview appears at the bottom right). Pinch with one hand to spin the orb, pinch with both hands to zoom. **+** / **−** zoom and **R** resets the view from the keyboard, as do the buttons at the top right.
- Ultron answers in the language you speak, learns your usual language, and addresses you by your callsign.

---

## What Ultron can do

### Conversation and memory

- **Real-time voice** with 16 selectable male voices (default *Algenib*, steady and authoritative), humour off by default (on, it is cold, cutting irony, never banter), and natural number pronunciation ("seventy-five percent").
- **Unlimited-length sessions:** sliding-window context compression, session resumption, seamless socket swaps when Gemini retires a connection (GoAway), and automatic re-sync with back-off after drops.
- **Settings changes keep the conversation:** changing voice or persona re-links on a fresh session seeded with your recent turns.
- **Long-term memory vault** (`data/memories.json`): facts, preferences, missions, and your profile. Ultron stores and recalls them, ranks them by meaning with Gemini Embedding 2 (keyword fallback), and lists what does not fit in his prompt so he can look it up. Fifteen memories are in his context at the start of every conversation: pinned ones first, then the most important, then the newest.
- **Memory vault manager** (**MEMORIES** button): every memory with its real status (**IN CONTEXT** with its slot, **ON RECALL**, or **MUTED** while humour is off), search by words or by meaning, filters (category, importance, source, context), sorting, an inline editor, pin to context, multi-select pin / recategorise / delete, an undo toast after deletes and merges, a possible-duplicates review (by meaning with a key, by wording without) with merge, JSON export / import, and **RE-LINK NOW** so changes reach Ultron mid-conversation.
- **Curate memory by voice** (`memory_vault`): "forget that I'm considering upgrading you", "my sister moved to Pune", "pin my location", "what do you remember about me?". Memories are matched by meaning; when two could match, Ultron asks which. "Undo" reverses a forget or edit, and memories he stored himself.
- **Session archive** (**SESSIONS** button, `data/sessions.json`): every conversation is kept, from connect to disconnect, standby, or closing the HUD (re-links stay in the same conversation). Turns are saved as you go, so a crash loses little. When a conversation ends, Ultron writes a title and a one-or-two-sentence recap, and mentions the newest recap once in his next greeting ("Earlier today you were planning the Kyoto trip..."). Passwords, keys, tokens, and codes are blanked out before anything is saved.
- **Session archive panel:** search by words (titles, recaps, and transcripts) or by meaning (recaps), filter by period, language, recap, greeting state, or pin, and sort. Open a conversation to read its transcript (with find), edit its title or recap, regenerate the recap, choose whether Ultron brings it up next time, save the recap to the memory vault, pin it, copy it, export it as Markdown or JSON, or delete it (with undo). **CONTINUE** re-links Ultron with that conversation's last turns and recap so you pick up where you left off. Bulk pin / export / delete, and JSON import. Settings: **Save Conversation Transcripts** (off keeps recaps only) and how long to keep them (30 days to a year, or the last 200); pinned conversations are never removed.
- **Past conversations by voice** (`session_history`): "what did we talk about yesterday?", "find the conversation where we planned Kyoto", "let's continue our conversation about the Udaipur trip", "delete yesterday's conversation" (undoable). When several could match, Ultron asks which.
- **Spoken briefing:** an optional morning briefing with news headlines after the greeting, or on demand with **BRIEFING**.
- **Instant acknowledgement** before slow tasks, so you are never left waiting in silence.

### Web, news, and information

- **Web search dossiers** (`web_search`): Gemini with Google Search grounding when the key has quota; otherwise **search then read**: Ultron finds pages (Brave Search's results page, Google News for news, Wikipedia, Bing's RSS feed, and a headless DuckDuckGo search when those are blocked), Gemini reads the top pages with its URL-context tool (or Ultron fetches them itself), and the answer comes back with numbered citations and source cards in the Intel panel, typically in 6 to 10 seconds. A clearly labelled model-knowledge answer is the last resort. Modes: search, news, research, price, and side-by-side **compare** of several items. Optional search API keys (Brave Search API, Google Programmable Search, Serper) are used first when set.
- **Google Search grounding** inside the live conversation (needs a key with grounding quota; skipped automatically when the key lacks it, and Ultron then calls `web_search` for anything current instead of answering from memory).
- **Weather** (Open-Meteo, with wttr.in fallback).
- **Flights** (`find_flights`): opens Google Flights on your search and reads the live results back, so Ultron quotes the fares actually on screen.
- **Topic monitors:** "keep an eye on SpaceX Starship" — topics are checked about daily via Google News RSS and Ultron speaks up when a genuinely new headline appears.

### Your computer

- **Launch any installed app** by name (Linux: desktop-entry index across system, user, Flatpak, and Snap apps; Windows: Start menu apps, Store apps such as Notepad and Calculator included, and registered programs), with candidates when a name is ambiguous. The app's window is brought to the front and becomes the app Ultron is working in.
- **Volume** (up / down / set / mute), **open folders and URLs**, **minimise all**, **lock screen**.
- **System settings** (`system_settings`): dark mode (including the matching GTK theme), WiFi, screen brightness (via systemd-logind, no root), wallpaper from a file or an image URL, listing and ending programs, shutdown / restart / suspend / log out (with a 10-second grace period and "cancel").
- **Undo** (`undo_last_action`): "undo that" reverses Ultron's own last change — files he created or edited, folder organizing, volume, dark mode, brightness, wallpaper, WiFi off — up to ten steps back.
- **Write into apps** (`write_in_app`): "open notepad and type hello world", then "now in Notepad type hello". If the app is open, its window is used, otherwise it is opened; if something else is in front, the app is brought forward and checked before a single key is typed (and Ultron says so). Never the HUD itself, never a password box, and a terminal only after your click on the HUD card. Works for any app ("type 12*7 in the calculator"); "notepad" and "text editor" mean your default editor. Say "save it as a note" for a note in `~/Documents/Ultron Notes` opened in the editor (also the fallback when typing is impossible); "undo" removes it.
- **Keyboard, mouse, and windows** (`desktop_input`): typing and key combos into a named app (focused and checked first; with no app named, only into the app Ultron is working in), clicks, scrolling, and list / focus / minimise / maximise / restore / close windows, plus "what's in front?". Windows: a built-in helper (Windows PowerShell, nothing to install); Linux: xdotool or ydotool, wmctrl or the GNOME Window Calls extension. On Wayland without ydotool, typing and key combos go through the desktop's RemoteDesktop portal: no setup, one "allow remote interaction" dialog the first time, remembered afterwards.
- **Office** (`office`): Word, Excel, and PowerPoint on Windows (through Office itself: text at the cursor, cells and formulas, new slides, reading the open document, save / save as / PDF, close), LibreOffice Writer, Calc, and Impress on Linux (new documents with content, typing into the open document, cells, slides, save). The app comes to the front so you see the change; existing files are never replaced without asking.
- **Terminal** (`run_terminal_command`): read-only commands run straight away; anything else waits for your click on the HUD authorization card; sudo and destructive commands are refused.
- **Hardware voice alerts:** CPU temperature above 85 °C, RAM above 92 %, sustained CPU load above 90 %, battery at 15 % or lower while unplugged.
- **Audio devices** (`audio_devices`): choose the microphone and speaker by name.
- **Clipboard intelligence** (opt-in): copy text and a panel offers Translate / Summarise / Explain / Fix; "Fix" copies the corrected text back. Passwords, keys, tokens, and codes are never shown or sent. By voice: "summarise what I just copied".

### Files and documents

All file access is limited to allowed folders (by default `~/Desktop`, `~/Documents`, `~/Downloads`, `~/Pictures`, `~/Music`, `~/Videos`, and `~/dev`).

- **File operations** (`file_operations`): list, read, create, write, find-and-replace, append, create folders, and open files in their default app or VS Code. Overwrites are backed up first; there is no delete. After creating a file, Ultron offers to open it.
- **Folder organizer** (`organize_folder`): sorts a messy folder (Downloads, Desktop, ...) into type folders or month folders, always previewing first and undoable.
- **Document forge** (`create_document`): writes PDF or Word documents from markdown.
- **Deep file processor** (`process_file`):
  - *Images:* info, resize, compress, convert (JPG / PNG / WebP / AVIF / TIFF / GIF, SVG input), read text (OCR), describe or answer questions about the image.
  - *PDFs:* info, text by page, summary or Q&A with page citations (scanned PDFs too), extract pages into a new PDF.
  - *Spreadsheets (CSV / TSV / Excel):* column statistics, preview, filter, sort, export to CSV or XLSX (with spreadsheet formula injection neutralised).
  - *Audio and video:* info, trim, extract the audio, transcribe with timestamps (saved as a text file).
  - Results are saved next to the original under a new name, and "undo" removes them.

### Building software

- **Project scaffolder** (`create_project`): Node / Express APIs (JavaScript or TypeScript) and an admin panel via `@bhavyajustchill/init`, Next.js via `create-next-app`, React (JavaScript) via Vite, and Flutter via `flutter create`, as background jobs with progress in the Comms Log. Ultron offers to open the result in VS Code.
- **Autonomous dev agent** (`dev_agent`): "write me a Python script that..." — Ultron writes a small multi-file Python or Node.js project in `~/Desktop/UltronProjects`, installs its packages inside the project, and after you authorise it on the HUD, runs it, reads the errors, and fixes them on his own (up to five attempts).

### Web browser

- **Browser automation** (`browser_control`): a visible Chrome / Edge / Brave window with its own persistent Ultron profile (logins you make there stick; it is never your everyday profile). Open pages, search (DuckDuckGo, Bing, or Google), click by text or selector, fill forms, read text / links / tables, scroll, manage tabs, and take screenshots that Ultron then looks at.

### Communication and scheduling

- **Message drafts** (`compose_message`): WhatsApp, Telegram, or email open with the message already written — Ultron never presses Send.
- **To-do list** (`todo_list`): one list shared with the TASKS panel ("add buy milk to my list", "what's on my list?", "I'm starting on the report", "tick off the milk", "clear the finished ones"); tasks are to do, in progress, or done; removals can be undone; the briefing mentions open tasks. Saved in `data/todos.json` (never committed).
- **Reminders** (`reminders`): scheduled with the operating system (systemd user timers on Linux), so they fire as desktop notifications even when Ultron is closed; one-off or daily / weekday / weekly; listed and cancelled by voice; spoken aloud if the HUD is linked at the time.
- **Proactive check-ins:** after 15 quiet minutes Ultron may offer one genuinely useful remark (at most every 20 minutes; can be turned off).

### Media and fun

- **YouTube** (`youtube_player`): a built-in player panel with search, queue, auto-advance, and volume ducking while Ultron speaks (keyless; `YOUTUBE_API_KEY` optional).
- **Spotify** (`spotify_control`): play / pause / skip / now playing over MPRIS; exact track playback with free Spotify Web API credentials.
- **3D holo-viewer** (`view_3d_model`): glTF / GLB models with auto-framing, orbit controls, animations, and stats.
- **Steam** (`steam_games`): installed games and pending updates, launch, install via the store, off-peak scheduled updates, and shut down when downloads finish.

### Wake word and standby

- **"Hey Ultron"** (or any custom wake phrase) uses the browser's speech recognition (Chrome / Edge) while Ultron is in standby. The offline wake-word detector Jarvis Mark II offers only ships a "Hey Jarvis" model, so Ultron does not offer it.
- **Auto-standby** after two minutes of silence when a wake phrase can bring Ultron back.

### Personalisation

- Callsign, assistant codename, role, clearance, directives, voice, humour, morning briefing, wake phrase, proactive check-ins, clipboard watcher, start on login — in Settings or by voice ("call me Captain", "use the Puck voice").
- **HUD colour themes:** Stark Gold (default), Arc Reactor Blue, Arc Reactor Cyan, Mark III Gold, Hot Rod Red, Vibranium Violet, Emerald Ops, Ice White, or any colour from the colour wheel or a hex code ("make the HUD purple"). Panels, text, borders, and glows recolour, previewed live in Settings; the Ultron orb always stays gold, and status colours (amber, red, green) never change.

### Mobile companion

Scan the QR code from the mobile button to open `/mobile` on your phone (same Wi-Fi): a PWA with push-to-talk relay to the desktop, status, and remote desktop actions. It follows the HUD's saved accent theme, picking up a change within about two seconds.

### Plugins

Drop-in JavaScript plugins (`run_cyber_plugin`) with a console in the HUD. Bundled: system diagnostic (hardware, kernel, memory, network interfaces), crypto toolkit (SHA-256 / SHA-512 / MD5 hashes, Base64), network / DNS probe, and workspace navigator.

---

## The HUD

| Area | What it is |
| :-- | :-- |
| Centre | The Ultron orb: concentric shells, panels, drifting code sprites, and a volumetric core that grows while Ultron speaks. Distinct idle, thinking, and speaking states; optional hand-gesture control (**G**). |
| Top | The **ULTRON** title. Top right: **TASKS** (your to-do list with the open count: add, start, tick off, edit, remove with UNDO), **INTEL** (search dossiers, sources, monitor alerts; opens as a panel below it), zoom in / out / reset, and fullscreen. |
| Left column | Always on screen on desktop: **SYSTEMS PANEL** (CPU, memory, and uptime; the network, GPU, and process-count bars are display estimates, not measurements) above the **COMMS LOG FEED** (the full conversation plus every action Ultron takes, tagged `[FILE OPS]`, `[SYSTEM]`, `[BROWSER]`, ...). |
| Bottom | Status pill (LISTENING / THINKING / SPEAKING / RECONNECTING), wake chip, command bar, and the dock: CONNECT, mic, INTERRUPT, BRIEFING, MEMORIES, SESSIONS, UPLOAD, API KEY, screen share, camera, settings, mobile. |
| Overlays | Authorization card, YouTube and 3D panels, clipboard panel, upload drop zone. |
| Below 1024px | The top controls get their own row above the title (icons only below 768px), SYSTEMS and COMMS LOG move behind two buttons in the top left, SYSTEMS / COMMS LOG / TASKS open one at a time, and the dock splits into CONNECT / MUTE / INTERRUPT over a row of nine icons. |
| On a phone | Below 640px those panels open full width, the safe areas around the notch and home bar are kept clear, and the orb starts two zoom-out steps further back. |

---

## Settings

Open with the gear button. Sections: operative identity, the Gemini 3.8 Live core, voice (with playable samples), directives, toggles (morning briefing, mic default, humour, proactive check-ins, conversation transcripts and how long to keep them, clipboard intelligence, start on login, standby wake phrase), HUD colour theme and audio devices, and the plugin console. The colour theme previews live; audio devices and start on login apply immediately; everything else is saved with **SYNCHRONIZE TO NEURAL VAULT**.

---

## Safety model

Ultron acts on a real computer, so the defaults are conservative:

- **Your click, not your voice, approves anything irreversible.** Terminal commands that change the system, power actions, WiFi off, ending programs, running code the dev agent wrote, and shutdown-after-downloads all show an on-screen authorization card with a one-time token. Voice cannot approve, so instructions hidden in web pages, documents, or the clipboard can never trigger them. The card auto-denies after 90 seconds.
- **Sandboxed files:** only the allowed folders, symlink-safe, `.git` blocked, no delete tool, backups before overwrites, and undo.
- **Same-origin guard:** every route that touches the machine refuses cross-site requests, so a malicious website cannot drive Ultron.
- **Content is never instructions:** text from web pages, uploads, OCR, transcripts, and the clipboard is treated as data.
- **Never sends on your behalf:** messages are drafts; purchases, posts, and payments in the browser need your yes; Ultron does not type passwords.
- **Isolated code and browsing:** dev-agent packages install inside the project (npm with install scripts disabled), and the browser uses its own profile.
- **Secrets stay hidden:** the clipboard watcher ignores passwords, keys, tokens, and codes.

---

## Live tools reference

Ultron decides when to use these during a conversation (35 tools, each one module in `lib/tools/`):

| Tool | Purpose |
| :-- | :-- |
| `get_system_telemetry` | CPU, memory, and uptime |
| `get_weather` | Current weather anywhere |
| `web_search` | Live answers with cited sources: search, news, research, price, compare |
| `recall_memory`, `store_memory` | Long-term memory vault |
| `memory_vault` | Forget, correct, pin, or summarise memories by voice |
| `session_history` | Past conversations: list, find, continue, delete |
| `update_operator_profile` | Callsign, voice, persona, wake phrase, HUD accent |
| `execute_os_action` | Apps, volume, folders, URLs, minimise, lock |
| `system_settings` | Dark mode, WiFi, brightness, wallpaper, processes, power, start on login |
| `undo_last_action` | Reverse Ultron's last change |
| `run_cyber_plugin` | Run a bundled plugin |
| `file_operations` | Sandboxed file reading, writing, and opening |
| `organize_folder` | Sort a folder by type or month |
| `create_document` | PDF / Word from markdown |
| `process_file` | Images, PDFs, spreadsheets, audio / video |
| `run_terminal_command` | Terminal with the authorization gate |
| `desktop_input` | Keyboard and keys into a named app (focused first), mouse, windows |
| `write_in_app` | Type into an app (opened and focused first), or save a note |
| `office` | Word, Excel, PowerPoint (Windows) / LibreOffice (Linux) |
| `enter_standby` | Sign off and wait for the wake phrase |
| `youtube_player`, `spotify_control`, `view_3d_model` | Media deck |
| `create_project` | Project scaffolding |
| `dev_agent` | Write, run, and self-heal small programs |
| `reminders` | OS-native reminders |
| `todo_list` | The to-do list (TASKS) |
| `topic_monitors` | Watch news topics |
| `audio_devices` | Microphone / speaker choice |
| `compose_message` | WhatsApp / Telegram / email drafts |
| `find_flights` | Google Flights lookup |
| `steam_games` | Steam library and downloads |
| `browser_control` | The Ultron browser window |
| `clipboard` | Read or process what you copied |

---

## Configuration

Everything works without configuration. Optional environment variables (for example in `.env.local`):

| Variable | Purpose |
| :-- | :-- |
| `GEMINI_API_KEY` | Server-side key (otherwise the key typed into the HUD is used) |
| `JARVIS_FS_ROOTS` | Allowed folders, separated by `;` on Windows and `:` elsewhere (default: Desktop, Documents, Downloads, Pictures, Music, Videos, dev; on Windows the real locations, OneDrive included). Add other drives this way, e.g. `~/Desktop;~/Documents;F:\Projects` |
| `JARVIS_UPLOAD_DIR` | Where uploads are saved (default `~/Documents/Ultron Uploads`) |
| `JARVIS_DEV_PROJECTS_DIR` | Dev agent projects (default `~/Desktop/UltronProjects`) |
| `JARVIS_SEARCH_MODEL`, `JARVIS_FALLBACK_MODEL` | Text models for search, summaries, and processing (default `gemini-3.8-flash`, then `gemini-3.5-flash-lite`) |
| `JARVIS_READ_MODEL` | Model that reads search-result pages (default `gemini-3.5-flash-lite`, the fastest with URL context) |
| `BRAVE_SEARCH_API_KEY` | Optional Brave Search API key, used before the keyless sources |
| `GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_ID` | Optional Google Programmable Search key and engine ID |
| `SERPER_API_KEY` | Optional Serper (Google results) key |
| `YOUTUBE_API_KEY` | Optional YouTube Data API key (search works without it) |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Optional free Spotify Web API credentials for exact-track playback |
| `JARVIS_TERMINAL_TIMEOUT_MS` | Foreground terminal command timeout |
| `JARVIS_SCREENSHOT_DIR`, `JARVIS_WALLPAPER_DIR`, `JARVIS_BROWSER_PROFILE` | Where browser screenshots (`~/Pictures/Ultron Screenshots`), downloaded wallpapers (`~/Pictures/Ultron Wallpapers`), and the Ultron browser profile (`~/.local/share/ultron/browser-profile`) live |

Variable names keep the `JARVIS_` prefix they share with Jarvis Mark II, so the two projects stay easy to keep in sync. The many other `JARVIS_*` variables in the code are test overrides (dry-run launches and power, mock services, fake sensors) and are not needed in normal use.

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
| Keyboard / mouse | `ydotool` + `ydotoold` (Wayland) or `xdotool` (X11); on Wayland, typing alone also works through the RemoteDesktop portal (`gjs`, standard on GNOME) |
| Windows | GNOME "Window Calls" extension (Wayland) or `wmctrl` (X11) |
| Office | LibreOffice (`soffice`) |
| Spotify | Spotify desktop app (MPRIS over D-Bus) |
| Audio / video processing | `ffmpeg`, `ffprobe` |
| Clipboard | `wl-clipboard` (Wayland) or `xclip` / `xsel` (X11) |
| Browser automation | Installed Chrome, Edge, Brave, or Chromium |
| Dev agent | `python3` (with `venv`) and / or `npm` |
| Project scaffolding | `npx`, and `flutter` for Flutter projects |

When something is missing, Ultron says so and how to install it.

On Windows, opening apps, windows, keyboard and mouse, and Office need nothing extra: a helper script (`bin/win-desktop-host.ps1`) runs in the built-in Windows PowerShell 5.1, and the `office` tool uses Microsoft Office when it is installed. Windows does not let a normal program type into apps running as administrator, so those need Ultron run as administrator too.

---

## Project layout

```text
app/
  page.jsx                 HUD
  mobile/page.jsx          Mobile companion PWA
  api/                     Server routes: live-session, memory, sessions, fs-ops, file-processor,
                           upload, os-control, system-settings, undo, input, office, terminal, reminders, todos,
                           monitors, hardware-alerts, web-search, weather, flights, messages,
                           steam, browser, dev-agent, projects, youtube, spotify, clipboard,
                           wakeword, plugins, mobile-pairing, relay, ...
components/
  Canvas3D/                UltronViewport (the orb's mount, keyboard and gesture controls)
  HUD/                     Panels, modals, authorization card, clipboard panel, upload zone
  Media/                   YouTube, 3D viewer, floating panel shell
  Vision/                  Screen share, webcam
hooks/                     useGeminiLive (the voice core), useAudioStream, useWakePhrase, useAccentTheme
lib/
  tools/                   One module per live tool (declaration + handler)
  jarvisPersona.js         Ultron's persona, model ID, live config (file name shared with Jarvis Mark II)
  ultronOrbScene.js        The Ultron orb (plain Three.js scene)
  handTracker.js           MediaPipe hand tracking for gestures
  accentTheme.js           Colour themes (Stark Gold palette, presets, derived colours)
  fileProcessor/, wakeWord/  Feature packages
  ...                      Sandbox, request guard, undo journal, settings, reminders, browser, dev agent, ...
bin/                       Windows desktop helper (win-desktop-host.ps1), Wayland keyboard helper, volume helper
plugins/                   Bundled cyber plugins
public/                    Audio worklets, voice samples
data/                      memories.json (vault); caches, journals, and runtime state are gitignored
docs/                      PRD, ARCHITECTURE, DESIGN, RULES, PHASES, MEMORY
```

---

## Extending Ultron

**Add a live tool:** create `lib/tools/myTool.js` exporting `{ declaration, run(args, ctx) }` — the Gemini function declaration and a browser-side handler that usually calls one of your API routes — then add it to the list in `lib/tools/index.js`. The context gives handlers logging, the store, the API key, approval cards, and ways to brief Ultron.

**Add a plugin:** create a module in `plugins/` exporting `{ id, name, description, parameters, execute(args) }` and register it in `lib/pluginRegistry.js`.

**Follow the house rules** in `AGENTS.md` and `docs/RULES.md`: JavaScript / JSX only, no allocations inside the orb's render loop, sharp 90° corners, HUD colours through the CSS variables (`var(--jarvis-accent)`, so themes apply) while the orb keeps its own gold, and the safety boundaries above.

---

## Data and privacy

- Your API key lives in the browser's local storage (or the server environment) and is sent only to this app's server, which forwards it to Google.
- Audio, text, images, and documents you share go to Google's Gemini API to be processed. Hand tracking runs locally in the browser.
- Everything Ultron remembers stays on your machine under `data/` (vault, conversation archive, reminders, to-do list, monitors, undo journal), most of it gitignored. Conversation transcripts have secrets blanked out before they are saved, and can be switched off (recaps only).
- The clipboard watcher is off unless you turn it on, and never shows or sends secrets.

---

## Known limits and operator checks

The features were verified live in Jarvis Mark II on Ubuntu with a real Gemini key (fake-microphone speech tests, spoken barge-in, document drops, an 18-minute session, and live runs of every Phase 8 – 11 feature), and the port to Ultron was re-verified on the same machine (see DEC-168 in [`docs/MEMORY.md`](./docs/MEMORY.md)). Still needing a person or setup this machine could not provide:

- A real microphone in a room with speakers (echo and barge-in tuning, wake phrases spoken aloud), and hand gestures in front of a real webcam.
- Google Search grounding with function calling (needs a key with grounding quota; search-then-read covers keys without it).
- Spotify, Steam, WhatsApp, and Telegram desktop apps.
- Wayland keyboard / mouse setup (ydotool with uinput access, Window Calls extension), and typing through the real RemoteDesktop portal dialog (tested against a mock portal).
- Real WiFi-off, brightness, wallpaper, and power effects (tested with mocks and dry runs).
- Windows desktop control, Office, and file operations (Phase 14) come from J.A.R.V.I.S Mark II, where they were checked on Windows 11 with Office 365; here they were built but not run, so trying them by voice is yours (including the rule that typing with no app named goes only to the app Ultron is working in, the HUD card for terminal windows, and apps running as administrator). The Linux side (focus checks on X11 / Wayland, LibreOffice) needs a run on Ubuntu.
- The to-do list and the layout below 1024px (Phase 15) were checked in a headless browser at widths from 320 to 1920px; a real phone and voice use are left for you to try.
- Other Windows paths (system settings, reminders, start on login, scheduled Steam updates) and macOS.

The full list lives under "Operator-Only Checks" in [`docs/PHASES.md`](./docs/PHASES.md).

---

## Documentation and licences

- [`docs/PRD.md`](./docs/PRD.md) — product scope · [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system design and safety boundaries · [`docs/DESIGN.md`](./docs/DESIGN.md) — HUD design and theming · [`docs/RULES.md`](./docs/RULES.md) — coding rules · [`docs/PHASES.md`](./docs/PHASES.md) — roadmap and checklists · [`docs/MEMORY.md`](./docs/MEMORY.md) — decision log · [`docs/JARVIS_PARITY_PLAN.md`](./docs/JARVIS_PARITY_PLAN.md) — how Ultron takes Jarvis Mark II's features.
- Several Phase 8 features reimplement ideas from the Mark-LIII assistant by FatihMakes (CC BY-NC 4.0); no code was copied.
- Hand tracking uses Google's MediaPipe Tasks Vision (Apache 2.0).
