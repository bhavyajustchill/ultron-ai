"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Brain, Check, Copy, Download, Pin, PinOff, Play, RefreshCw, Save, Search, Trash2, Undo2 } from "lucide-react";
import { dangerButton, ghostButton, inputClass, solidButton } from "@/components/HUD/MemoryVault/vaultUi";
import { durationLabel, greetingLabel, sessionDateLabel } from "./sessionUi";

// Highlights every occurrence of `query` in `text`
function Highlighted({ text, query }) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts = [];
  let from = 0;
  for (let at = lower.indexOf(q); at >= 0; at = lower.indexOf(q, at + q.length)) {
    parts.push(text.slice(from, at), <mark key={at} className="bg-[rgba(255,230,0,0.35)] text-white px-0.5">{text.slice(at, at + q.length)}</mark>);
    from = at + q.length;
  }
  parts.push(text.slice(from));
  return parts;
}

/**
 * Right-hand pane: one conversation — title and recap (editable), greeting choice, actions, and
 * the transcript with find.
 */
export function SessionDetail({ session, detail, isNext, hasKey, busy, live, onUpdate, onRegenerate, onContinue, onToMemory, onDelete }) {
  const [title, setTitle] = useState(session.title);
  const [summary, setSummary] = useState(session.summary);
  const [find, setFind] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setTitle(session.title), [session.id, session.title]);
  useEffect(() => setSummary(session.summary), [session.id, session.summary]);
  useEffect(() => {
    setFind("");
    setConfirmDelete(false);
  }, [session.id]);

  const turns = detail?.turns || [];
  const matches = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? turns.filter((t) => t.text.toLowerCase().includes(q)).length : 0;
  }, [find, turns]);
  const summaryDirty = summary.trim() !== (session.summary || "").trim();
  const canRegenerate = hasKey && session.operator_turn_count >= 2 && turns.length > 0;
  const canContinue = !live && (turns.length > 0 || Boolean(session.summary));

  const saveTitle = () => {
    const next = title.trim();
    if (next && next !== session.title) onUpdate({ title: next });
    else setTitle(session.title);
  };

  const copyTranscript = () => {
    const text = turns.map((t) => `${t.role === "operator" ? "You" : "Jarvis"}: ${t.text}`).join("\n\n");
    navigator.clipboard
      ?.writeText(`${session.title}\n\n${session.summary ? `Recap: ${session.summary}\n\n` : ""}${text}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0" data-testid="session-detail">
      <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-[#7E859E]">
        <span>
          {sessionDateLabel(session.started_at)} · {durationLabel(session.duration_ms)} · {session.turn_count} turn{session.turn_count === 1 ? "" : "s"}
          {session.language ? ` · ${session.language}` : ""}
        </span>
        <span className="flex items-center gap-1">
          {live && <span className="px-1 chamfer-xs border text-[#2BFFA3] border-[#2BFFA3]/50 bg-[#2BFFA3]/10 font-semibold">LIVE</span>}
          {isNext && <span className="px-1 chamfer-xs border text-[var(--jarvis-accent)] border-[rgba(var(--jarvis-accent-rgb),0.45)] font-semibold">NEXT GREETING</span>}
        </span>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.stopPropagation();
            setTitle(session.title);
          }
        }}
        aria-label="Conversation title"
        maxLength={120}
        className={`${inputClass} w-full px-2.5 py-1.5 text-sm font-bold`}
      />

      <div className="flex flex-col gap-1">
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && summaryDirty) onUpdate({ summary: summary.trim() });
          }}
          aria-label="Recap"
          rows={3}
          maxLength={600}
          placeholder={session.operator_turn_count >= 2 ? "No recap yet: write one, or regenerate it." : "Too short to recap; write one if you like."}
          className={`${inputClass} w-full p-2.5 leading-relaxed resize-y min-h-[64px] max-h-[24vh]`}
        />
        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" className={solidButton} disabled={!summaryDirty || busy} onClick={() => onUpdate({ summary: summary.trim() })}>
            <Save className="w-3 h-3" /> SAVE RECAP
          </button>
          {summaryDirty && (
            <button type="button" className={ghostButton} onClick={() => setSummary(session.summary)}>
              <Undo2 className="w-3 h-3" /> REVERT
            </button>
          )}
          <button type="button" className={ghostButton} disabled={!canRegenerate || busy} onClick={onRegenerate} title={hasKey ? "Write the title and recap again from the transcript" : "Needs a Gemini API key"}>
            <RefreshCw className="w-3 h-3" /> REGENERATE
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 p-2 chamfer-sm border border-white/5 bg-[rgba(2,8,14,0.6)] text-[10px] font-mono flex-wrap">
        <span className="text-[#7E859E] flex-1 min-w-[180px]">{greetingLabel(session, isNext)}</span>
        {isNext ? (
          <button type="button" className={ghostButton} disabled={busy} onClick={() => onUpdate({ greeting: "skip" })}>
            <BellOff className="w-3 h-3" /> DON&apos;T MENTION
          </button>
        ) : (
          <button type="button" className={ghostButton} disabled={busy || !session.summary || live} onClick={() => onUpdate({ greeting: "queued" })}>
            <Bell className="w-3 h-3" /> MENTION NEXT TIME
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <button type="button" className={solidButton} disabled={!canContinue || busy} onClick={onContinue} data-testid="session-continue" title={live ? "This is the conversation happening now" : "Re-link Jarvis with this conversation's last turns and recap"}>
          <Play className="w-3 h-3" /> CONTINUE
        </button>
        <button type="button" className={ghostButton} disabled={!session.summary || busy} onClick={onToMemory} title="Save the recap as a long-term memory">
          <Brain className="w-3 h-3" /> SAVE TO MEMORY
        </button>
        <button type="button" className={session.pinned ? `${solidButton} py-1` : ghostButton} disabled={busy} onClick={() => onUpdate({ pinned: !session.pinned })} aria-pressed={session.pinned} title="Pinned conversations are never removed by retention">
          {session.pinned ? <Pin className="w-3 h-3 fill-current" /> : <PinOff className="w-3 h-3" />} {session.pinned ? "PINNED" : "PIN"}
        </button>
        <button type="button" className={ghostButton} disabled={!turns.length} onClick={copyTranscript}>
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? "COPIED" : "COPY"}
        </button>
        <a className={ghostButton} href={`/api/sessions?export=md&ids=${encodeURIComponent(session.id)}`} download>
          <Download className="w-3 h-3" /> .MD
        </a>
        <button
          type="button"
          disabled={busy || live}
          className={confirmDelete ? `${dangerButton} ml-auto bg-[#FF003C] text-white animate-pulse` : `${dangerButton} ml-auto`}
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            onDelete();
          }}
          onBlur={() => setConfirmDelete(false)}>
          <Trash2 className="w-3 h-3" /> {confirmDelete ? "CONFIRM DELETE" : "DELETE"}
        </button>
      </div>

      {/* Transcript */}
      <div className="flex flex-col gap-2 min-h-[160px] flex-1 border-t border-white/5 pt-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[var(--jarvis-accent)] font-mono">TRANSCRIPT</span>
          <div className="relative flex-1">
            <Search className="w-3 h-3 absolute left-2 top-1.5 text-[#7E859E]" />
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find in transcript..." aria-label="Find in transcript" className={`${inputClass} w-full pl-6 pr-2 py-0.5 text-[10px]`} />
          </div>
          {find.trim() && <span className="text-[9px] text-[#7E859E] font-mono shrink-0" data-testid="transcript-matches">{matches} TURN{matches === 1 ? "" : "S"}</span>}
        </div>
        <div className="flex flex-col gap-1.5 overflow-y-auto min-h-0 pr-1" data-testid="session-transcript">
          {!detail ? (
            <p className="text-[10px] text-[#7E859E] font-mono">Loading...</p>
          ) : turns.length === 0 ? (
            <p className="text-[10px] text-[#7E859E] font-mono italic">
              {session.turn_count ? "Transcript not kept (recap-only mode was on). The recap above is what remains." : "Nothing said yet."}
            </p>
          ) : (
            turns.map((t, i) => (
              <div key={i} className={`max-w-[88%] px-2.5 py-1.5 chamfer-sm text-[11px] leading-relaxed break-words ${t.role === "operator" ? "self-end bg-[rgba(var(--jarvis-accent-rgb),0.12)] border border-[rgba(var(--jarvis-accent-rgb),0.3)]" : "self-start bg-[rgba(255,255,255,0.04)] border border-white/10"}`}>
                <span className="block text-[8px] font-mono text-[#7E859E] mb-0.5">
                  {t.role === "operator" ? "YOU" : "JARVIS"} · {new Date(t.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <Highlighted text={t.text} query={find.trim()} />
              </div>
            ))
          )}
          {live && <p className="text-[9px] text-[#7E859E] font-mono italic">Recording: new turns reach the archive every few exchanges and when the link closes.</p>}
        </div>
      </div>
    </div>
  );
}
