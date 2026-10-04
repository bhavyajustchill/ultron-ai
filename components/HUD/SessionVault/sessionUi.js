/**
 * Labels for the session archive panel (Phase 11.2).
 */

export function sessionDateLabel(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  const today = new Date();
  const days = Math.round((new Date(today).setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / 86400000);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  return `${date.toLocaleDateString([], { day: "numeric", month: "short", ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) })} ${time}`;
}

export function durationLabel(ms) {
  const minutes = Math.round((ms || 0) / 60000);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function bytesLabel(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function greetingLabel(session, isNext) {
  if (isNext) return "Jarvis will bring this up in his next greeting.";
  if (session.greeting === "skip") return "Jarvis will not bring this up.";
  if (session.greeting === "mentioned") return `Mentioned in a greeting${session.mentioned_at ? ` on ${new Date(session.mentioned_at).toLocaleDateString()}` : ""}.`;
  if (!session.summary) return "No recap to mention yet.";
  return "Not next: only the newest recap (or one you queue) is mentioned.";
}
