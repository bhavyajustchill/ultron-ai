"use client";

import React, { useState } from "react";
import { Download, Pin, Square, SquareCheck, Trash2, X } from "lucide-react";
import { dangerButton, ghostButton } from "@/components/HUD/MemoryVault/vaultUi";
import { durationLabel, sessionDateLabel } from "./sessionUi";

export function SessionBulkBar({ ids, onPin, onDelete, onSelectAll, onClear, busy }) {
  const [confirming, setConfirming] = useState(false);
  const count = ids.length;
  const query = `ids=${encodeURIComponent(ids.join(","))}`;
  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 chamfer-sm border border-[rgba(var(--jarvis-accent-rgb),0.4)] bg-[rgba(var(--jarvis-accent-rgb),0.08)] text-[10px] font-mono" data-testid="sessions-bulk-bar">
      <span className="text-[var(--jarvis-accent)] font-bold mr-1">{count} SELECTED</span>
      <button type="button" className={ghostButton} disabled={busy} onClick={() => onPin(true)}>PIN</button>
      <button type="button" className={ghostButton} disabled={busy} onClick={() => onPin(false)}>UNPIN</button>
      <a className={ghostButton} href={`/api/sessions?export=md&${query}`} download>
        <Download className="w-3 h-3" /> .MD
      </a>
      <a className={ghostButton} href={`/api/sessions?export=json&${query}`} download>
        <Download className="w-3 h-3" /> .JSON
      </a>
      <button
        type="button"
        disabled={busy}
        className={confirming ? `${dangerButton} bg-[#FF003C] text-white animate-pulse` : dangerButton}
        onClick={() => {
          if (!confirming) return setConfirming(true);
          setConfirming(false);
          onDelete();
        }}
        onBlur={() => setConfirming(false)}>
        <Trash2 className="w-3 h-3" />
        {confirming ? `DELETE ${count}?` : "DELETE"}
      </button>
      <span className="ml-auto flex items-center gap-1">
        <button type="button" className="text-[#9E8B65] hover:text-[var(--jarvis-accent)] cursor-pointer px-1" onClick={onSelectAll}>ALL SHOWN</button>
        <button type="button" className="text-[#9E8B65] hover:text-white cursor-pointer p-0.5" onClick={onClear} title="Clear selection">
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    </div>
  );
}

const badge = "px-1 chamfer-xs border font-semibold";

export function SessionRow({ session, active, checked, isNextGreeting, onOpen, onToggleCheck }) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-session-id={session.id}
      onClick={() => onOpen(session)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(session);
        }
      }}
      className={`group flex gap-2.5 p-2.5 chamfer-md border transition-all cursor-pointer outline-none ${
        active
          ? "border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.1)] shadow-[0_0_16px_rgba(var(--jarvis-accent-rgb),0.18)]"
          : "border-[rgba(var(--jarvis-accent-rgb),0.16)] bg-[rgba(24,18,5,0.7)] hover:border-[rgba(var(--jarvis-accent-rgb),0.5)] focus-visible:border-[var(--jarvis-accent)]"
      }`}>
      <button
        type="button"
        aria-label={checked ? "Deselect" : "Select"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleCheck(session.id);
        }}
        className={`self-start mt-0.5 cursor-pointer ${checked ? "text-[var(--jarvis-accent)]" : "text-[#665E4B] group-hover:text-[#9E8B65]"}`}>
        {checked ? <SquareCheck className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-[9px] font-mono flex-wrap">
          {session.live && <span className={`${badge} text-[#2BFFA3] border-[#2BFFA3]/50 bg-[#2BFFA3]/10 animate-pulse`}>LIVE</span>}
          {isNextGreeting && <span className={`${badge} text-[var(--jarvis-accent)] border-[rgba(var(--jarvis-accent-rgb),0.45)] bg-[rgba(var(--jarvis-accent-rgb),0.1)]`}>NEXT GREETING</span>}
          {session.pinned && <Pin className="w-3 h-3 text-[var(--jarvis-accent)] fill-[var(--jarvis-accent)]" aria-label="Pinned" />}
          {!session.summary && <span className={`${badge} text-[#9E8B65] border-[#9E8B65]/30`}>NO RECAP</span>}
          {session.relevance !== undefined && (
            <span className={`${badge} border-[rgba(var(--jarvis-accent-rgb),0.3)] text-[var(--jarvis-accent-soft)]`}>{Math.round(session.relevance * 100)}% MATCH</span>
          )}
          <span className="ml-auto text-[#9E8B65]">{sessionDateLabel(session.started_at)}</span>
        </div>
        <p className="text-xs font-bold text-[#F0F2F8] truncate">{session.title}</p>
        <p className="text-[11px] text-[#D4CCBA] leading-relaxed line-clamp-2 break-words">
          {session.match?.snippet || session.summary || session.preview || "No recap yet."}
        </p>
        <span className="text-[9px] text-[#9E8B65] font-mono">
          {durationLabel(session.duration_ms)} · {session.turn_count} turn{session.turn_count === 1 ? "" : "s"}
          {session.language ? ` · ${session.language}` : ""}
          {session.match?.where === "transcript" ? ` · ${session.match.count} match${session.match.count === 1 ? "" : "es"} in transcript` : ""}
        </span>
      </div>
    </div>
  );
}
