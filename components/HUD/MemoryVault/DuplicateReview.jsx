"use client";

import React, { useEffect, useState } from "react";
import { Layers, Merge, X } from "lucide-react";
import { formatDate, ghostButton, inputClass, recordTag, solidButton } from "./vaultUi";

/**
 * One group of memories that say nearly the same thing: choose the one to keep (its wording can
 * be edited), and merge the rest into it.
 */
function DuplicateGroup({ group, busy, onMerge, onDismiss }) {
  const longest = [...group.memories].sort((a, b) => (b.content || "").length - (a.content || "").length)[0];
  const [keepId, setKeepId] = useState(longest?.id);
  const [text, setText] = useState(longest?.content || "");
  useEffect(() => {
    setText(group.memories.find((m) => m.id === keepId)?.content || "");
  }, [keepId, group.memories]);

  return (
    <div className="p-2.5 chamfer-md border border-[rgba(var(--jarvis-accent-rgb),0.25)] bg-[rgba(24,18,5,0.7)] flex flex-col gap-2" data-testid="vault-duplicate-group">
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-[var(--jarvis-accent)] font-bold">{group.memories.length} RECORDS · {Math.round(group.similarity * 100)}% ALIKE</span>
        <button type="button" onClick={onDismiss} className="text-[#9E8B65] hover:text-white cursor-pointer flex items-center gap-1" title="Not duplicates">
          <X className="w-3 h-3" /> NOT DUPLICATES
        </button>
      </div>
      {group.memories.map((m) => (
        <label key={m.id} className={`flex gap-2 p-2 chamfer-sm border cursor-pointer text-xs ${keepId === m.id ? "border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.08)]" : "border-white/5"}`}>
          <input type="radio" name={`keep-${group.memories[0].id}`} checked={keepId === m.id} onChange={() => setKeepId(m.id)} className="mt-0.5 accent-[var(--jarvis-accent)]" />
          <span className="flex-1 min-w-0">
            <span className="block text-[#F0F2F8] leading-relaxed break-words">{m.content}</span>
            <span className="block text-[9px] text-[#9E8B65] font-mono mt-0.5">
              {recordTag(m.id)} · {m.category} · {m.importance} · {formatDate(m.timestamp)}
            </span>
          </span>
        </label>
      ))}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} aria-label="Merged wording" className={`${inputClass} w-full p-2 resize-y`} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={solidButton}
          disabled={busy || !text.trim()}
          onClick={() => onMerge({ keep_id: keepId, remove_ids: group.memories.map((m) => m.id).filter((id) => id !== keepId), content: text.trim() })}>
          <Merge className="w-3.5 h-3.5" /> MERGE INTO ONE
        </button>
        <span className="text-[9px] text-[#9E8B65] font-mono">Keeps the strongest importance and any pin · undoable</span>
      </div>
    </div>
  );
}

/**
 * Right-hand pane in duplicates mode.
 */
export function DuplicateReview({ state, busy, onMerge, onDismiss, onClose }) {
  return (
    <div className="flex flex-col gap-2.5 h-full min-h-0" data-testid="vault-duplicates">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--jarvis-accent)] font-mono">
          <Layers className="w-3.5 h-3.5" /> POSSIBLE DUPLICATES
        </span>
        <button type="button" className={ghostButton} onClick={onClose}>DONE</button>
      </div>
      <p className="text-[10px] text-[#9E8B65] font-mono -mt-1">
        {state.loading
          ? "Comparing every memory..."
          : state.error
            ? state.error
            : `Compared by ${state.mode === "meaning" ? "meaning (Gemini embeddings) and wording" : "wording (connect a Gemini key to compare by meaning)"}.`}
      </p>
      <div className="flex flex-col gap-2.5 overflow-y-auto min-h-0 pr-1">
        {!state.loading && !state.error && state.groups.length === 0 && (
          <p className="text-xs text-[#9E8B65] italic font-mono py-6 text-center">No duplicates found. The vault is tidy.</p>
        )}
        {state.groups.map((group) => (
          <DuplicateGroup key={group.memories.map((m) => m.id).join("|")} group={group} busy={busy} onMerge={onMerge} onDismiss={() => onDismiss(group)} />
        ))}
      </div>
    </div>
  );
}
