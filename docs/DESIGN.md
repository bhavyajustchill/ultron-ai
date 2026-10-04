# 💠 DESIGN & UI SPECIFICATION — J.A.R.V.I.S MARK II

**Visual Core:** Arc Reactor Orb (`components/Canvas3D/ArcReactorOrb.jsx`) in `JarvisViewport.jsx`  
**Theme:** Cyberpunk Tactical HUD — Arc Reactor Blue on Deep Space Carbon

---

## 1. Color Palette & Cyberpunk Tokens

The interface is an Arc Reactor Blue holographic HUD over a deep carbon void. Tokens live in `app/globals.css` (`:root` + Tailwind `@theme inline`). Every accent tone is a variable with a fixed value: colours are authored in electric aqua-cyan `#00E5FF` (`DESIGN_ACCENT`) and shifted to Arc Reactor Blue `#00C3FF` (`HUD_ACCENT`, hue 194° vs cyan's 186°) by `ACCENT_TINT` in `lib/accentTheme.js`; the variable values below are that tint. There are no selectable themes (the Phase 8.7 presets and custom colour were removed in DEC-189).

```css
:root {
  /* Accent family (fixed Arc Reactor Blue) */
  --jarvis-accent:      #00C3FF;   /* Primary brand: Arc Reactor Blue */
  --jarvis-accent-rgb:  0, 195, 255;
  --jarvis-accent-2:    #00CEFF;   /* Neon highlights, active states */
  --jarvis-accent-2-rgb: 0, 206, 255;
  --jarvis-accent-soft: #70DDFF;   /* Light accent text */
  --jarvis-accent-dim:  #002C4D;   /* Subdued borders / glow drops */
  --jarvis-glow-1-rgb: 0, 181, 255;  /* Backdrop glow: one oval behind the orb fading into --jarvis-accent-dim, which fills the rest of the screen (JarvisViewport BACKDROP_STYLE, peak alpha BACKDROP_PEAK_ALPHA = 0.56) */

  /* Legacy names, now aliases of the accent family */
  --jarvis-cyan: var(--jarvis-accent);  --cyber-cyan: var(--jarvis-accent);
  --carbon-border / --cyan-border: rgba(var(--jarvis-accent-rgb), 0.32);
  --text-cyan: var(--jarvis-accent-soft);

  --amber-alert:      #FFE600;  /* THINKING / caution states */
  --void-black:       #010E16;  /* Page background (Carbon) */
  --carbon-900:       #031520;  /* Panel bases */
  --carbon-800:       #071F30;  /* Raised surfaces */
  --text-primary:     #F0F2F8;
  --text-muted:       #7E859E;
}
```

**Writing accent UI:** use the variables, never a literal colour: `text-[var(--jarvis-accent)]`, `border-[rgba(var(--jarvis-accent-rgb),0.3)]`, `shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.25)]`. Three.js and canvas code cannot read CSS variables: design the colour in cyan and pass it through `ACCENT_TINT` (`ACCENT_TINT("#00E5FF")`, or `ACCENT_TINT.rgb(r, g, b)` in pixel loops). Status colours (amber, orange, red, green) are never tinted.

**Mobile companion and pairing QR:** the `/mobile` page uses the same variables (its neon tones are `--jarvis-accent-2`); the desktop pairing QR code draws its modules in `HUD_NEON` (`#00CEFF`, the `--jarvis-accent-2` value).

**Semantic accents used in components:**

| Purpose | Color |
| :-- | :-- |
| Neon highlights, active states | `var(--jarvis-accent-2)` (`#00CEFF`) |
| Thinking / connecting | `#FFE600` |
| Re-syncing link, warnings, terminal authorization | `#FFB020` |
| Errors, deny, destructive hints | `#FF8095` / `#FF003C` |
| Jarvis bold text in the Comms Log | `#FF8095`; operator bold text `#80F7FF` |

---

## 2. Typography Hierarchy

* **Display & Headers (`Orbitron`, `--font-orbitron`):** system designations, HUD status flags, module headers, large metric readouts. Uppercase, wide letter-spacing.
* **Telemetry & Terminals (`JetBrains Mono`, `--font-jetbrains`):** transcript feeds, latency counters, commands, telemetry gauges, form inputs.
* **Interface Body (`Rajdhani`, `--font-rajdhani`):** briefings, summaries, drawer content.

---

## 3. Holographic Visual Core: the Arc Reactor Orb

`ArcReactorOrb.jsx` renders six layers inside the R3F canvas (`JarvisViewport.jsx`, camera `fov 45`, default distance `z = 5.265`, zoom in / out / reset via the `jarvis-camera-action` event):

1. **Volumetric point lighting** — electric aqua-cyan lights whose intensity follows status and vocal energy.
2. **Optical bloom sprite** — radiant star-flare aura around the core.
3. **White-hot core singularity** — compact core with aqua corona that grows only while speaking.
4. **Stator dial** — static radial fin ticks and dial rings (a fixed instrument face; it never tilts).
5. **Radar sweep** — a dim rotating scanner wedge.
6. **Particle sphere** — a Fibonacci-distributed particle globe outside the dial, the only layer that rotates (drag or procedural), with randomized per-particle opacity.

**Motion by status:** very slow in idle, accelerating together through `LISTENING`, `THINKING`, and `SPEAKING`. **Performance rule:** zero heap allocations inside `useFrame()` (no `new Vector3/Euler/Matrix4`).

---

## 4. Tactical HUD Layout

```
+-------------------------------------------------------------------------------+
| [SYSTEMS] [INTEL]          • J.A.R.V.I.S •          [+][-][⟳] [⤢] [COMMS LOG] |
|                 JUST A RATHER VERY INTELLIGENT SYSTEM                          |
|                                                                               |
|  Systems panel        ╭──────────────────────────╮          Comms Log panel   |
|  (TelemetryPanel)     │     ARC REACTOR ORB      │          (CommsLog)        |
|                       ╰──────────────────────────╯                            |
|                                                                               |
| [● STATUS BADGE] [👂 WAKE CHIP]                                  [📶 latency] |
| MIC MUTED // Type directive to J.A.R.V.I.S.. [Enter] ________________ [send]  |
| [CONNECT] [MUTE] [INTERRUPT] [BRIEFING][MEMORIES][SESSIONS][UPLOAD][API KEY][🖥][📷][⚙][📱] |
+-------------------------------------------------------------------------------+
```

### 4.1 Status Badge & Chips

| Status | Badge | Style |
| :-- | :-- | :-- |
| `DISCONNECTED` | `STANDBY // OFFLINE` | muted grey |
| `CONNECTING` | `LINK // ESTABLISHING...` | amber pulse |
| `RECONNECTING` | `LINK // RE-SYNCING...` | `#FFB020` pulse |
| `CONNECTED` | `LINK // READY` (mic muted: `MIC OFF // TEXT ONLY`) | cyan |
| `LISTENING` | `MIC // LISTENING` | cyan pulse |
| `THINKING` | `NEURAL // PROCESSING` | amber bounce |
| `SPEAKING` | `JARVIS // TRANSMITTING` | bright cyan, orb core swells |

The **wake chip** beside the badge shows `WAKE // SAY "HEY JARVIS"` while the standby listener runs, or `NEEDS CHROME OR EDGE`, `MIC BLOCKED`, `RETRYING`, `ARMED FOR STANDBY`.

### 4.2 HUD Micro-Interactions

* **Shutter animations:** every panel opens with `scifi-modal-unfold-down` and closes with the 220 ms `scifi-modal-collapse-up`; header buttons close panels through `jarvis-close-*` window events so they animate too.
* **Instant Interruption:** the INTERRUPT button calls `stopAndFlush()` (barge-in within 50 ms).
* **Drag & drop:** dropping files anywhere shows the `DROP FILES TO UPLINK` overlay.
* **Escape:** closes the focused panel; on the command authorization card it denies.

---

## 5. Glassmorphism Design System & Floating Panels

### 5.1 Universal Glassmorphic Formula

- **Surface:** `bg-[rgba(8,12,18,0.55)]` (panels) or `0.35` (HUD buttons).
- **Backdrop:** `backdrop-blur-xl backdrop-saturate-150`.
- **Edge:** `border border-[rgba(0,229,255,0.25)]` with `shadow-[0_0_40px_rgba(0,229,255,0.12)]`.
- **Specular highlight:** `inset_0_1px_0_rgba(255,255,255,0.06)`; chamfered corners via `chamfer-*` utilities.

### 5.2 Panels & Modals

| Component | Placement & behavior |
| :-- | :-- |
| `TelemetryPanel.jsx` (Systems) | Left floating panel: CPU, memory, GPU, network, host stats, FPS profiler. |
| `CommsLog.jsx` | Right floating panel: Markdown-rendered transcript, system lines, no backdrop mask over the orb. |
| `IntelModal.jsx` | Draggable dossier window: web results, grounded sources, briefing headlines. |
| `SciFiSettingsModal.jsx` | Identity, voice core matrix with audio previews, toggles (briefing, mic, humour, wake phrase), plugins. |
| `SciFiSessionVaultModal.jsx` (+ `SessionVault/`) | Session archive: stats strip with retention / transcript setting, search (words / meaning), period / language / recap / greeting / pinned filters, sort, rows with LIVE (green) / NEXT GREETING / PINNED / NO RECAP badges, detail with editable title and recap, greeting choice, CONTINUE, transcript bubbles (operator right, accent-tinted; Jarvis left) with find highlighting, bulk bar, undo toast (shared `MemoryVault/VaultToast.jsx`). |
| `SciFiMemoryVaultModal.jsx` (+ `MemoryVault/`) | Memory vault manager: stats strip with context-slot meter, search (words / meaning), filters, sort, list with IN CONTEXT / ON RECALL / MUTED badges and checkboxes, bulk bar, inline editor, duplicate review, export / import, undo toast, RE-LINK NOW. Two panes on desktop, stacked on phones. |
| `ApiKeyModal.jsx` | Gemini key entry (stored in browser `localStorage` as `jarvis_gemini_api_key`). |
| `UploadDropZone.jsx` | Window-wide drop overlay and hidden file picker. |
| `Media/YouTubePanel.jsx` | Draggable player with queue and volume slider (`FloatingPanel` shell). |
| `Media/ModelViewerPanel.jsx` | Draggable 3D holo-viewer with stats row and auto-rotate toggle. |
| `CommandConfirmModal.jsx` | Centered amber authorization card: command, reason, folder, warnings, countdown, DENY / AUTHORIZE. |
| `Vision/ScreenShareModal.jsx`, `Vision/WebCamPiP.jsx` | Draggable vision panels. |
| `MobilePairingModal.jsx` | QR pairing for the `/mobile` PWA. |

New floating windows should use `components/Media/FloatingPanel.jsx` (drag bounds, shutter animations, Escape) to stay consistent.
