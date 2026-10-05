"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, ListChecks, Pause, Play, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useJarvisStore } from "@/lib/store";

const MAX_TODO_CHARS = 200;
const NOTICE_MS = 6000;

const pad = (n) => String(n).padStart(2, "0");
// "14:05" for today, "12 Oct" before that
function shortWhen(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (date.toDateString() === new Date().toDateString()) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * The to-do list body (Phase 15): add box, open tasks (in progress first), and finished tasks under
 * DONE. Shared by the TASKS panel; the `todo_list` live tool changes the same list.
 */
export function TodoList() {
  const { todos, todoCounts, todoAction } = useJarvisStore();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [notice, setNotice] = useState(null); // { text, tone, undoId }
  const noticeTimerRef = useRef(null);
  const addInputRef = useRef(null);

  useEffect(() => () => clearTimeout(noticeTimerRef.current), []);

  const showNotice = (text, extra = {}) => {
    clearTimeout(noticeTimerRef.current);
    setNotice({ text, ...extra });
    noticeTimerRef.current = setTimeout(() => setNotice(null), NOTICE_MS);
  };

  // Runs an action and reports a failure in the notice line
  const act = async (action, payload, { success } = {}) => {
    const result = await todoAction(action, payload);
    if (!result.success) showNotice(result.message, { tone: "error" });
    else if (success) success(result);
    return result;
  };

  const handleAdd = async (e) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await act("add", { items: [text] }, {
      success: (result) => {
        if (!result.added?.length) showNotice(`"${text}" is already on the list.`);
      },
    });
    addInputRef.current?.focus();
  };

  const startEdit = (todo) => {
    setEditingId(todo.id);
    setEditText(todo.text);
  };

  const saveEdit = async () => {
    const id = editingId;
    const text = editText.trim();
    setEditingId(null);
    const current = todos.find((t) => t.id === id);
    if (!current || !text || text === current.text) return;
    await act("rename", { id, text });
  };

  const removeTask = (todo) =>
    act("remove", { id: todo.id }, { success: (result) => showNotice(`Removed "${todo.text}".`, { undoId: result.undo_id }) });

  const clearDone = () =>
    act("clear_done", {}, {
      success: (result) => result.undo_id && showNotice(`Cleared ${todoCounts.done} finished task${todoCounts.done === 1 ? "" : "s"}.`, { undoId: result.undo_id }),
    });

  const undo = async (undoId) => {
    setNotice(null);
    await act("restore", { undo_id: undoId });
  };

  const open = todos.filter((t) => t.status !== "done");
  const done = todos.filter((t) => t.status === "done");

  const renderText = (todo) =>
    editingId === todo.id ? (
      <input
        autoFocus
        value={editText}
        maxLength={MAX_TODO_CHARS}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={saveEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            saveEdit();
          } else if (e.key === "Escape") {
            // Cancel the edit without closing the panel
            e.stopPropagation();
            setEditingId(null);
          }
        }}
        aria-label="Edit task"
        className="flex-1 min-w-0 bg-[rgba(255,255,255,0.04)] border border-[var(--jarvis-accent)] chamfer-xs px-2 py-1 text-xs font-mono text-[#F0F2F8] focus:outline-none"
      />
    ) : (
      <button
        type="button"
        onClick={() => startEdit(todo)}
        title="Tap to edit"
        className={`flex-1 min-w-0 text-left text-xs leading-snug break-words select-text cursor-text py-1 ${todo.status === "done" ? "line-through text-[#9E8B65]" : "text-[#F0F2F8]"
          }`}>
        {todo.text}
      </button>
    );

  const iconButton = "p-1.5 chamfer-xs border border-transparent text-[#9E8B65] transition-all cursor-pointer shrink-0";

  return (
    <div className="flex-1 flex flex-col gap-2.5 min-h-0">
      {/* Add box (at the top, so a phone keyboard never covers it) */}
      <form onSubmit={handleAdd} className="flex items-center gap-1.5 shrink-0">
        <input
          ref={addInputRef}
          type="text"
          value={draft}
          maxLength={MAX_TODO_CHARS}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a task... [Enter]"
          aria-label="New task"
          className="flex-1 min-w-0 bg-[rgba(255,255,255,0.03)] border border-[rgba(var(--jarvis-accent-rgb),0.2)] chamfer-xs px-2.5 py-1.5 text-xs font-mono text-[#F0F2F8] focus:outline-none focus:border-[var(--jarvis-accent)] placeholder:text-[#9E8B65]/70"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="px-2.5 py-1.5 chamfer-btn bg-[var(--jarvis-accent)] hover:bg-[var(--jarvis-accent-soft)] text-black font-bold text-xs font-mono transition-all disabled:opacity-40 cursor-pointer flex items-center gap-1 shadow-[0_0_10px_rgba(var(--jarvis-accent-rgb),0.4)] shrink-0"
          title="Add task [Enter]">
          <Plus className="w-3.5 h-3.5" />
          <span>ADD</span>
        </button>
      </form>

      {notice && (
        <div
          role="status"
          className={`flex items-center gap-2 px-2.5 py-1.5 chamfer-xs border text-[10px] shrink-0 ${notice.tone === "error"
            ? "border-[rgba(255,0,60,0.35)] bg-[rgba(255,0,60,0.08)] text-[#FF8095]"
            : "border-[rgba(var(--jarvis-accent-rgb),0.3)] bg-[rgba(var(--jarvis-accent-rgb),0.08)] text-[#FFF8E7]"
            }`}>
          <span className="flex-1 min-w-0 break-words">{notice.text}</span>
          {notice.undoId && (
            <button
              type="button"
              onClick={() => undo(notice.undoId)}
              className="flex items-center gap-1 px-2 py-0.5 chamfer-xs border border-[var(--jarvis-accent)] text-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.15)] font-bold tracking-wider cursor-pointer shrink-0">
              <RotateCcw className="w-3 h-3" />
              UNDO
            </button>
          )}
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto pr-1 min-h-0">
        {open.map((todo) => {
          const doing = todo.status === "doing";
          return (
            <div
              key={todo.id}
              className={`flex items-start gap-1.5 px-2 py-1 chamfer-sm border transition-all ${doing
                ? "border-l-2 border-l-[var(--jarvis-accent)] border-[rgba(var(--jarvis-accent-rgb),0.35)] bg-[rgba(var(--jarvis-accent-rgb),0.08)] shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.1)]"
                : "border-[rgba(var(--jarvis-accent-rgb),0.15)] bg-[rgba(15,12,5,0.55)] hover:border-[rgba(var(--jarvis-accent-rgb),0.35)]"
                }`}>
              <button
                type="button"
                onClick={() => act("status", { id: todo.id, status: "done" })}
                className="group w-6 h-6 shrink-0 flex items-center justify-center cursor-pointer"
                title="Mark done"
                aria-label={`Mark "${todo.text}" done`}>
                <span className="w-4 h-4 chamfer-xs border border-[rgba(var(--jarvis-accent-rgb),0.55)] group-hover:border-[var(--jarvis-accent)] group-hover:bg-[rgba(var(--jarvis-accent-rgb),0.2)] transition-all" />
              </button>
              <div className="flex-1 min-w-0 flex flex-col">
                {renderText(todo)}
                {doing && editingId !== todo.id && (
                  <span className="text-[9px] tracking-wider text-[var(--jarvis-accent)] font-bold pb-0.5">IN PROGRESS</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => act("status", { id: todo.id, status: doing ? "todo" : "doing" })}
                className={`${iconButton} ${doing ? "text-[var(--jarvis-accent)]" : ""} hover:text-[var(--jarvis-accent)] hover:border-[rgba(var(--jarvis-accent-rgb),0.3)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.1)]`}
                title={doing ? "Pause (back to to-do)" : "Start (in progress)"}
                aria-label={doing ? `Pause "${todo.text}"` : `Start "${todo.text}"`}>
                {doing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => removeTask(todo)}
                className={`${iconButton} hover:text-[#FF8095] hover:border-[rgba(255,0,60,0.3)] hover:bg-[rgba(255,0,60,0.1)]`}
                title="Remove task"
                aria-label={`Remove "${todo.text}"`}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}

        {todos.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[#9E8B65] italic text-xs">
            <ListChecks className="w-6 h-6 opacity-40 text-[var(--jarvis-accent)] mb-2" />
            <span>No tasks yet.</span>
            <span className="text-[10px] opacity-75 mt-0.5">Type one above, or say &quot;add buy milk to my list&quot;.</span>
          </div>
        )}

        {todos.length > 0 && open.length === 0 && (
          <div className="text-center py-3 text-[10px] text-[#9E8B65] italic">Everything is done.</div>
        )}

        {/* Finished tasks */}
        {done.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between border-t border-[rgba(var(--jarvis-accent-rgb),0.15)] pt-2">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="flex items-center gap-1 text-[10px] font-bold tracking-wider text-[#9E8B65] hover:text-[var(--jarvis-accent)] cursor-pointer"
                aria-expanded={showDone}>
                {showDone ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                DONE ({done.length})
              </button>
              <button
                type="button"
                onClick={clearDone}
                className="text-[9px] px-1.5 py-0.5 chamfer-xs border border-[rgba(255,255,255,0.1)] text-[#9E8B65] hover:text-[#FF8095] hover:border-[rgba(255,0,60,0.3)] tracking-wider cursor-pointer"
                title="Remove all finished tasks (undoable)">
                CLEAR DONE
              </button>
            </div>
            {showDone &&
              done.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-start gap-1.5 px-2 py-1 chamfer-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
                  <button
                    type="button"
                    onClick={() => act("status", { id: todo.id, status: "todo" })}
                    className="w-6 h-6 shrink-0 flex items-center justify-center cursor-pointer"
                    title="Not done yet (reopen)"
                    aria-label={`Reopen "${todo.text}"`}>
                    <span className="w-4 h-4 chamfer-xs border border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.25)] text-[var(--jarvis-accent)] flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  </button>
                  {renderText(todo)}
                  <span className="text-[9px] text-[#9E8B65] opacity-75 pt-2 shrink-0">{shortWhen(todo.done_at)}</span>
                  <button
                    type="button"
                    onClick={() => removeTask(todo)}
                    className={`${iconButton} hover:text-[#FF8095] hover:border-[rgba(255,0,60,0.3)] hover:bg-[rgba(255,0,60,0.1)]`}
                    title="Remove task"
                    aria-label={`Remove "${todo.text}"`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TodoList;
