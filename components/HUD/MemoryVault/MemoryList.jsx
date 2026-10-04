"use client";

import React, { useState } from "react";
import { Pin, Square, SquareCheck, Trash2, X } from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_STYLE,
  CONTEXT_LABEL,
  CONTEXT_STYLE,
  IMPORTANCE,
  dangerButton,
  formatDate,
  ghostButton,
  inputClass,
  recordTag,
} from "./vaultUi";

/**
 * Bulk actions for the checked memories.
 */
export function BulkBar({ count, onPin, onCategory, onImportance, onDelete, onSelectAll, onClear, busy }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1.5 p-2 chamfer-sm border border-[rgba(var(--jarvis-accent-rgb),0.4)] bg-[rgba(var(--jarvis-accent-rgb),0.08)] text-[10px] font-mono" data-testid="vault-bulk-bar">
      <span className="text-[var(--jarvis-accent)] font-bold mr-1">{count} SELECTED</span>
      <button type="button" className={ghostButton} disabled={busy} onClick={() => onPin(true)}>PIN</button>
      <button type="button" className={ghostButton} disabled={busy} onClick={() => onPin(false)}>UNPIN</button>
      <select aria-label="Set category" disabled={busy} value="" onChange={(e) => e.target.value && onCategory(e.target.value)} className={`${inputClass} py-0.5 px-1 text-[10px] uppercase cursor-pointer`}>
        <option value="">CATEGORY…</option>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select aria-label="Set importance" disabled={busy} value="" onChange={(e) => e.target.value && onImportance(e.target.value)} className={`${inputClass} py-0.5 px-1 text-[10px] uppercase cursor-pointer`}>
        <option value="">IMPORTANCE…</option>
        {IMPORTANCE.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
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
        <button type="button" className="text-[#7E859E] hover:text-[var(--jarvis-accent)] cursor-pointer px-1" onClick={onSelectAll}>ALL SHOWN</button>
        <button type="button" className="text-[#7E859E] hover:text-white cursor-pointer p-0.5" onClick={onClear} title="Clear selection">
          <X className="w-3.5 h-3.5" />
        </button>
      </span>
    </div>
  );
}

/**
 * One memory in the list.
 */
export function MemoryRow({ memory, active, checked, onOpen, onToggleCheck }) {
  const category = (memory.category || "tactical").toLowerCase();
  const importance = (memory.importance || "medium").toLowerCase();
  const context = memory.context || "recall";
  return (
    <div
      role="button"
      tabIndex={0}
      data-memory-id={memory.id}
      onClick={() => onOpen(memory)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(memory);
        }
      }}
      className={`group flex gap-2.5 p-2.5 chamfer-md border transition-all cursor-pointer outline-none ${
        active
          ? "border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.1)] shadow-[0_0_16px_rgba(var(--jarvis-accent-rgb),0.18)]"
          : "border-[rgba(var(--jarvis-accent-rgb),0.16)] bg-[rgba(4,16,25,0.7)] hover:border-[rgba(var(--jarvis-accent-rgb),0.5)] focus-visible:border-[var(--jarvis-accent)]"
      }`}>
      <button
        type="button"
        aria-label={checked ? "Deselect" : "Select"}
        onClick={(e) => {
          e.stopPropagation();
          onToggleCheck(memory.id);
        }}
        className={`self-start mt-0.5 cursor-pointer ${checked ? "text-[var(--jarvis-accent)]" : "text-[#4A5068] group-hover:text-[#7E859E]"}`}>
        {checked ? <SquareCheck className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 text-[9px] font-mono flex-wrap">
          {memory.pinned && <Pin className="w-3 h-3 text-[var(--jarvis-accent)] fill-[var(--jarvis-accent)]" aria-label="Pinned" />}
          <span className={`px-1.5 chamfer-xs uppercase border font-semibold ${CATEGORY_STYLE[category] || CATEGORY_STYLE.tactical}`}>{category}</span>
          {importance === "critical" && <span className="px-1 chamfer-xs font-bold text-[#FF003C] border border-[#FF003C]/40 bg-[#FF003C]/10">CRITICAL</span>}
          {importance === "high" && <span className="px-1 chamfer-xs font-bold text-[#FFE600] border border-[#FFE600]/40 bg-[#FFE600]/10">HIGH</span>}
          {importance === "low" && <span className="px-1 chamfer-xs text-[#7E859E] border border-[#7E859E]/30">LOW</span>}
          <span className={`px-1 chamfer-xs border font-semibold ${CONTEXT_STYLE[context]}`} title={context === "prompt" ? `Context slot ${memory.slot}` : undefined}>
            {CONTEXT_LABEL[context]}
            {context === "prompt" && memory.slot ? ` #${memory.slot}` : ""}
          </span>
          {memory.relevance !== undefined && (
            <span className="px-1 chamfer-xs border border-[rgba(var(--jarvis-accent-rgb),0.3)] text-[var(--jarvis-accent-soft)]">{Math.round(memory.relevance * 100)}% MATCH</span>
          )}
          <span className="ml-auto text-[#7E859E]">{formatDate(memory.timestamp)}</span>
        </div>
        <p className="text-xs text-[#F0F2F8] leading-relaxed line-clamp-2 break-words">{memory.content}</p>
        <span className="text-[9px] text-[#4A5068] font-mono">{recordTag(memory.id)}</span>
      </div>
    </div>
  );
}
