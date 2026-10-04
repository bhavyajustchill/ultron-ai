"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { GripHorizontal, X } from "lucide-react";

/**
 * Draggable glass HUD window shared by the media deck panels: viewport-bounded pointer
 * dragging, sci-fi shutter open / close animations, Escape to close.
 */
export function FloatingPanel({ title, subtitle, icon: Icon, onClose, initialPosition, widthClass, headerActions, children }) {
  const panelRef = useRef(null);
  const dragStartRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const closeTimerRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (position === null) setPosition(initialPosition());
  }, [position, initialPosition]);

  const triggerClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 220); // matches scifi-modal-collapse-up
  }, [isClosing, onClose]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") triggerClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [triggerClose]);

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  const handlePointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (e.target.closest("button") || e.target.closest("input")) return;
    dragStartRef.current = { startX: e.clientX, startY: e.clientY, posX: position?.x ?? 0, posY: position?.y ?? 0 };
    setIsDragging(true);

    const onPointerMove = (move) => {
      const width = panelRef.current?.offsetWidth || 440;
      const height = panelRef.current?.offsetHeight || 400;
      setPosition({
        x: Math.min(Math.max(10, dragStartRef.current.posX + move.clientX - dragStartRef.current.startX), Math.max(10, window.innerWidth - width - 10)),
        y: Math.min(Math.max(10, dragStartRef.current.posY + move.clientY - dragStartRef.current.startY), Math.max(10, window.innerHeight - height - 10)),
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

  return (
    <aside
      ref={panelRef}
      aria-label={title}
      style={position ? { left: `${position.x}px`, top: `${position.y}px`, transition: isDragging ? "none" : "box-shadow 0.2s ease" } : { visibility: "hidden" }}
      className={`fixed z-40 ${widthClass} max-w-[calc(100vw-2rem)] flex flex-col bg-[rgba(15,12,5,0.62)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(var(--jarvis-accent-rgb),0.25)] shadow-[0_0_40px_rgba(var(--jarvis-accent-rgb),0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden text-[#F0F2F8] font-mono select-none pointer-events-auto p-3.5 gap-2.5 ${isDragging ? "shadow-[0_0_50px_rgba(var(--jarvis-accent-rgb),0.25)] border-[rgba(var(--jarvis-accent-rgb),0.5)]" : ""} ${isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"}`}>
      <div className="mx-4 mt-1 h-0.5 w-[calc(100%-32px)] bg-gradient-to-r from-[var(--jarvis-accent)] via-[var(--jarvis-accent-soft)] to-[var(--jarvis-accent)] animate-pulse shrink-0" />

      <div
        onPointerDown={handlePointerDown}
        className="flex items-center justify-between border-b border-[rgba(var(--jarvis-accent-rgb),0.18)] pb-2 shrink-0 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2 min-w-0 pointer-events-none">
          <GripHorizontal className="w-3.5 h-3.5 text-[var(--jarvis-accent)]/60 shrink-0" />
          <div className="p-1 chamfer-xs bg-[rgba(var(--jarvis-accent-rgb),0.1)] border border-[rgba(var(--jarvis-accent-rgb),0.3)] shadow-[0_0_8px_rgba(var(--jarvis-accent-rgb),0.25)] shrink-0">
            <Icon className="w-3.5 h-3.5 text-[var(--jarvis-accent)]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-['Orbitron',sans-serif] font-bold tracking-wider text-[var(--jarvis-accent)] truncate">{title}</span>
            <span className="text-[9px] font-mono tracking-wider text-[#9E8B65] uppercase truncate">{subtitle}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0" onPointerDown={(e) => e.stopPropagation()}>
          {headerActions}
          <button
            onClick={triggerClose}
            className="p-1.5 chamfer-btn border border-transparent hover:border-[rgba(var(--jarvis-accent-rgb),0.3)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.1)] text-[#9E8B65] hover:text-[var(--jarvis-accent)] transition-all cursor-pointer"
            title="Close (Esc)">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {children}
    </aside>
  );
}

export default FloatingPanel;
