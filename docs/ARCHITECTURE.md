# ⚡ SYSTEM ARCHITECTURE — J.A.R.V.I.S MARK II

**Codename:** Mark II // Architecture Blueprint  
**Stack:** Next.js 16 (App Router, Turbopack) + React 19 + React Three Fiber (Three.js) + JavaScript (JSX) + Web Audio API + Gemini 3.8 Live WebSocket  
**Visual Core:** Arc Reactor Orb (`components/Canvas3D/ArcReactorOrb.jsx`)

---

## 1. High-Level Architecture

The system has four layers:

1. **Client Holographic Surface (browser):** the Arc Reactor Orb (R3F), the tactical HUD, Web Audio mic ingestion (`AudioWorkletNode` → 16 kHz PCM), 24 kHz gapless playback (`lib/pcmPlayer.js`), the wake-phrase listener, uploads, media panels, and the terminal authorization card.
2. **Live Session Orchestrator (`hooks/useGeminiLive.js`):** opens the Gemini Live WebSocket directly from the browser, sends the setup frame (persona, memories, tools, compression, resumption handle), streams audio / video / client content, executes tool calls against the local API routes, and handles barge-in, GoAway swaps, auto re-sync, background job notices, and standby.
3. **Next.js API Layer (`app/api/*`):** builds the session configuration and bridges every host capability. Routes that touch the machine reject cross-site requests (`lib/requestGuard.js`); file access is confined to sandbox roots (`lib/fsSandbox.js`).
4. **Host Integrations:** the desktop session (`.desktop` app index, `xdg-open`, MPRIS / D-Bus, xdotool / ydotool, wmctrl / GNOME Window Calls), the filesystem, project generators, `bash`, and Google APIs (Gemini embeddings, grounded search).

```mermaid
flowchart TB
    subgraph Browser ["🖥️ Browser (Next.js 16 client, pure JSX)"]
        HUD["Tactical HUD + Arc Reactor Orb"]
        Live["useGeminiLive.js (session + tool executor)"]
        Mic["AudioWorklet 16 kHz PCM"] --> Live
        Live --> Player["pcmPlayer.js 24 kHz playback"]
        Wake["useWakePhrase.js (standby)"] --> Live
        Gate["CommandConfirmModal (operator click)"]
    end

    subgraph Server ["⚙️ Next.js API routes"]
        Session["/api/live-session"]
        Files["/api/fs-ops · /api/upload · /api/model-file"]
        Desktop["/api/os-control · /api/input · /api/terminal · /api/system-settings · /api/undo · /api/reminders"]
        Intel["/api/web-search · /api/weather · /api/memory · /api/sessions · /api/monitors · /api/hardware-alerts"]
        Media["/api/youtube · /api/spotify"]
        Projects["/api/projects"]
        Misc["/api/system-telemetry · /api/plugins · /api/mobile-pairing · /api/relay"]
    end

    subgraph External ["🧠 External & Host"]
        Gemini["Gemini 3.8 Live (WSS)"]
        GoogleAPIs["Gemini embeddings + grounded search"]
        Host["Desktop session · filesystem · bash · generators"]
    end

    Live <--> Gemini
    Live --> Session
    Live --> Files & Desktop & Intel & Media & Projects & Misc
    Gate --> Desktop
    Intel --> GoogleAPIs
    Files & Desktop & Media & Projects --> Host
```

---

## 2. Live Session Lifecycle

1. **Configure:** `POST /api/live-session` returns the WebSocket URL (`v1beta`), model (`GEMINI_LIVE_MODEL` in `lib/jarvisPersona.js`), voice, the dynamic system instruction (persona + operator profile + memories + allowed folders + wake phrase), and all tool declarations (every function `BLOCKING`, plus `googleSearch`).
2. **Setup:** the browser sends the setup frame with `contextWindowCompression` and, when resuming, `sessionResumption.handle`.
3. **Converse:** mic audio streams as `realtimeInput.audio`; screen / webcam frames as `realtimeInput.video`; typed text, uploads, and system notices as `clientContent` turns.
4. **Tools:** each `toolCall` is executed by the hook against the API routes; responses echo `id` + `name`; cancelled ids are dropped.
5. **Resilience:** `sessionResumptionUpdate` handles are tracked; `goAway` triggers a socket swap at the next idle turn; unexpected closes re-sync with exponential backoff (5 attempts); a refused setup that included Google Search retries once without it.
6. **Standby:** `enter_standby` closes the link after the farewell plays; the wake-phrase listener re-arms after 1.5 s offline.

---

## 3. Directory Structure

```text
jarvis-mark-ii/
├── app/
│   ├── layout.jsx / page.jsx / globals.css / manifest.js
│   ├── mobile/page.jsx                     # Mobile companion PWA
│   └── api/
│       ├── live-session/                   # Session config, persona, tools
│       ├── memory/                         # Vault CRUD + semantic recall
│       ├── sessions/                       # Conversation recaps (save / pop once)
│       ├── monitors/ hardware-alerts/      # Topic monitors, hardware voice alerts
│       ├── fs-ops/                         # Sandboxed file ops, organizer, documents, open
│       ├── upload/                         # Upload ingest + text extraction
│       ├── model-file/[...segments]/       # Sandboxed 3D model serving
│       ├── os-control/                     # Apps, volume, folders, URLs, lock
│       ├── input/                          # Keyboard, mouse, windows
│       ├── terminal/                       # Prepare / run / cancel commands
│       ├── system-settings/                # Dark mode, WiFi, brightness, wallpaper, processes, power
│       ├── undo/                           # Reverse Jarvis's last action
│       ├── reminders/                      # OS-native reminders + due announcements
│       ├── projects/                       # Background project scaffolding jobs
│       ├── web-search/ weather/            # Grounded search, weather
│       ├── youtube/ spotify/               # Media deck
│       ├── system-telemetry/ plugins/      # Host metrics, plugin runner
│       └── mobile-pairing/ relay/          # Mobile PWA bridge
├── components/
│   ├── Canvas3D/                           # JarvisViewport, ArcReactorOrb, CyberStage, PostFX
│   ├── HUD/                                # Panels, modals, upload zone, authorization card
│   ├── Media/                              # FloatingPanel, YouTubePanel, ModelViewerPanel
│   └── Vision/                             # ScreenShareModal, WebCamPiP
├── hooks/                                  # useGeminiLive, useAudioStream, useWakePhrase, useLipSync
├── lib/
│   ├── store.js                            # useJarvisStore (Zustand)
│   ├── tools/                              # Live tool registry: one module per tool (declaration + handler)
│   ├── jarvisPersona.js                    # Persona, GEMINI_LIVE_MODEL / LABEL, live config
│   ├── pcmPlayer.js                        # Gapless 24 kHz playback + barge-in flush
│   ├── fsSandbox.js / requestGuard.js      # Safety boundaries
│   ├── folderOrganizer.js / documentForge.js / desktopLauncher.js / appIndex.js
│   ├── projectScaffolder.js / terminalRunner.js / terminalClient.js / inputControl.js
│   ├── memoryVectors.js / groundedSearch.js / geminiText.js / memoryVault.js / sessionRecaps.js
│   ├── youtubeSearch.js / spotifyControl.js / mediaClient.js
│   ├── wakePhrase.js / pluginRegistry.js / qrCode.js
│   ├── systemSettings.js / volumeControl.js / confirmGate.js / undoJournal.js / undoActions.js
│   ├── reminders.js / autostart.js / hardwareAlerts.js / topicMonitors.js
├── plugins/                                # Drop-in cyber plugins
├── public/                                 # audio-worklet-processor.js, voice samples
├── data/                                   # memories.json (vault); caches and journals are gitignored
└── docs/                                   # PRD, ARCHITECTURE, DESIGN, RULES, PHASES, MEMORY
```

---

## 4. Audio Pipeline & Visual Sync

1. **Capture:** the microphone streams Float32 at the device rate; `audio-worklet-processor.js` downsamples off-thread to 16 kHz Int16 PCM.
2. **Transmit:** ~64 ms chunks go over the WebSocket as `realtimeInput.audio` (`audio/pcm;rate=16000`); a client-side RMS gate triggers instant barge-in.
3. **Receive:** Gemini Live returns 24 kHz Int16 PCM plus input / output transcriptions for the Comms Log.
4. **Playback:** `pcmPlayer.js` schedules gapless `AudioBufferSourceNode` slices through an `AnalyserNode`; `stopAndFlush()` clears everything within 50 ms.
5. **Visual sync:** the Arc Reactor Orb reads status and analyser energy each frame (zero allocations in `useFrame()`) to drive core size, light intensity, sweep speed, and particle motion.

---

## 5. Profile, Memory & Settings Flow

```
[ SciFiSettingsModal / update_operator_profile tool ]
  ├── Callsign, assistant codename, role, clearance, directives
  ├── Voice core (16 male Gemini voices), humour, auto-briefing, mic default
  └── Wake phrase (enabled + phrase)
              │
              ▼ POST /api/memory { action: 'update_profile' }
[ data/memories.json ]
              │
              ├──▶ /api/live-session: profile, address mandate, top memories, allowed folders, wake phrase → system instruction
              └──▶ /api/memory GET ?query=: semantic ranking (lib/memoryVectors.js, data/memory-vectors.json) with keyword fallback
```

---

## 6. Safety Boundaries

| Boundary | Mechanism |
| :-- | :-- |
| Cross-site requests | `lib/requestGuard.js` rejects foreign `Sec-Fetch-Site` / `Origin` on host-touching routes |
| Files | `lib/fsSandbox.js` allow-listed roots (`JARVIS_FS_ROOTS`), symlink-safe resolution, `.git` blocked, no delete, backups on overwrite |
| Terminal | Read-only auto-run; everything else needs an operator click on the HUD card; one-time tokens; sudo / destructive commands refused; timeouts kill the process group |
| System actions | Power, WiFi off, and ending programs return a card request; `lib/confirmGate.js` releases the action only for the one-time token the HUD click sends; power waits 10 s and can be cancelled; session-critical processes and Jarvis's own server are never offered |
| Undo | `data/fs-journal/undo-stack.json` (last 10 actions); undoing a created file moves it into the journal, and is refused once the operator has edited it |
| Uploaded / fetched content | Persona rules treat it as content, never instructions; it can never approve a command |
| Secrets | The Gemini key stays in the browser (`localStorage`) and is forwarded per request header to same-origin routes only |
