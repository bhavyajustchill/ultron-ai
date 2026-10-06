"use client";

import { useEffect, useRef } from "react";

const stack = [];

if (typeof window !== "undefined") {
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && stack.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        const topHandler = stack[stack.length - 1];
        if (typeof topHandler === "function") {
          topHandler();
        }
      }
    },
    true // Capture phase to intercept before bubbling listeners
  );
}

export function pushEscHandler(handler) {
  stack.push(handler);
  return () => {
    const idx = stack.lastIndexOf(handler);
    if (idx !== -1) {
      stack.splice(idx, 1);
    }
  };
}

export function useEscapeKey(isOpen, onEscape) {
  const onEscapeRef = useRef(onEscape);
  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = () => {
      onEscapeRef.current?.();
    };
    return pushEscHandler(handler);
  }, [isOpen]);
}
