/**
 * Shared labels and colours for the memory vault manager (Phase 10.2). Status colours (amber,
 * red) are never themed; everything accent-coloured uses the theme variables.
 */

export const CATEGORIES = ["tactical", "preference", "mission", "profile"];
export const IMPORTANCE = ["low", "medium", "high", "critical"];

export const CATEGORY_STYLE = {
  mission: "bg-[rgba(var(--jarvis-accent-rgb),0.15)] text-[var(--jarvis-accent)] border-[rgba(var(--jarvis-accent-rgb),0.4)]",
  preference: "bg-[rgba(255,128,149,0.15)] text-[#FF8095] border-[rgba(255,128,149,0.4)]",
  tactical: "bg-[rgba(255,230,0,0.12)] text-[#FFE600] border-[rgba(255,230,0,0.35)]",
  profile: "bg-[rgba(240,242,248,0.08)] text-[#F0F2F8] border-[rgba(240,242,248,0.3)]",
};

export const IMPORTANCE_STYLE = {
  critical: "bg-[#FF003C] text-white shadow-[0_0_10px_rgba(255,0,60,0.6)]",
  high: "bg-[#FFE600] text-black shadow-[0_0_8px_rgba(255,230,0,0.5)]",
  medium: "bg-[var(--jarvis-accent)] text-[#010e16] shadow-[0_0_8px_rgba(var(--jarvis-accent-rgb),0.5)]",
  low: "bg-[#7E859E] text-[#010e16]",
};

// Where a memory came from, in plain words
export function sourceLabel(source) {
  if (!source || source === "operative_dialog") return "Jarvis, in conversation";
  if (source === "operator_console") return "You, in the vault";
  if (source === "system_bootstrap") return "System starter";
  if (source === "import") return "Imported";
  return source;
}

export function sourceKind(source) {
  if (!source || source === "operative_dialog") return "jarvis";
  if (source === "operator_console") return "you";
  if (source === "system_bootstrap") return "system";
  if (source === "import") return "import";
  return "other";
}

export const CONTEXT_LABEL = {
  prompt: "IN CONTEXT",
  recall: "ON RECALL",
  muted: "MUTED",
};

export const CONTEXT_STYLE = {
  prompt: "text-[var(--jarvis-accent)] border-[rgba(var(--jarvis-accent-rgb),0.45)] bg-[rgba(var(--jarvis-accent-rgb),0.1)]",
  recall: "text-[#7E859E] border-[rgba(126,133,158,0.35)] bg-transparent",
  muted: "text-[#FFB020] border-[rgba(255,176,32,0.4)] bg-[rgba(255,176,32,0.08)]",
};

export function contextExplanation(memory, limit) {
  if (memory.context === "prompt") {
    return `In Jarvis's context: slot ${memory.slot} of ${limit}. He knows this from the first word of every conversation.`;
  }
  if (memory.context === "muted") return "Held back while humour is switched off in Settings.";
  return `On recall: listed by topic only; Jarvis looks it up when it becomes relevant. Pin it to keep it in context.`;
}

export const recordTag = (id) => `SEC-REC-${String(id || "00").slice(-4).toUpperCase()}`;

export function formatDate(iso, withTime = false) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { month: "short", day: "numeric", year: "numeric" });
}

// Small chip button used for categories and importance
export function chipClass(active, activeStyle) {
  return `px-2 py-0.5 chamfer-xs uppercase font-mono text-[10px] transition-all cursor-pointer border ${
    active ? `${activeStyle} font-bold border-transparent` : "border-[rgba(var(--jarvis-accent-rgb),0.2)] text-[#7E859E] hover:text-[var(--jarvis-accent)]"
  }`;
}

export const inputClass =
  "bg-[rgba(1,10,16,0.95)] border border-[rgba(var(--jarvis-accent-rgb),0.3)] chamfer-sm text-xs font-mono text-[#F0F2F8] placeholder-[rgba(126,133,158,0.6)] outline-none focus:border-[var(--jarvis-accent)] focus:shadow-[0_0_10px_rgba(var(--jarvis-accent-rgb),0.2)] transition-all";

export const ghostButton =
  "flex items-center gap-1.5 px-2.5 py-1 chamfer-btn text-[10px] font-mono font-semibold border border-[rgba(var(--jarvis-accent-rgb),0.3)] bg-[rgba(var(--jarvis-accent-rgb),0.06)] text-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.18)] transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none";

export const solidButton =
  "flex items-center gap-1.5 px-3 py-1 chamfer-btn text-[11px] font-mono font-bold bg-[var(--jarvis-accent)] text-[#010e16] hover:brightness-110 shadow-[0_0_10px_rgba(var(--jarvis-accent-rgb),0.3)] transition-all cursor-pointer disabled:opacity-30 disabled:pointer-events-none";

export const dangerButton =
  "flex items-center gap-1.5 px-2.5 py-1 chamfer-btn text-[10px] font-mono font-semibold border border-[rgba(255,0,60,0.4)] text-[#FF8095] hover:bg-[rgba(255,0,60,0.15)] transition-all cursor-pointer disabled:opacity-30";
