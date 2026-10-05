# ⚡ DESIGN & UI SPECIFICATION — PROJECT ULTRON
**Visual Philosophy:** Cyberpunk Stark Gold HUD // Autonomous Super-Intelligence  
**Active 3D Core:** Holographic 3D Ultron Orb (`lib/ultronOrbScene.js`) with Stark Gold Bloom & MediaPipe Hand Tracking  
**Shared Features:** the J.A.R.V.I.S Mark II feature set, dressed in Ultron's look ([`JARVIS_PARITY_PLAN.md`](./JARVIS_PARITY_PLAN.md))

---

## 1. Color Palette & Cyberpunk Tokens

The visual design channels Ultron's commanding Stark Gold elegance over near-black carbon (`DEC-147`). The accent family is a set of CSS variables so the HUD can take other colour themes (section 1.1); their default values are Stark Gold.

```css
:root {
  /* Accent family (overridden at runtime by the chosen theme; Stark Gold by default) */
  --jarvis-accent:       #FFB800;   /* Stark Gold: primary brand, titles, borders, glows */
  --jarvis-accent-rgb:   255, 184, 0;
  --jarvis-accent-2:     #FFB800;   /* Highlights, active states, QR modules */
  --jarvis-accent-2-rgb: 255, 184, 0;
  --jarvis-accent-soft:  #FFD54F;   /* Light accent text, data streams */
  --jarvis-accent-dim:   #3D2600;   /* Subdued borders / glow drops */
  --jarvis-glow-1-rgb:   255, 184, 0;

  /* Legacy names, now aliases of the accent family */
  --ultron-gold: var(--jarvis-accent);  --ultron-gold-dim: var(--jarvis-accent-dim);
  --jarvis-cyan: var(--jarvis-accent);  --cyber-cyan: var(--jarvis-accent);
  --carbon-border / --cyan-border: rgba(var(--jarvis-accent-rgb), 0.32);
  --text-cyan: var(--jarvis-accent-soft);

  /* Fixed tokens (never themed) */
  --amber-alert:   #FFE600;  /* System warnings & security flags */
  --void-black:    #000000;  /* Page background */
  --carbon-900:    #0F0C05;  /* Panel bases */
  --carbon-800:    #1A1408;  /* Raised surfaces */
  --text-primary:  #F0F2F8;  /* Crisp high-contrast readout */
  --text-muted:    #9E957E;  /* Secondary telemetry labels (components also use #9E8B65) */
}
```

**Semantic colours used in components:**

| Role | Colour |
| :-- | :-- |
| Brand, borders, glows, active states | `var(--jarvis-accent)` / `var(--jarvis-accent-2)` (`#FFB800` in Stark Gold) |
| Thinking / connecting | `#FFAA00` |
| Re-syncing link, warnings, terminal authorization | `#FFB020` |
| Errors, deny, destructive hints | `#FF8095` / `#FF003C` (the HUD keeps red for danger; the orb has none, `DEC-167`) |
| Online / live / success | `#00FF66` |
| Mobile page and other dark grounds | `#080602` (Deep Space Carbon) |

**Writing themed UI:** use the variables, never a literal gold: `text-[var(--jarvis-accent)]`, `border-[rgba(var(--jarvis-accent-rgb),0.3)]`, `shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.25)]`. Tailwind arbitrary values must not contain spaces (`rgba(255, 184, 0,0.25)` is silently dropped and the border falls back to the text colour). Canvas and Three.js code cannot read CSS variables: pass the colour through `useAccentTint()` (`tint("#00E5FF")`; the design inputs are the shared cyan values, which Stark Gold maps to Ultron's exact gold tones through `ULTRON_TINTS` in `lib/accentTheme.js`). Status colours (amber, orange, red, green) are never tinted.

### 1.1 HUD Colour Themes

Inherited from Jarvis Mark II (`JM2-DEC-167`, `JM2-DEC-184`) with Stark Gold as the base:

- **Presets:** Stark Gold `#FFB800` (default and reset), Arc Reactor Blue `#00C3FF`, Arc Reactor Cyan `#00E5FF`, Mark III Gold `#FFC23D`, Hot Rod Red `#FF3B4E`, Vibranium Violet `#A66BFF`, Emerald Ops `#2BFFA3`, Ice White `#DDF6FF`.
- **Custom colour:** any colour from the Settings colour wheel or a hex code, previewed live and saved with the profile; by voice through `update_operator_profile` `hud_accent` ("make the HUD red", colour words or preset names).
- **Stark Gold is exact:** `accentCssVars()` returns `ULTRON_PALETTE` for Stark Gold, so the default theme is the same gold as before themes existed. Other themes derive every tone (`-2`, `-soft`, `-dim`, glows) from the chosen colour.
- **What a theme recolours:** HUD panels, text, borders, glows, the waveform crest, the gesture camera panel, and the new feature panels. **It never recolours the Ultron Orb**, which always keeps its own gold, and never the status colours, the square corners, or the layout.
- **No flash on reload:** the saved theme is cached and applied by an inline script in `app/layout.jsx` before the first paint.
- **Mobile companion and pairing QR:** `/mobile` follows the **saved** theme within one relay poll (about two seconds). The pairing QR draws its modules in `--jarvis-accent-2`, or near-white `#F0F2F8` when a custom colour would fall below 4.5:1 contrast on its `#0A0B10` background.

---

## 2. Typography Hierarchy

* **Display & Headers (`Orbitron`, sans-serif):** system designations, the ULTRON title, HUD status flags, module headers, large metric readouts. Uppercase, wide letter-spacing.
* **Telemetry & Terminals (`JetBrains Mono`, monospace):** transcript feeds, latency counters, commands, telemetry gauges, form inputs.
* **Interface Body (`Rajdhani`, sans-serif):** briefings, search result summaries, drawer content.
* **Title (`DEC-155`):** "ULTRON" without an acronym, `tracking-[0.28em]`, near-white with a gold glow, flanked by two pulsing accent squares; subtitle "AUTONOMOUS ARTIFICIAL INTELLIGENCE SYSTEM" in the accent colour.

---

## 3. Holographic Visual Core: the Ultron Orb

`lib/ultronOrbScene.js` is a plain Three.js scene (no React Three Fiber), mounted by `components/Canvas3D/UltronViewport.jsx`.

- **Form (`DEC-156` – `DEC-158`, matched to `ultron_ref.png`):** a starburst geodesic hologram with 72 spikes, glowing cages and belts, curved ribbons, a radiant sun core, orbit rings with floating halo particles, and drifting gold stardust and code sprites.
- **Palette (`DEC-167`):** pure Stark Gold; red and crimson tones removed entirely (ray tips `[1.0, 0.72, 0.0]`, corona and inner cage `0xffaa00` / `0xff9900`). The orb never reads the HUD colour theme.
- **States (`DEC-151`, `DEC-152`, `DEC-160` – `DEC-162`):** IDLE (ultra-slow planetary drift), THINKING, and SPEAKING, blended with exponential damping; during speech the core grows and only the core shines, with multidirectional gyroscopic rotation of rays, arcs, rings, and belts.
- **Framing (`DEC-150`, `DEC-163`, `DEC-169`):** default and reset camera at `Z = 7.975` (one level zoomed out); on phones the home position is scaled by `ZOOM_OUT_STEP ** 2` = 1.5625 (two zoom-out presses, `setHomeScale()`), re-applied when the screen crosses the phone breakpoint. Zoom in / out (× 0.8 / × 1.25) / reset from the top-right buttons or **+** / **−** / **R**.
- **Hand gestures:** **G** toggles MediaPipe hand tracking (`lib/handTracker.js`); one-hand pinch spins the orb, two-hand pinch zooms. A mirrored 192 × 144 camera panel ("GESTURE TRACKER", hand count and mode) sits at the bottom right while tracking is on (above the two-row dock on phones).
- **Performance:** zero allocations inside the `animate()` loop; the viewport reports FPS and frame time to the Systems panel.

---

## 4. Tactical HUD Layout

```
+-------------------------------------------------------------------------------+
|                          ▪ ULTRON ▪                [INTEL] [+][-][⟳]  [⤢]    |
|              AUTONOMOUS ARTIFICIAL INTELLIGENCE SYSTEM        ┌────────────┐  |
| ┌──────────────┐                                              │ NEURAL     │  |
| │ SYSTEMS PANEL│                                              │ INTEL      │  |
| │ (Telemetry)  │            ULTRON ORB                        │ (opens     │  |
| ├──────────────┤                                              │  here)     │  |
| │ COMMS LOG    │                                              └────────────┘  |
| │ FEED         │                                                              |
| └──────────────┘                                                              |
| [● STATUS BADGE] [👂 WAKE CHIP]                                  [📶 latency] |
| Type directive or click Connect... [Enter] _______________________ [send]    |
| [CONNECT] [MUTE MIC] [INTERRUPT]   [BRIEFING][MEMORIES][SESSIONS][UPLOAD][API KEY][🖥][📷][⚙][📱] |
+-------------------------------------------------------------------------------+
```

- **Left column (`DEC-163` – `DEC-165`):** the Systems panel (above, `flex-[1.15]`) and the Comms Log feed (below) are permanent on desktop: no close buttons, no header toggles, no Escape. The column keeps `bottom-40` clearance above the command bar. On phones it is behind buttons (see 4.0).
- **Top right (`DEC-164`):** INTEL, then the zoom cluster, then fullscreen. The Intel panel opens at `top-18 right-6` and can be dragged.
- **Background:** pure black stage behind the orb.

### 4.0 Phone & Compact Layout (narrower than 1024px, `DEC-169`, `DEC-171`)

Phones are anything below Tailwind's `sm` breakpoint (`hooks/useIsPhone.js`, `PHONE_MEDIA_QUERY`). Since Phase 15 the same arrangement covers everything below `lg` (`COMPACT_MEDIA_QUERY`, 1024px): the `max-lg:` classes put the controls in a row above the title, hide the permanent stack behind the SYSTEMS / COMMS buttons, and split the dock in two; the `max-sm:` classes add the phone-only parts (full-width panels, safe-area insets, the orb further back). 1024px and wider is unchanged apart from the TASKS button and, at 1024–1279px, the left stack starting below the title.

```
+------------------------------------+
| [⚡][>_]        [☑][🌐][+][-][⟳][⤢] |  controls row, below the notch
|            ▪ ULTRON ▪              |  title row
|  AUTONOMOUS ARTIFICIAL INTELLIGEN… |
|            ( ULTRON ORB )          |  home distance × 1.5625
| [● STATUS BADGE]      [📶 latency] |
| Type directive…               [➤]  |
| [⏻ CONNECT] [🎤 MUTE] [■ INTERRUPT] |  three equal buttons
| [☀][🧠][🕘][📎][🔑][🖥][📷][⚙][📱]  |  nine equal icon buttons
+------------------------------------+  + home-bar inset
```

* **Systems, Comms Log & Task List:** the permanent column is hidden; the SYSTEMS (⚡) and COMMS (>_) buttons and TASKS (☑) open one panel at a time under the controls row (full width on phones) (55dvh tall, shutter animation); a second tap or Escape closes it.
* **Height and insets:** the page is `h-dvh` (the visible height, above mobile browser toolbars); the viewport is `viewportFit: "cover"` and phone offsets add `env(safe-area-inset-top / bottom)`.
* **Labels:** top buttons are icon-only below 768px; dock icons have no labels below 1024px; MUTE MIC reads MUTE / UNMUTE; the INTERRUPT label hides below 360px; the fullscreen button is hidden where the browser has no page fullscreen (iPhone Safari); the wake chip is hidden.
* **Panels:** screen-vision and webcam windows open just above the dock; the clipboard card sits just above the input; the 3D holo-viewer is 240px tall; vault headers wrap their count badge onto its own line. Drag handles use `touch-none` so windows can be dragged with a finger.

### 4.1 Status Badge & Chips

| Status | Badge | Style |
| :-- | :-- | :-- |
| `DISCONNECTED` | `STANDBY // OFFLINE` | muted |
| `CONNECTING` | `LINK // ESTABLISHING...` | amber pulse |
| `RECONNECTING` | `LINK // RE-SYNCING...` | `#FFB020` pulse |
| `CONNECTED` | `LINK // READY` (mic muted: `MIC OFF // TEXT ONLY`) | accent |
| `LISTENING` | `MIC // LISTENING` | accent pulse |
| `THINKING` | `NEURAL // PROCESSING` | amber bounce |
| `SPEAKING` | `ULTRON // TRANSMITTING` | bright accent, orb core grows |

The **wake chip** beside the badge shows `WAKE // SAY "HEY ULTRON"` while the standby listener runs, or `NEEDS CHROME OR EDGE`, `MIC BLOCKED`, `RETRYING`, `ARMED FOR STANDBY`.

### 4.2 HUD Micro-Interactions

* **Shutter animations:** panels open with `scifi-modal-unfold-down` and close with the 220 ms `scifi-modal-collapse-up`.
* **Instant Interruption:** INTERRUPT calls `stopAndFlush()` (barge-in within 50 ms).
* **Drag & drop:** dropping files anywhere shows the `DROP FILES TO UPLINK` overlay.
* **Escape:** closes the focused modal; on the command authorization card it denies. The left column ignores it.
* **Waveform:** bars rise from amber `#FF8800` at the base to the accent at the crest.

---

## 5. Glassmorphism Design System & Floating Panels

### 5.1 Universal Glassmorphic Formula

- **Surface:** `bg-[rgba(15,12,5,0.55)]` (panels) or `0.35` (HUD buttons); raised cards `rgba(20,16,8,0.65)`.
- **Backdrop:** `backdrop-blur-xl backdrop-saturate-150`.
- **Edge:** `border border-[rgba(var(--jarvis-accent-rgb),0.25)]` with `shadow-[0_0_40px_rgba(var(--jarvis-accent-rgb),0.12)]`.
- **Specular highlight:** `inset_0_1px_0_rgba(255,255,255,0.06)`.
- **Corners (`DEC-154`):** sharp 90° everywhere. `app/globals.css` forces `border-radius: 0`, `corner-shape: initial`, and `clip-path: none` on HUD panels, so `chamfer-*` utilities inherited from the shared code render square, and new panels inherit the rule.

### 5.2 Panels & Modals

| Component | Placement & behavior |
| :-- | :-- |
| `TelemetryPanel.jsx` (Systems) | Permanent, top of the left column: CPU, memory, GPU, network, host architecture, uptime, processes, FPS profiler. |
| `CommsLog.jsx` | Permanent, bottom of the left column: Markdown-rendered transcript and tagged system lines; Ultron's lines labelled `ULTRON // SYSTEM`. |
| `IntelModal.jsx` | Draggable dossier panel under the top-right cluster: web results, cited sources, briefing headlines, monitor alerts. |
| `SciFiSettingsModal.jsx` | Identity, Gemini 3.8 Live core, male voice matrix with samples (Algenib recommended), directives, toggles (briefing, mic, humour, proactive check-ins, transcripts and retention, clipboard, start on login, standby wake phrase), HUD colour theme, audio devices, plugins. |
| `SciFiMemoryVaultModal.jsx` (+ `MemoryVault/`) | Memory vault manager: stats strip with context-slot meter, search (words / meaning), filters, sort, list with IN CONTEXT / ON RECALL / MUTED badges and checkboxes, bulk bar, inline editor, duplicate review, export / import, undo toast, RE-LINK NOW. Two panes on desktop, stacked on phones. |
| `SciFiSessionVaultModal.jsx` (+ `SessionVault/`) | Session archive: stats strip with retention / transcript setting, search (words / meaning), period / language / recap / greeting / pinned filters, sort, rows with LIVE (green) / NEXT GREETING / PINNED / NO RECAP badges, detail with editable title and recap, greeting choice, CONTINUE, transcript bubbles (operator right, accent-tinted; Ultron left) with find, bulk bar, undo toast. |
| `ApiKeyModal.jsx` | Gemini key entry (stored in browser `localStorage` as `jarvis_gemini_api_key`). |
| `CommandConfirmModal.jsx` | Centered amber authorization card: command, reason, folder, warnings, countdown, DENY / AUTHORIZE. |
| `ClipboardPanel.jsx` | Floating clipboard panel with Translate / Summarise / Explain / Fix. |
| `UploadDropZone.jsx` | Window-wide drop overlay and hidden file picker. |
| `Media/YouTubePanel.jsx`, `Media/ModelViewerPanel.jsx` | Draggable player with queue and volume, and 3D holo-viewer with stats (`FloatingPanel` shell). |
| `Vision/ScreenShareModal.jsx`, `Vision/WebCamPiP.jsx` | Draggable vision panels. |
| `MobilePairingModal.jsx` | QR pairing for the `/mobile` PWA (themed QR). |
| Gesture tracker (in `UltronViewport.jsx`) | Bottom-right mirrored camera panel while gestures are on. |

---

## 6. Mobile Companion (`/mobile`)

Deep Space Carbon (`#080602`) PWA: ULTRON title with MOBILE RELAY badge, sync chip, status strip (status, CPU, memory, uptime), a large HOLD TO TALK button, quick actions (volume up / down, mute, briefing, desktop), the recent comms lines, and a directive field. Accent colours follow the saved HUD theme.
