"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Terminal, User, Bot, Info, Send, CornerDownLeft, X, Trash2 } from "lucide-react";
import { useAdaStore } from "@/lib/store";
import { MarkdownText } from "@/components/HUD/MarkdownText";

export function CommsLog({ sendTextMessage }) {
  const { isCommsLogOpen, setIsCommsLogOpen, commsLog } = useAdaStore();

  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);

  const scrollRef = useRef(null);
  const [message, setMessage] = useState("");
  const inputRef = useRef(null);

  // Auto-scroll on new comms message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [commsLog, isCommsLogOpen]);

  // Smooth Shutter Close
  const triggerClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsCommsLogOpen(false);
      setIsClosing(false);
    }, 220); // Matches 0.22s scifi-modal-collapse-up keyframe
  }, [isClosing, setIsCommsLogOpen]);

  // Listen for external close toggle event (e.g. from top header button)
  useEffect(() => {
    const handleExternalClose = () => {
      if (isCommsLogOpen) {
        triggerClose();
      }
    };
    window.addEventListener("ada-close-comms", handleExternalClose);
    return () => window.removeEventListener("ada-close-comms", handleExternalClose);
  }, [isCommsLogOpen, triggerClose]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isCommsLogOpen) {
        triggerClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCommsLogOpen, triggerClose]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    if (sendTextMessage) {
      sendTextMessage(trimmed);
      setMessage("");
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isCommsLogOpen && !isClosing) return null;

  return (
    <aside
      className={`fixed top-18 right-6 h-[44vh] max-h-[440px] w-88 sm:w-96 max-w-[calc(100vw-3rem)] z-30 flex flex-col bg-[rgba(15,12,5,0.65)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(255,184,0,0.25)] shadow-[0_0_40px_rgba(255,184,0,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden text-[#F0F2F8] font-mono select-none pointer-events-auto p-3.5 ${
        isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"
      }`}>
      {/* Top Accent Gradient Line */}
      <div className="mx-4 mt-1 h-0.5 w-[calc(100%-32px)] bg-gradient-to-r from-[#CC8800] via-[#FFB800] to-[#CC8800] animate-pulse shrink-0" />

      {/* Header */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-[rgba(255,184,0,0.18)] shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 chamfer-xs bg-[rgba(255,184,0,0.1)] border border-[rgba(255,184,0,0.3)] shadow-[0_0_8px_rgba(255,184,0,0.25)]">
            <Terminal className="w-3.5 h-3.5 text-[#FFB800]" />
          </div>
          <span className="text-xs font-bold font-['Orbitron',sans-serif] tracking-wider text-[#FFB800] flex items-center gap-1.5">
            COMMS LOG FEED
            <span className="text-[9px] font-mono px-1.5 py-0.2 chamfer-xs bg-[rgba(255,184,0,0.15)] border border-[rgba(255,184,0,0.3)] text-[#FFB800] font-bold">
              {commsLog.length}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={triggerClose}
            className="p-1 chamfer-xs border border-transparent hover:border-[rgba(255,184,0,0.3)] hover:bg-[rgba(255,184,0,0.1)] text-[#9E8B65] hover:text-[#FFB800] transition-all cursor-pointer"
            title="Close Comms Log (Esc)">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Transcript Feed (Scrollable) */}
      <div
        ref={scrollRef}
        className="flex-1 flex flex-col gap-2.5 p-3 font-mono text-xs overflow-y-auto pr-1.5 min-h-0">
        {commsLog.map((item) => {
          const isJarvis = item.sender === "jarvis" || item.sender === "ada";
          const isUser = item.sender === "user";
          const isSystem = item.sender === "system";

          return (
            <div
              key={item.id}
              className={`p-2.5 chamfer-sm border transition-all ${
                isJarvis
                  ? "bg-[rgba(255,184,0,0.06)] border-l-2 border-l-[#FFB800] border-[rgba(255,184,0,0.25)] shadow-[0_0_12px_rgba(255,184,0,0.08)]"
                  : isUser
                    ? "bg-[rgba(255,150,0,0.08)] border-l-2 border-l-[#FFAA00] border-[rgba(255,150,0,0.25)]"
                    : "bg-[rgba(255,255,255,0.03)] border-l-2 border-l-[#9E8B65] border-[rgba(255,255,255,0.1)]"
              }`}>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  {isJarvis && (
                    <>
                      <Bot className="w-3 h-3 text-[#FFB800]" />
                      <span className="text-[#FFB800] tracking-wider">JARVIS // ASSISTANT</span>
                    </>
                  )}
                  {isUser && (
                    <>
                      <User className="w-3 h-3 text-[#FFD54F]" />
                      <span className="text-[#FFD54F] tracking-wider">OPERATOR</span>
                    </>
                  )}
                  {isSystem && (
                    <>
                      <Terminal className="w-3 h-3 text-[#9E8B65]" />
                      <span className="text-[#9E8B65] tracking-wider">SYSTEM</span>
                    </>
                  )}
                </div>
                <span className="text-[9px] text-[#9E8B65] opacity-75">{item.time}</span>
              </div>

              {/* Message Payload Body */}
              <div
                className={`leading-relaxed text-xs break-words select-text ${
                  isJarvis ? "text-[#F0F2F8]" : isUser ? "text-[#FFF8E7]" : "text-[#9E8B65]"
                }`}>
                <MarkdownText content={item.text} isAda={isJarvis} />
              </div>
            </div>
          );
        })}

        {commsLog.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-[#9E8B65] italic text-xs font-mono">
            <Terminal className="w-6 h-6 opacity-40 text-[#FFB800] mb-2" />
            <span>Encrypted comms feed active.</span>
            <span className="text-[10px] opacity-75 mt-0.5">
              Speak aloud or type a directive to begin.
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}

export default CommsLog;

