"use client";

import React, { useEffect, useRef, useState } from "react";
import { ClipboardList, Copy, Loader2, X } from "lucide-react";
import { useJarvisStore } from "@/lib/store";

/**
 * Clipboard intelligence panel (Phase 8.13): when the operator copies text (and has switched the
 * watcher on in Settings), a small card offers Translate / Summarise / Explain / Fix. Nothing is
 * sent anywhere until a button is clicked; secrets are filtered out by the server.
 */

const POLL_MS = 1500;
const AUTO_HIDE_MS = 10000;
const ACTIONS = [
  ["translate", "TRANSLATE"],
  ["summarize", "SUMMARISE"],
  ["explain", "EXPLAIN"],
  ["fix", "FIX"],
];
const SPOKEN = {
  translate: "Read the translation aloud if it is short; otherwise say it is on the HUD.",
  summarize: "Say the summary in a sentence or two.",
  explain: "Give the gist of the explanation in a sentence or two.",
  fix: "Say in one short sentence that the corrected text is copied back to the clipboard.",
};

export function ClipboardPanel() {
  const watching = useJarvisStore((state) => state.operatorProfile?.clipboardWatch === true);
  const status = useJarvisStore((state) => state.status);
  const userApiKey = useJarvisStore((state) => state.userApiKey);
  const [clip, setClip] = useState(null); // { text, chars }
  const [busy, setBusy] = useState(null);
  const [result, setResult] = useState(null); // { mode, text, copied }
  const [hovered, setHovered] = useState(false);
  const hashRef = useRef(null);
  const hideTimerRef = useRef(null);

  useEffect(() => {
    if (!watching) {
      hashRef.current = null;
      setClip(null);
      return undefined;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const primed = hashRef.current !== null;
        const res = await fetch(`/api/clipboard?${primed ? `since=${encodeURIComponent(hashRef.current)}` : "prime=1"}`);
        const data = await res.json();
        if (cancelled || !data.success) return;
        hashRef.current = data.hash || "";
        if (data.changed && data.text) {
          setClip({ text: data.text, chars: data.chars });
          setResult(null);
        }
      } catch {
        // Server busy: try again next tick
      }
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [watching]);

  // Auto-hide an untouched card; a result or the pointer keeps it open
  useEffect(() => {
    clearTimeout(hideTimerRef.current);
    if (clip && !result && !busy && !hovered) hideTimerRef.current = setTimeout(() => setClip(null), AUTO_HIDE_MS);
    return () => clearTimeout(hideTimerRef.current);
  }, [clip, result, busy, hovered]);

  if (!clip) return null;

  const runAction = async (mode) => {
    setBusy(mode);
    try {
      const res = await fetch("/api/clipboard", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-gemini-api-key": userApiKey || "" },
        body: JSON.stringify({ action: "process", mode, text: clip.text }),
      });
      const data = await res.json();
      if (!data.success) {
        setResult({ mode, text: data.message, error: true });
        return;
      }
      if (data.hash) hashRef.current = data.hash; // our own write is not a new copy
      setResult({ mode, text: data.result, copied: data.copied });
      if (status !== "DISCONNECTED") {
        window.dispatchEvent(
          new CustomEvent("jarvis-notify", {
            detail: { text: `[CLIPBOARD] The operator used ${mode.toUpperCase()} on text they copied; the result is shown on the HUD: "${data.result.slice(0, 1500)}". ${SPOKEN[mode]}` },
          })
        );
      }
    } finally {
      setBusy(null);
    }
  };

  const copyResult = () =>
    fetch("/api/clipboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "copy", text: result.text }) })
      .then((res) => res.json())
      .then((data) => {
        if (data.hash) hashRef.current = data.hash;
        setResult((current) => ({ ...current, copied: true }));
      });

  return (
    <div
      role="dialog"
      aria-label="Clipboard actions"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[80] w-[min(560px,calc(100vw-32px))] flex flex-col gap-2 p-3 chamfer-md bg-[rgba(15,12,5,0.92)] border border-[rgba(var(--jarvis-accent-rgb),0.35)] shadow-[0_0_30px_rgba(var(--jarvis-accent-rgb),0.15)] font-mono text-[#F0F2F8] backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-['Orbitron',sans-serif] font-bold tracking-wider text-[var(--jarvis-accent)]">
          <ClipboardList className="w-3.5 h-3.5" /> CLIPBOARD · {clip.chars} CHARS
        </span>
        <button type="button" aria-label="Dismiss" onClick={() => setClip(null)} className="p-0.5 text-[#9E8B65] hover:text-white cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[11px] text-[#CBC6B9] line-clamp-2 break-words">{clip.text}</p>
      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => runAction(mode)}
            className="flex items-center gap-1 px-2.5 py-1 chamfer-btn text-[10px] font-bold border border-[rgba(var(--jarvis-accent-rgb),0.3)] bg-[rgba(var(--jarvis-accent-rgb),0.06)] text-[var(--jarvis-accent-soft)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.18)] disabled:opacity-50 cursor-pointer disabled:cursor-wait">
            {busy === mode && <Loader2 className="w-3 h-3 animate-spin" />} {label}
          </button>
        ))}
      </div>
      {result && (
        <div className={`flex flex-col gap-1.5 p-2 chamfer-sm border ${result.error ? "border-[rgba(255,0,60,0.35)] text-[#FF8095]" : "border-white/10 text-[#F0F2F8]"} bg-black/40`}>
          <pre className="text-[11px] whitespace-pre-wrap break-words max-h-48 overflow-y-auto select-text">{result.text}</pre>
          {!result.error && (
            <div className="flex items-center justify-end gap-2 text-[9px] text-[#9E8B65]">
              {result.copied ? (
                <span>Copied to the clipboard</span>
              ) : (
                <button type="button" onClick={copyResult} className="flex items-center gap-1 px-2 py-0.5 chamfer-btn border border-white/10 hover:border-[var(--jarvis-accent)] text-[#CBC6B9] cursor-pointer">
                  <Copy className="w-3 h-3" /> COPY
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ClipboardPanel;
