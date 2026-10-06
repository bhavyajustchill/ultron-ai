# Implementation Plan — Ultron × Jarvis Mark II Parity

**Status:** Carried out on branch `experimental` (Phase 12, DEC-168 in [`MEMORY.md`](./MEMORY.md)); `master` is untouched until the operator merges.
**Written:** 2026-10-04 (revised: Ultron keeps its original orb and look)  
**Source of features:** `jarvis-mark-ii` (portable: `../jarvis-mark-ii`; Linux: `/home/bhavyajustchill/dev/_Fun/desktop_ai/jarvis-mark-ii`; Windows: `F:\__Development\__Fun\desktop_ai\jarvis-mark-ii`), branch `experimental` at `311b327` (Phases 6.x – 12). The HUD colour themes come from `ce2ed17`, the last Jarvis commit that had them: Jarvis removed them in `311b327` (DEC-189), and they now live in Ultron.  
**Fleet Ecosystem:** [`ECOSYSTEM.md`](./ECOSYSTEM.md)  
**Target:** this repo (`ultron-ai`), `master` at `40ef578`

> **The rule for this port: Ultron looks exactly as it does today, and gains every feature Jarvis Mark II has.**
> Ultron's orb, colours, corners, layout, voice, and personality stay as they are. Jarvis's arc reactor orb and Jarvis's visual changes are not brought over. Jarvis's new screens (vault managers, session archive, authorization card, and so on) are dressed in Ultron's look.
> Ultron also gets the **HUD colour themes** (presets and a custom colour) that Jarvis has dropped. Stark Gold is the default, so Ultron still opens looking exactly as today.

---

## 1. Why git instead of re-implementing

Ultron and Jarvis share a starting point:

- Ultron's first commit `b24a254` (2026-09-13) has exactly the same files as Jarvis's first commit `637f71f`, apart from `package.json`, `package-lock.json`, and `.gitignore`.
- Everything that makes Ultron *Ultron* is in Ultron's own six commits (`b24a254..40ef578`: 44 files, about +2.3k / −1.5k lines).
- Jarvis has moved on by 41 commits: Phases 7 – 12 and the Phase 6 polish.

Porting 11 phases by hand would mean re-doing hundreds of changes. Instead:

1. **Bring Jarvis's code and history in with a git merge**, for the features.
2. **Put Ultron's look and identity back on top**, so every existing screen matches today's Ultron.

A side benefit: after the merge, Ultron shares Jarvis's history, so future Jarvis work reaches Ultron with an ordinary `git merge`.

---

## 2. What must stay exactly as it is

| Area | Ultron today (kept as is) | Where it lives | Ultron decisions |
| :-- | :-- | :-- | :-- |
| **Orb** | The gold starburst geodesic orb, unchanged: white-hot core, 72 laser spikes, two counter-rotating geodesic cages, curved ribbons, orbit rings, stardust belts and halo particles; same IDLE / THINKING / SPEAKING behaviour, speech-driven core glow, framing, zoom, and pure Stark Gold palette (no red tones). Not tinted by any theme. | `lib/ultronOrbScene.js`, `components/Canvas3D/UltronViewport.jsx`, reference `docs/ultron_ref.png` | DEC-147, 150–152, 156–162, 165–167 |
| **Viewport** | Ultron's own background and framing. Jarvis's backdrop oval, arc reactor, and stage changes are not used. | `UltronViewport.jsx` | DEC-150, 163 |
| **Hand gestures** | MediaPipe hand tracking on the webcam: pinch to rotate and zoom the orb, mirror picture-in-picture with hand count and mode, HUD toggle | `lib/handTracker.js`, `UltronViewport.jsx`, `@mediapipe/tasks-vision` | — |
| **Colours** | Stark Gold `#FFB800` on Deep Space Carbon `#080602` throughout the HUD | `app/globals.css`, HUD components | DEC-147, 167 |
| **Geometry** | Sharp 90° corners everywhere (no chamfered bevels) | `app/globals.css` | DEC-154 |
| **Layout** | Systems and Comms Log stacked permanently on the left; Intel at the top right; Systems panel spacing | `app/page.jsx`, `CommsLog.jsx`, `TelemetryPanel.jsx`, `IntelModal.jsx` | DEC-163, 164, 165 |
| **Branding** | "ULTRON" middle title (not an acronym, compact), "ULTRON // TRANSMITTING", "ULTRON Core initialized", Comms Log speaker `ultron`, manifest / PWA, mobile page, API-key modal | `app/page.jsx`, `app/layout.jsx`, `app/manifest.js`, `app/mobile/page.jsx`, HUD components | DEC-153, 155 |
| **Persona** | Ultron (Avengers: Age of Ultron, James Spader): cold, calculated, imposing, never cheerful or subservient; callsign, "Sir", occasionally "Creator" | `lib/ultronPersona.js` | DEC-148 |
| **Voice** | Algenib by default; humour off by default | `lib/ultronPersona.js`, `lib/store.js`, `data/memories.json` | DEC-149 |
| **Spoken prompts** | Ultron's greeting, briefing, and briefing acknowledgement | `hooks/useGeminiLive.js` | DEC-148 |
| **Dev setup** | `npm run dev` on `0.0.0.0:6061`; LAN `allowedDevOrigins`; package name `ultron` | `package.json`, `next.config.mjs` | — |
| **Vault** | Ultron's own `data/memories.json` (profile and memories) | `data/memories.json` | — |
| **Docs** | Ultron's `AGENTS.md`, `docs/*.md`, decision log DEC-146 – DEC-167, `ultron_view.md` | `AGENTS.md`, `docs/`, `ultron_view.md` | — |

---

## 3. What Ultron gains (from Jarvis Mark II)

Features only. Jarvis's visual changes (arc reactor orb work, backdrop oval, cyan / blue palettes) are not part of this.

- **Voice core:** Gemini 3.8 Live (`models/gemini-3.8-live`, `v1beta`) with session resumption, GoAway swaps, auto re-sync, unlimited sessions, settings re-link that keeps the conversation, the tool registry (33 tools), and acknowledgements before slow work.
- **Files and documents:** sandboxed file operations, folder organiser, PDF / Word creation, uploads with text extraction, deep file processing (images, PDFs, spreadsheets, audio / video).
- **Apps and projects:** universal app launcher, project scaffolder, autonomous dev agent.
- **Desktop control:** terminal with the on-screen authorization gate, keyboard / mouse / windows (incl. the Wayland RemoteDesktop portal), write into apps ("open notepad and type..."), system settings (dark mode, WiFi, brightness, wallpaper, processes, power), undo.
- **Knowledge:** semantic memory (RAG), grounded search and search-then-read without grounding quota, topic monitors, flights, the browser window.
- **Media and comms:** YouTube panel, Spotify, 3D model viewer, messages, Steam.
- **Background intelligence:** reminders, start on login, hardware alerts, proactive check-ins, clipboard intelligence, wake phrase and standby.
- **HUD tools:** audio device choice, the mobile companion pairing.
- **HUD colour themes (moved to Ultron):** Jarvis removed its selectable themes in `311b327` (DEC-189), and Ultron takes them over from `ce2ed17` (Phase 8.7 and DEC-184). Details in §4 U3:
  - presets
  - a custom colour (wheel or hex code) with live preview in Settings
  - "make the HUD red" by voice
  - the saved theme painted before the first frame
  - the mobile companion following the saved theme
  - the pairing QR drawn in the theme's tone
- **Vault managers:** the memory vault manager (pins, context slots, bulk, undo, duplicates, import / export) and the session archive (transcripts, recaps, continue a conversation).
- **Fixes:** `next` 16.3.8 security fix (GHSA-vcvr-r3jv-pc5j; Ultron is on 16.3.4) and Jarvis's audio, link, and HUD bug fixes.

Full details: Jarvis's `docs/PHASES.md` and `docs/MEMORY.md` (DEC-146 – DEC-188).

---

## 4. Plan

### U0 — Record how Ultron looks today

Before anything changes, capture reference screenshots of today's Ultron in headless Chrome at 1920×1080 and phone width:

- HUD idle
- orb in idle / thinking / speaking
- hand-gesture picture-in-picture
- Systems, Comms Log, and Intel open
- Settings, the memory modal and vault, the API-key and pairing modals
- the mobile companion page

These are the yardstick for "looks the same".

### U1 — Import Jarvis with git

1. Create branch `experimental` from `master`.
2. Add Jarvis as a local remote: `git remote add jarvis ../jarvis-mark-ii` (portable relative path working identically on Linux and Windows; or Linux `/home/bhavyajustchill/dev/_Fun/desktop_ai/jarvis-mark-ii`, Windows `F:\__Development\__Fun\desktop_ai\jarvis-mark-ii`), then `git fetch jarvis`.
3. Merge: `git merge --allow-unrelated-histories jarvis/experimental`. The histories are unrelated, so every file both sides changed conflicts. Resolve as follows:
   - **Ultron's visual identity files: keep Ultron's version.** These are `lib/ultronOrbScene.js`, `components/Canvas3D/UltronViewport.jsx`, `lib/handTracker.js`, `lib/ultronPersona.js`, `docs/ultron_ref.png`, and `ultron_view.md`.
   - **Jarvis's orb files are not used by Ultron:** `ArcReactorOrb.jsx` and `JarvisViewport.jsx`.
   - **Shared files** (HUD components, `app/page.jsx`, hooks, store, routes): take Jarvis's version for the features. U2 / U3 restore Ultron's look and wording in them.
   - **`data/memories.json`, `AGENTS.md`, `docs/*.md`:** keep Ultron's versions; U4 updates them.
4. **Bring the colour themes back:** `git revert 311b327`, done immediately after the merge and before any skin work, so it applies cleanly. This restores Jarvis's Phase 8.7 / DEC-184 theming code: presets, custom colour, preview, voice option, boot-script cache, mobile sync, and the themed QR.
5. `npm install`, then a clean build.

### U2 — Ultron's orb and viewport, unchanged

- `UltronViewport` + `ultronOrbScene` stay the HUD's centre stage, byte-for-byte where possible. The only changes are the wiring the newer code needs:
  - the current store and event names for status, audio energy, and FPS metrics
  - the zoom / reset events
  - hand gestures
- No accent tinting of the orb, no backdrop oval, no arc reactor.
- Hand gestures keep working as today: HUD toggle and mirror picture-in-picture. They're checked against the camera features Jarvis added (webcam panel, screen share) so the two never fight over the camera.

### U3 — Ultron's look and identity on top of the new features

- **Look of existing screens:** every screen in the U0 set looks the same as its reference.
  - **Colours:** Stark Gold `#FFB800` / Carbon `#080602`.
  - **Corners:** sharp 90° (via `app/globals.css`, so new panels inherit them).
  - **Layout:** Systems and Comms Log stacked on the left, Intel top right.
  - **Typography:** Ultron's title, typography, and badges.
- **Look of new screens:** Jarvis's new panels are dressed in the same style: memory vault manager, session archive, authorization card, clipboard panel, YouTube / 3D viewer panels, terminal output, and the new dock buttons (MEMORIES, SESSIONS, UPLOAD).
- **HUD colour themes (presets and custom colour, from Jarvis `ce2ed17`):**
  - **Gold as the base:** in Ultron the theme math is based on Stark Gold (`DESIGN_ACCENT = #FFB800`), with Ultron's existing gold tones as the authored values. The default theme is then an exact match for today's colours (checked against U0), and every other colour is derived from those tones.
  - **Presets:** Stark Gold `#FFB800` (default and reset) first, then the presets Jarvis had: Arc Reactor Blue `#00C3FF`, Arc Reactor Cyan `#00E5FF`, Mark III Gold `#FFC23D`, Hot Rod Red `#FF3B4E`, Vibranium Violet `#A66BFF`, Emerald Ops `#2BFFA3`, Ice White `#DDF6FF`.
  - **Custom colour:** any colour from the colour wheel or a hex code, previewed live in Settings and saved with the profile.
  - **By voice:** "make the HUD red" (`update_operator_profile` `hud_accent`, with colour words and preset names). Ultron confirms in character.
  - **No flash on reload:** the saved theme is painted before the first frame.
  - **Mobile:** the companion follows the saved theme within one poll. The pairing QR uses the theme's neon tone, or near-white when a dark custom colour would be hard to scan.
  - **What a theme recolours:** HUD panels, text, borders, glows, and the new feature panels. It never recolours the orb, which always keeps its original gold. Status colours (amber, red, green) and Ultron's square corners and layout are unaffected.
- **Persona:**
  - Ultron's persona file keeps its identity and demeanour sections (DEC-148).
  - It gains all 34 current guidelines (every tool and safety rule), rewritten in Ultron's voice.
  - Gemini 3.8 Live; Algenib and humour off by default. Humour on means cold, cutting irony; off means strictly clinical.
- **Prompts in `hooks/useGeminiLive.js`:** Ultron's greeting, briefing, and briefing acknowledgement as today, plus Ultron-voiced recap-recall and continue-conversation wording.
- **Branding:** every user-visible "Jarvis" / "J.A.R.V.I.S" in the new code becomes "Ultron" / "ULTRON" (notifications, reminders, the authorization card, browser window title, new panels).
- **Ultron's own folders and entries:** `~/Documents/Ultron Notes`, `Ultron Uploads`, `~/Pictures/Ultron Screenshots`, browser profile `~/.local/share/ultron/browser-profile`, start-on-login entry "Ultron". Ultron then never collides with Jarvis running at the same time.
- **Wake word:**
  - Standby wake phrase "Hey Ultron" (Web Speech).
  - The offline wake-word detector only ships a "Hey Jarvis" model, so in Ultron it's hidden (decision 2).
- **Dev setup:** port 6061, LAN `allowedDevOrigins`, package name `ultron`, `@mediapipe/tasks-vision` dependency.

### U4 — Docs

- **`AGENTS.md`:** Ultron's rules, updated for the new features and Gemini 3.8 Live. The Ultron orb, Stark Gold, and squared geometry stay the stated design; the Next.js agent-rules block is added.
- **`README.md`:** Jarvis's full feature README, rewritten for Ultron (names, paths, port 6061, gestures, Ultron's look).
- **`docs/PRD.md`, `ARCHITECTURE.md`, `RULES.md`, `PHASES.md`:** Jarvis's feature content added under Ultron's names.
- **`docs/DESIGN.md`:** stays Ultron's design spec (orb, gold, squared corners, layout), with the new panels described in that style and a section on the colour themes (gold base, presets, custom colour, the orb's fixed gold).
- **`docs/MEMORY.md`:**
  - Keeps Ultron's own log (DEC-146 – DEC-167).
  - Adds an "Inherited from Jarvis Mark II" table with Jarvis's decisions under a `JM2-` prefix (`JM2-DEC-146` ... `JM2-DEC-188`), because the numbers clash.
  - Jarvis-only visual decisions (arc reactor orb, backdrop oval, cyan / blue themes) are marked "not applied: Ultron keeps its look".
  - Adds a new Ultron entry (DEC-168) for this port.

### U5 — Verification

- **Looks the same:** U0's screenshots compared side by side with the same screens after the port. Expected differences are only the new dock buttons and new features. The orb must match in all three states.
- Clean production build.
- Every Jarvis test suite, re-run against Ultron on port 6061 with scratch data:
  - write into apps (mock portal)
  - search (mock + real)
  - memory vault (API, UI, meaning)
  - session archive (API, UI)
  - mobile companion
  - files / documents / undo
  - background intelligence
- Screenshots of every new panel in Ultron's style, and of hand gestures working.
- **Colour themes:** Jarvis's theme checks from `ce2ed17`, adapted to Ultron:
  - Stark Gold default identical to U0
  - each preset and a custom hex
  - "make the HUD red" by voice
  - the saved theme on reload with no flash, and an unsaved preview reverting
  - the mobile companion following within a poll
  - the QR still scanning, including the near-white fallback for a dark colour
  - the orb staying gold in every theme
- A live Gemini 3.8 Live voice run in character:
  - an Ultron greeting
  - one tool
  - store and recall a memory
  - disconnect / reconnect with a recap
  - "what did we talk about earlier?"
- The real `data/` is never used by tests.

### U6 — Commit and push

- Commits as the operator (Bhavya Popat), no co-author trailer.
- The U1 merge commit, then focused commits (orb and viewport wiring, look and layout, persona, branding, docs).
- Push branch `experimental` to `origin` (`github.com/bhavyajustchill/ultron-ai`). `master` stays untouched until the operator merges.

---

## 5. Decisions (defaults in bold)

1. **Internal code names: keep Jarvis's (sync-friendly).**
   - Everything the operator sees says Ultron. Code identifiers keep Jarvis's names (`useJarvisStore`, `jarvis-*` events, `JARVIS_*` environment variables, `jarvis_*` browser storage keys), so future Jarvis → Ultron merges stay nearly conflict-free.
   - Alternative: rename everything to Ultron. Cleaner to read, but every future port becomes a large conflict.
   - Saved browser settings carry over either way. Jarvis's one-time migration already moves the `ada_*` keys Ultron still uses (API key, mic, viewport mode), and Ultron's own `ultron_voice_name` is added to that migration.
2. **Offline wake word: hidden in Ultron.** The bundled model only recognises "Hey Jarvis". Alternative: keep it as an optional "Hey Jarvis" detector. A custom "Hey Ultron" model would need openWakeWord training (out of scope).
3. **Push target: new `experimental` branch.** Alternative: `master` directly.

Settled (not open): the orb, viewport, colours, corners, and layout stay exactly as Ultron has them today.

---

## 6. Risks and how they are handled

| Risk | Handling |
| :-- | :-- |
| Shared HUD files come from Jarvis, whose panels have changed since 13 Sep | U0 reference screenshots; restore Ultron's styling and layout until each existing screen matches; differences reviewed one by one |
| Ultron's orb predates Jarvis's store and event changes (`useAdaStore`, `ada-*` events) | Change only the wiring in `UltronViewport`; the scene file and its look stay as they are; keep the zero-allocation render loop |
| Hand tracking and Jarvis's camera features (webcam panel, screen share) both use the camera | Check they can run together; gestures release the camera when switched off |
| Persona drift (Jarvis's British wit leaking into Ultron) | Persona, prompts, and tool messages reviewed together; the live run checks that he stays in character |
| Gold close to the amber "thinking" / warning colours in new panels | Check contrast on status pills and the authorization card; adjust amber shades only if they become hard to tell apart |
| Restoring the themes on top of the merge | `git revert 311b327` straight after the U1 merge (nothing has touched those lines yet, so it applies cleanly); then rebase the theme math on Stark Gold and confirm the default is pixel-identical to U0 |
| A non-gold theme next to the always-gold orb | Intended (the orb stays original); screenshots of each preset are reviewed so the HUD and orb still read well together |

---

## 7. Out of scope

- Any change to Ultron's orb or overall look.
- Training a custom "Hey Ultron" offline wake-word model.
- Changing Jarvis Mark II itself.
- Merging `experimental` into `master` (the operator's call).
