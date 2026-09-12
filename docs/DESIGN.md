# 🩸 DESIGN & UI SPECIFICATION — PROJECT A.D.A
**Visual Philosophy:** Cyberpunk Syndicate Tactical HUD // Neo-Noir Operative  
**Active 3D Model:** [`adawong.glb`](./adawong.glb) (7.29 MB, 10 Meshes, Authentic RE Game Asset)  
**Reference Document:** [`ada_wong_realtime_voice_spec.md`](../ada_wong_realtime_voice_spec.md)

---

## 1. Color Palette & Cyberpunk Tokens

The visual design channels Ada Wong’s signature crimson elegance infused with high-tech syndicate surveillance aesthetics.

```css
:root {
  /* Core Brand & Neon Highlights */
  --ada-scarlet:       #FF003C;  /* Signature Crimson Glow (Primary Brand) */
  --ada-scarlet-dim:   #7A001C;  /* Subdued borders / glow drops */
  --cyber-cyan:        #00F0FF;  /* Holographic telemetry & data accents */
  --amber-alert:       #FFE600;  /* System warnings & security flags */
  
  /* Tactical Surfaces & Depth */
  --void-black:        #050508;  /* Deep background canvas */
  --carbon-900:        #0A0B10;  /* Primary HUD glass panels (opacity 80%) */
  --carbon-800:        #12141D;  /* Secondary cards & inset containers */
  --carbon-border:     rgba(255, 0, 60, 0.25); /* Hologram perimeter line */
  
  /* Text & Readability */
  --text-primary:      #F0F2F8;  /* Crisp high-contrast readout */
  --text-muted:        #7E859E;  /* Secondary telemetry labels */
  --text-cyan:         #80F7FF;  /* Data streams & timestamp highlights */
}
```

---

## 2. Typography Hierarchy

* **Display & Headers (`Orbitron`, sans-serif):**
  - Used for system designations, HUD status flags, module headers, and large metric readouts.
  - Styling: `font-weight: 800`, `letter-spacing: 0.12em`, uppercase.
* **Telemetry & Terminals (`JetBrains Mono`, monospace):**
  - Used for transcript feeds, latency counters, code helpers, and system telemetry gauges.
  - Styling: `font-weight: 500`, zero-padding numerals.
* **Interface Body (`Rajdhani`, sans-serif):**
  - Used for briefings, search result summaries, and drawer content.
  - Styling: `font-weight: 500`, `line-height: 1.4`.

---

## 3. 3D Holographic Stage & Lighting Setup for `adawong.glb`

Because `adawong.glb` utilizes 7 dedicated PBR material slots (`pl1200_11nuno_BM` for dress, `pl0100_00Face_BM` for facial skin, `pl0100_31SideHair_BM` for hair), lighting is specifically tuned to highlight her silhouette:

### 3.1 Three.js Lighting Setup
* **Key Light (Neon Crimson):** Directional light positioned top-left (`[-2, 3, 2]`), color `#FF003C`, intensity `2.5`. Casts dramatic neo-noir rim highlights on the crimson dress and hair.
* **Fill Light (Cyan Hologram):** Directional light positioned lower-right (`[2.5, -1, 1]`), color `#00F0FF`, intensity `1.2`. Balances the dark textures of the holsters and boots.
* **Ambient Base:** Low-intensity ambient light (`#080812`, intensity `0.45`) ensuring deep shadows without crushed blacks on her face mesh.

### 3.2 Post-Processing Stack (`@react-three/postprocessing`)
1. **Unreal Bloom:**
   - Threshold: `0.75` | Intensity: `1.25` | Radius: `0.85`
   - Amplifies emissive elements, glowing holographic grids, and crimson highlights.
2. **Chromatic Aberration:**
   - Offset: `[0.0015, 0.0015]`
   - Subtle tactical lens dispersion around screen perimeters.
3. **Scanlines & CRT Grain:**
   - Custom screen-space shader applying faint horizontal lines (opacity: `0.06`) and micro-film grain to mimic a tactical heads-up display.
4. **Vignette:**
   - Darkness: `0.6` | Offset: `0.25`
   - Focuses operator attention squarely on Ada's portrait.

---

## 4. `adawong.glb` Character Rigging & Animation Specs

### 4.1 Model Mesh Composition
* **Face Mesh (`mesh4_...pl0100_00Face_BM_0`):** Contains head, eyes, and mouth geometry.
* **Hair Mesh (`mesh11_...pl0100_31SideHair_BM_0`):** Signature fringe and bob cut.
* **Dress & Gear (`mesh1_...pl1200_11nuno_BM_0`, `mesh10_...Acc`):** Crimson tactical dress, belts, and holsters.

### 4.2 Skeletal Animation Mapping (220 Joints)
* **Gaze Tracking Bone:** `bone23_022` (Head Joint, Node 104) and `bone22_01` (Neck Joint, Node 105).
  - Rotates dynamically to follow cursor screen coordinates using `Quaternion.slerp(targetQuat, 0.08)`.
* **Breathing Simulation:** Sine-wave translation applied to spine bone `bone21_00` and model root.
* **Lip-Sync Animation:**
  - **Option A (Morph Targets):** Driven if blendshapes (`jawOpen`, `mouthSmile`) are baked into `mesh4`.
  - **Option B (Skeletal):** Driven by modulating jaw-region child bones attached to `bone23_022`.

---

## 5. Tactical HUD Layout Specification

```
+-------------------------------------------------------------------------+
| [ADA // STATUS: ACTIVE]    [SPEECH: LISTENING]    [LATENCY: 42ms] [EXIT] |
+-----------------------+---------------------------------+---------------+
| 📊 TELEMETRY          |                                 | 💬 COMMS LOG  |
| - CPU: 18%  [====   ] |          3D HOLOGRAPHIC         | User: "Status"|
| - RAM: 8.4GB [====== ]|          VIEWPORT OF            | Ada: "Ready.  |
| - GPU: 34%  [===    ] |          ADA WONG               |  What is our  |
| - TEMP: 48°C          |         (adawong.glb)           |  next target?"|
|                       |                                 |               |
| ⚙️ ACTIVE DIRECTIVES  |    (Audio-reactive lip-sync,    | [TOOL CALL]   |
| [X] Vision Mode       |     bone23_022 gaze tracking)   | > Web Search  |
| [ ] Auto Briefing     |                                 |               |
+-----------------------+---------------------------------+---------------+
| ──/\__/\_/\/\__ (Real-time Audio Visualizer Waveform) ───────────────── |
| [🎤 MUTE]    [✋ INTERRUPT]    [🖥️ SCREEN SHARE]    [📂 INTEL DRAWER]   |
+-------------------------------------------------------------------------+
```

### 5.1 HUD Micro-Interactions
* **Status Glow Transitions:**
  - `LISTENING`: Gentle cyan neon pulse.
  - `THINKING`: Fast flickering amber alert pulse.
  - `SPEAKING`: Vibrant scarlet pulse synced to vocal amplitude.
* **Instant Interruption Button:** Stamped with hazard stripes; hovering glows intense crimson. Clicking instantly halts playback and clears audio buffers (`stopAndFlush`).
* **Slide-out Intel Drawer:** Slides out smoothly from the screen bottom with `backdrop-blur-md` to reveal rich search tables, code snippets, or vision captures without obstructing Ada's face.

### 5.2 Left-Sidebar Settings Menu & Customization HUD (`TelemetryPanel.jsx`)
* **Navigation Rail Integration:**
  - Dedicated `SETTINGS` tab button with gear icon (`⚙`) placed in the tactical tab rail alongside `SYS`, `DOSSIER`, `INTEL`, `MEMORY`, `PLUGINS`.
  - Secondary top-header shortcut button (`⚙`) for instant drawer-style toggling.
* **Operative Identity Form Controls:**
  - `Name to Call` field: Monospace high-contrast input styled with `JetBrains Mono`, cyan focus ring (`#00F0FF`), and glowing placeholder text.
  - Role & Clearance inputs: Subdued dark backgrounds (`rgba(0,0,0,0.4)`), carbon borders (`rgba(255,255,255,0.1)`).
  - Tactical Directives textarea: Auto-expanding cyber input area for behavioral instructions.
* **Vocal Core Selector Chips (Gemini Prebuilt Voices):**
  - Interactive chip buttons for `Aoede`, `Charon`, `Fenrir`, `Kore`, `Puck`.
  - Inactive state: Dark carbon background (`rgba(255,255,255,0.03)`), muted text (`#7E859E`).
  - Active state: Cyber Cyan border (`#00F0FF`), glowing background (`rgba(0,240,255,0.15)`), active pulse dot, bold text.
* **Action & Save State Feedback:**
  - "SAVE & DEPLOY TO CORE" button styled in Syndicate Crimson (`#FF003C`) with glowing hover states (`shadow-[0_0_15px_rgba(255,0,60,0.4)]`).
  - Instant visual confirmation badge and real-time notification push to the Comms Log.

---

## 6. Glassmorphism Design System & Floating HUD Architecture

### 6.1 Universal Glassmorphic Formula
All tactical modals and floating panels adhere to a unified cybernetic glass standard:
- **Surface:** `bg-[rgba(8,12,18,0.55)]` (55% opacity dark carbon) or `bg-[rgba(8,12,18,0.35)]` for high-translucency HUD buttons.
- **Backdrop Filters:** `backdrop-blur-xl backdrop-saturate-150` for realistic chromatic light transmission from the 3D stage.
- **Perimeter Edge:** `border border-[rgba(0,229,255,0.25)]` with subtle cyan glow drop `shadow-[0_0_40px_rgba(0,229,255,0.12)]`.
- **Specular Highlight:** `inset_0_1px_0_rgba(255,255,255,0.06)` generating a crisp glass-beveled edge along top borders.

### 6.2 Floating Non-Blocking Panels
- **Floating Systems Panel (`TelemetryPanel.jsx`):** Anchored at `fixed top-18 left-6 bottom-28 w-88 sm:w-96 z-30`. Toggled from top-left `[ 📊 SYSTEMS ]` button. Features multi-tab tactical navigation (SYS, DOSSIER, INTEL, MEMORY, PLUGINS, MATRIX), smooth sci-fi shutter entry/exit (`scifi-modal-unfold-down` / `scifi-modal-collapse-up`), close button, and `Escape` hotkey.
- **Floating Comms Log (`CommsLog.jsx`):** Anchored at `fixed top-18 right-6 bottom-28 w-88 sm:w-96 z-30`. Toggled from top-right `[ 📟 COMMS LOG ]` button. Zero background mask or blur overlay, maintaining uninterrupted visibility of the 3D Arc Reactor Orb.
- **Top-Right Control Cluster:** Camera zoom (`[+]`, `[-]`, `[⟳]`) and Comms Log toggle buttons with `bg-[rgba(8,12,18,0.35)] backdrop-blur-xl backdrop-saturate-150` glassmorphism.
- **Edge-to-Edge Directive Input:** Transparent, borderless input with standard 2px electric aqua underline (`border-b-2 border-[rgba(0,229,255,0.25)]`), focus glow, and borderless send action.
- **Neural Memory Vault (`SciFiMemoryVaultModal.jsx`):** Modal with search filter, category tabs, and deep decryption bridge to `SciFiMemoryModal.jsx`.


