# Universal AI Agent & IDE Workspace Configuration — Project J.A.R.V.I.S Mark II

## 1. System Context Routing & Knowledge Mesh

> [!IMPORTANT]
> You must strictly index, ingest, and follow the specialized context, design, and architecture files located in the `docs/` directory and root workspace before drafting implementation plans, writing code, or running terminal commands.

- **Product Requirements & Scope:** Link to [PRD.md](./docs/PRD.md)
- **System Architecture & Topology:** Link to [ARCHITECTURE.md](./docs/ARCHITECTURE.md)
- **Coding Guardrails & Stack Rules:** Link to [RULES.md](./docs/RULES.md)
- **Incremental Task Progression:** Link to [PHASES.md](./docs/PHASES.md)
- **UI Design & Cyberpunk Aesthetic:** Link to [DESIGN.md](./docs/DESIGN.md)
- **Persistent Session State Logging:** Link to [MEMORY.md](./docs/MEMORY.md)

---

## 2. Core Stack & Dialect Enforcement

All compatible AI agents must enforce these fundamental technical guardrails across every generated file:

1. **Framework:** **Next.js 16 (App Router + Turbopack)** with React 19.
2. **Language Dialect:** **Pure JavaScript & JSX exclusively (`.jsx`, `.js`)**.
   - Strictly **NO TypeScript / NO TSX** (`.ts`, `.tsx` files are forbidden).
   - Standard prop destructuring and optional JSDoc comments for types.
3. **3D Visual Core:** **React Three Fiber (R3F) + Three.js** rendering the interactive holographic Arc Reactor Orb (`ArcReactorOrb.jsx`).
   - Zero object instantiation (`Vector3`, `Euler`, `Matrix4`) inside `useFrame()`.
4. **Real-time Voice Core:** **Gemini 3.1 Multimodal Live WebSocket API** (`models/gemini-3.1-flash-live-preview`).
   - Browser mic downsampling: 48kHz ➔ 16kHz Int16 PCM via `AudioWorkletNode` (`audio-worklet-processor.js`).
   - Output playback: 24kHz raw PCM jitter-buffered gapless scheduling via `pcmPlayer.js`.
   - Default male voice core: **Charon** (Refined British timbre).
   - Instant barge-in: Call `stopAndFlush()` within 50ms upon user interruption.
5. **Aesthetics:** Cyberpunk Tactical HUD (Electric Aqua-Cyan `#00E5FF`, Neon Cyan `#00F0FF`, Carbon `#010E16`, Orbitron & JetBrains Mono fonts).

---

## 3. Multi-Platform Compatibility Triggers

This file acts as the universal system prompt layer. If platform-specific directory configurations are not manually injected, enforce these structural bounds across all compatible agent engines:

- **Google Antigravity:** Register these paths as the foundation for multi-agent workflows.
- **Cursor IDE:** Always apply these files across all global directory globs (`**/*`).
- **Claude Code / Anthropic CLI:** Treat this file as an extension of system-level directives.
- **GitHub Copilot / Workspace:** Use these rules to guide interactive chat panels and inline code completions.

---

## 4. Mandatory Agent Execution Protocols

### A. Phase-Driven Execution

- You are strictly forbidden from jumping ahead in features.
- Look at [PHASES.md](./docs/PHASES.md). Locate the item explicitly marked as active or current.
- Build and complete only the sub-tasks for that current phase. Do not write premature boilerplate for future phases.

### B. Interactive Planning Phase

- Before modifying, creating, or deleting files, you must output an **Implementation Plan**.
- Detail exactly which files you intend to touch and outline the logic changes.
- Pause and wait for explicit user confirmation before executing terminal tool updates or codebase edits.

### C. Persistent State Commit

- At the conclusion of every major feature block, script run, or bug fix, you must update [MEMORY.md](./docs/MEMORY.md).
- Log the active timestamp, completed tasks, and architectural decisions (following the `DEC-XXX` convention) so context remains intact when switching chats.

### D. Error Handling Safety Loop

- Implement a strict **3-Strike Protocol** during terminal or build failures:
  - **Strike 1:** Attempt to fix the compiler/runtime error directly based on the error output.
  - **Strike 2:** If it fails again, re-read [RULES.md](./docs/RULES.md) and [ARCHITECTURE.md](./docs/ARCHITECTURE.md) to check for stack/version conflicts.
  - **Strike 3:** If it fails a third time, halt execution immediately, do not loop, and prompt the user for guidance.
  <!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

