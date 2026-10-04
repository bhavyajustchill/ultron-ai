"use client";

import React, { useEffect, useState } from "react";
import { Check, Copy, Pin, PinOff, Save, Sparkles, Trash2, Undo2 } from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_STYLE,
  CONTEXT_LABEL,
  CONTEXT_STYLE,
  IMPORTANCE,
  IMPORTANCE_STYLE,
  chipClass,
  contextExplanation,
  dangerButton,
  formatDate,
  ghostButton,
  inputClass,
  recordTag,
  solidButton,
  sourceLabel,
} from "./vaultUi";

const MAX_CHARS = 2000;

/**
 * Right-hand pane: edits one memory, or writes a new one when `memory` is null.
 * Category, importance, and pin apply at once on an existing memory; text changes wait for Save
 * (Ctrl+Enter).
 */
export function MemoryEditor({ memory, limit, busy, onCreate, onUpdate, onDelete, onCancelNew }) {
  const isNew = !memory;
  const [content, setContent] = useState(memory?.content || "");
  const [category, setCategory] = useState(memory?.category || "tactical");
  const [importance, setImportance] = useState(memory?.importance || "medium");
  const [pinned, setPinned] = useState(Boolean(memory?.pinned));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  // Follow the selected record's saved state field by field, so applying a chip never wipes
  // unsaved text
  useEffect(() => setConfirmDelete(false), [memory?.id]);
  useEffect(() => setContent(memory?.content || ""), [memory?.id, memory?.content]);
  useEffect(() => setCategory(memory?.category || "tactical"), [memory?.id, memory?.category]);
  useEffect(() => setImportance(memory?.importance || "medium"), [memory?.id, memory?.importance]);
  useEffect(() => setPinned(Boolean(memory?.pinned)), [memory?.id, memory?.pinned]);

  const textDirty = !isNew && content.trim() !== (memory.content || "").trim();
  const canSave = content.trim().length > 0 && content.length <= MAX_CHARS && !busy && (isNew || textDirty);

  const save = () => {
    if (!canSave) return;
    if (isNew) onCreate({ content: content.trim(), category, importance, pinned });
    else onUpdate(memory.id, { content: content.trim() });
  };

  // Chips apply immediately on an existing memory
  const applyField = (field, value, setter) => {
    setter(value);
    if (!isNew && memory[field] !== value) onUpdate(memory.id, { [field]: value });
  };

  return (
    <div className="flex flex-col gap-3 h-full min-h-0" data-testid="vault-editor">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--jarvis-accent)] font-mono">
          {isNew ? <Sparkles className="w-3.5 h-3.5" /> : null}
          {isNew ? "NEW MEMORY" : recordTag(memory.id)}
        </span>
        {!isNew && (
          <span className={`px-1.5 py-0.5 chamfer-xs border text-[9px] font-mono font-semibold ${CONTEXT_STYLE[memory.context || "recall"]}`}>
            {CONTEXT_LABEL[memory.context || "recall"]}
            {memory.context === "prompt" ? ` · SLOT ${memory.slot}/${limit}` : ""}
          </span>
        )}
      </div>

      {!isNew && <p className="text-[10px] text-[#7E859E] font-mono leading-relaxed -mt-1">{contextExplanation(memory, limit)}</p>}

      <div className="flex flex-col gap-1">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              save();
            }
          }}
          aria-label="Memory text"
          placeholder="A fact, preference, or goal Jarvis should carry between conversations..."
          rows={isNew ? 5 : 6}
          autoFocus={isNew}
          className={`${inputClass} w-full p-2.5 leading-relaxed resize-y min-h-[96px] max-h-[40vh]`}
        />
        <div className="flex items-center justify-between text-[9px] font-mono text-[#7E859E]">
          <span>{isNew ? "Ctrl+Enter saves" : textDirty ? "Unsaved text · Ctrl+Enter saves" : "Edit the text to change it"}</span>
          <span className={content.length > MAX_CHARS ? "text-[#FF003C]" : ""}>{content.length}/{MAX_CHARS}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 text-[10px] font-mono">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[#7E859E] w-[78px]">CATEGORY</span>
          {CATEGORIES.map((c) => (
            <button type="button" key={c} disabled={busy} onClick={() => applyField("category", c, setCategory)} className={chipClass(category === c, CATEGORY_STYLE[c].replace(/border-\S+/, ""))}>
              {c}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[#7E859E] w-[78px]">IMPORTANCE</span>
          {IMPORTANCE.map((imp) => (
            <button type="button" key={imp} disabled={busy} onClick={() => applyField("importance", imp, setImportance)} className={chipClass(importance === imp, IMPORTANCE_STYLE[imp])}>
              {imp}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[#7E859E] w-[78px]">CONTEXT</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyField("pinned", !pinned, setPinned)}
            aria-pressed={pinned}
            className={pinned ? `${solidButton} py-0.5` : `${ghostButton} py-0.5`}>
            {pinned ? <Pin className="w-3 h-3 fill-current" /> : <PinOff className="w-3 h-3" />}
            {pinned ? "PINNED · ALWAYS IN CONTEXT" : "PIN TO CONTEXT"}
          </button>
        </div>
      </div>

      {!isNew && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 p-2.5 chamfer-sm border border-white/5 bg-[rgba(2,8,14,0.6)] text-[10px] font-mono">
          <dt className="text-[#7E859E]">SOURCE</dt>
          <dd className="text-[#F0F2F8] truncate">{sourceLabel(memory.source)}</dd>
          <dt className="text-[#7E859E]">REMEMBERED</dt>
          <dd className="text-[#F0F2F8]">{formatDate(memory.timestamp, true)}</dd>
          <dt className="text-[#7E859E]">LAST EDITED</dt>
          <dd className="text-[#F0F2F8]">{memory.updatedAt ? formatDate(memory.updatedAt, true) : "never"}</dd>
          <dt className="text-[#7E859E]">ID</dt>
          <dd className="text-[#7E859E] truncate select-all">{memory.id}</dd>
        </dl>
      )}

      <div className="mt-auto flex items-center gap-2 pt-2 border-t border-white/5 flex-wrap">
        {isNew ? (
          <>
            <button type="button" className={solidButton} disabled={!canSave} onClick={save}>
              <Check className="w-3.5 h-3.5" /> SAVE TO VAULT
            </button>
            <button type="button" className={ghostButton} onClick={onCancelNew}>CANCEL</button>
          </>
        ) : (
          <>
            <button type="button" className={solidButton} disabled={!canSave} onClick={save}>
              <Save className="w-3.5 h-3.5" /> SAVE TEXT
            </button>
            {textDirty && (
              <button type="button" className={ghostButton} onClick={() => setContent(memory.content || "")}>
                <Undo2 className="w-3 h-3" /> REVERT
              </button>
            )}
            <button
              type="button"
              className={ghostButton}
              onClick={() => {
                navigator.clipboard?.writeText(memory.content || "").then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }).catch(() => {});
              }}>
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? "COPIED" : "COPY"}
            </button>
            <button
              type="button"
              disabled={busy}
              className={confirmDelete ? `${dangerButton} ml-auto bg-[#FF003C] text-white animate-pulse` : `${dangerButton} ml-auto`}
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                onDelete(memory.id);
              }}
              onBlur={() => setConfirmDelete(false)}>
              <Trash2 className="w-3 h-3" /> {confirmDelete ? "CONFIRM DELETE" : "DELETE"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
