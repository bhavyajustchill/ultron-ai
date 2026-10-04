"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Undo2, X } from "lucide-react";

const TOAST_MS = 10000;

/**
 * Toast state for the vault panels: showToast(message, { undoId?, tone? }) shows it for 10 s.
 */
export function useVaultToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);
  const showToast = useCallback((message, extra = {}) => {
    clearTimeout(timerRef.current);
    setToast({ message, ...extra });
    timerRef.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  const clearToast = useCallback(() => setToast(null), []);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return { toast, showToast, clearToast };
}

/**
 * Bottom-centre notice with an optional UNDO (memory vault and session archive).
 */
export function VaultToast({ toast, onUndo, onDismiss }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      data-testid="vault-toast"
      className={`absolute bottom-14 left-1/2 -translate-x-1/2 max-w-[90%] flex items-center gap-3 px-3.5 py-2 chamfer-sm border text-[11px] shadow-[0_8px_30px_rgba(0,0,0,0.5)] bg-[rgba(21,16,4,0.97)] ${
        toast.tone === "error" ? "border-[rgba(255,0,60,0.5)] text-[#FF8095]" : "border-[rgba(var(--jarvis-accent-rgb),0.5)] text-[#F0F2F8]"
      }`}>
      <span>{toast.message}</span>
      {toast.undoId && (
        <button
          type="button"
          className="flex items-center gap-1 font-bold text-[var(--jarvis-accent)] hover:text-white cursor-pointer shrink-0"
          onClick={() => {
            const id = toast.undoId;
            onDismiss();
            onUndo(id);
          }}>
          <Undo2 className="w-3 h-3" /> UNDO
        </button>
      )}
      <button type="button" className="text-[#9E8B65] hover:text-white cursor-pointer shrink-0" onClick={onDismiss} aria-label="Dismiss">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
