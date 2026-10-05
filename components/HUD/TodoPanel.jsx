"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { GripHorizontal, ListChecks, X } from "lucide-react";
import { useJarvisStore } from "@/lib/store";
import { useIsCompact } from "@/hooks/useIsPhone";
import { TodoList } from "@/components/HUD/TodoList";

// Default spot on desktop: the top right, clear of the Systems / Comms Log stack on the left
const RIGHT_MARGIN = 24;

/**
 * TASKS panel (Phase 15): the operator's to-do list. On desktop it floats and can be dragged by its
 * header; in the compact layout (below 1024px) it opens under the top controls in place of the
 * Systems / Comms Log stack, one panel at a time (app/page.jsx), full width on phones.
 */
export function TodoPanel() {
  const { isTodoOpen, setIsTodoOpen, todoCounts, loadTodos } = useJarvisStore();
  const isCompact = useIsCompact();

  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);
  const panelRef = useRef(null);
  const dragStartRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const [position, setPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Fresh list each time the panel opens
  useEffect(() => {
    if (isTodoOpen) loadTodos();
  }, [isTodoOpen, loadTodos]);

  // First desktop opening: top right, inside the screen
  useEffect(() => {
    if (isTodoOpen && !isCompact && position === null) {
      const panelWidth = panelRef.current?.offsetWidth || 384;
      setPosition({ x: Math.max(10, window.innerWidth - RIGHT_MARGIN - panelWidth), y: 72 });
    }
  }, [isTodoOpen, isCompact, position]);

  // Smooth Shutter Close
  const triggerClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsTodoOpen(false);
      setIsClosing(false);
    }, 220); // Matches 0.22s scifi-modal-collapse-up keyframe
  }, [isClosing, setIsTodoOpen]);

  // External close (the TASKS button, or another panel taking the compact slot)
  useEffect(() => {
    const handleExternalClose = () => {
      if (isTodoOpen) triggerClose();
    };
    window.addEventListener("jarvis-close-tasks", handleExternalClose);
    return () => window.removeEventListener("jarvis-close-tasks", handleExternalClose);
  }, [isTodoOpen, triggerClose]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isTodoOpen) triggerClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTodoOpen, triggerClose]);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Desktop dragging by the header
  const handlePointerDown = (e) => {
    if (isCompact) return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (e.target.closest("button") || e.target.closest("input")) return;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position?.x ?? 10,
      posY: position?.y ?? 72,
    };
    setIsDragging(true);

    const onPointerMove = (moveEvent) => {
      const dx = moveEvent.clientX - dragStartRef.current.startX;
      const dy = moveEvent.clientY - dragStartRef.current.startY;
      const panelWidth = panelRef.current?.offsetWidth || 384;
      const panelHeight = panelRef.current?.offsetHeight || 440;
      const maxX = Math.max(10, window.innerWidth - panelWidth - 10);
      const maxY = Math.max(10, window.innerHeight - panelHeight - 10);
      setPosition({
        x: Math.min(Math.max(10, dragStartRef.current.posX + dx), maxX),
        y: Math.min(Math.max(10, dragStartRef.current.posY + dy), maxY),
      });
    };

    const onPointerUp = () => {
      setIsDragging(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  if (!isTodoOpen && !isClosing) return null;

  const floating = !isCompact && position;

  return (
    <aside
      ref={panelRef}
      aria-label="Task List"
      style={floating ? { left: `${position.x}px`, top: `${position.y}px`, transition: isDragging ? "none" : "box-shadow 0.2s ease" } : undefined}
      className={`fixed ${floating ? "z-35" : "z-30 top-18 right-6 max-lg:top-[calc(env(safe-area-inset-top)_+_3.5rem)] max-lg:h-[55dvh] max-lg:max-h-none max-sm:left-3 max-sm:right-3 max-sm:w-auto max-sm:max-w-none"
        } h-[44vh] max-h-[440px] w-88 sm:w-96 max-w-[calc(100vw-3rem)] flex flex-col bg-[rgba(15,12,5,0.55)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(var(--jarvis-accent-rgb),0.25)] shadow-[0_0_40px_rgba(var(--jarvis-accent-rgb),0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden text-[#F0F2F8] font-mono select-none pointer-events-auto p-3.5 gap-2.5 ${isDragging ? "shadow-[0_0_50px_rgba(var(--jarvis-accent-rgb),0.25)] border-[rgba(var(--jarvis-accent-rgb),0.5)]" : ""
        } ${isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"}`}>
      {/* Top Accent Gradient Line */}
      <div className="mx-4 mt-1 h-0.5 w-[calc(100%-32px)] bg-gradient-to-r from-[var(--jarvis-accent)] via-[var(--jarvis-accent-soft)] to-[var(--jarvis-accent)] animate-pulse shrink-0" />

      {/* Header (drag handle on desktop) */}
      <div
        onPointerDown={handlePointerDown}
        className={`flex items-center justify-between border-b border-[rgba(var(--jarvis-accent-rgb),0.18)] pb-2 shrink-0 ${isCompact ? "" : "touch-none cursor-grab active:cursor-grabbing"}`}>
        <div className="flex items-center gap-2 pointer-events-none min-w-0">
          {!isCompact && <GripHorizontal className="w-3.5 h-3.5 text-[var(--jarvis-accent)]/60 shrink-0" />}
          <div className="p-1 chamfer-xs bg-[rgba(var(--jarvis-accent-rgb),0.1)] border border-[rgba(var(--jarvis-accent-rgb),0.3)] shadow-[0_0_8px_rgba(var(--jarvis-accent-rgb),0.25)] shrink-0">
            <ListChecks className="w-3.5 h-3.5 text-[var(--jarvis-accent)]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-['Orbitron',sans-serif] font-bold tracking-wider text-[var(--jarvis-accent)] flex items-center gap-1.5">
              TASK LIST
              <span className="text-[9px] font-mono px-1.5 py-0.2 chamfer-xs bg-[rgba(var(--jarvis-accent-rgb),0.15)] border border-[rgba(var(--jarvis-accent-rgb),0.3)] text-[var(--jarvis-accent)] font-bold whitespace-nowrap">
                {todoCounts.open} OPEN
              </span>
            </span>
            <span className="text-[9px] font-mono tracking-wider text-[#9E8B65] uppercase truncate">
              {todoCounts.doing ? `${todoCounts.doing} in progress · ` : ""}
              {todoCounts.done} done
            </span>
          </div>
        </div>

        <button
          onClick={triggerClose}
          className="p-1.5 chamfer-btn border border-transparent hover:border-[rgba(var(--jarvis-accent-rgb),0.3)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.1)] text-[#9E8B65] hover:text-[var(--jarvis-accent)] transition-all cursor-pointer shrink-0"
          title="Close Task List (Esc)">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <TodoList />
    </aside>
  );
}

export default TodoPanel;
