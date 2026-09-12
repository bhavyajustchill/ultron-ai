"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { Terminal, User, Bot, Info, Send, CornerDownLeft, X, Trash2 } from "lucide-react";
import { useAdaStore } from "@/lib/store";
import { MarkdownText } from "@/components/HUD/MarkdownText";

export function CommsLog({ sendTextMessage }) {
  const { commsLog } = useAdaStore();
  const scrollRef = useRef(null);

  // Auto-scroll on new comms message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [commsLog]);

  return (
    <aside
      className="w-full flex-1 min-h-0 flex flex-col bg-[rgba(15,12,5,0.65)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(255,184,0,0.25)] shadow-[0_0_40px_rgba(255,184,0,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden text-[#F0F2F8] font-mono select-none pointer-events-auto p-3 gap-2">
      {/* Top Accent Gradient Line */}
      <div className="mx-4 mt-0.5 h-0.5 w-[calc(100%-32px)] bg-gradient-to-r from-[#CC8800] via-[#FFB800] to-[#CC8800] animate-pulse shrink-0" />

      {/* Header */}
      <div className="px-2 py-1.5 flex items-center justify-between border-b border-[rgba(255,184,0,0.18)] shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 chamfer-xs bg-[rgba(255,184,0,0.1)] border border-[rgba(255,184,0,0.3)] shadow-[0_0_8px_rgba(255,184,0,0.25)]">
            <Terminal className="w-3.5 h-3.5 text-[#FFB800]" />
          </div>
          <span className="text-xs font-bold font-['Orbitron',sans-serif] tracking-wider text-[#FFB800] flex items-center gap-1.5">
            COMMS LOG FEED
            <span className="text-[9px] font-mono px-1.5 py-0.2 chamfer-xs bg-[rgba(255,184,0,0.15)] border border-[rgba(255,184,0,0.3)] text-[#FFB800] font-bold">
              {commsLog.length}
            </span>
          </span>
        </div>
      </div>

      {/* Transcript Feed (Scrollable) */}
      <div
        ref={scrollRef}
        className="flex-1 flex flex-col gap-2 p-1.5 font-mono text-xs overflow-y-auto pr-1 min-h-0">
        {commsLog.map((item) => {
          const isUltron = item.sender === "ultron" || item.sender === "jarvis" || item.sender === "ada";
          const isUser = item.sender === "user";
          const isSystem = item.sender === "system";

          return (
            <div
              key={item.id}
              className={`p-2.5 chamfer-sm border transition-all ${
                isUltron
                  ? "bg-[rgba(255,184,0,0.06)] border-l-2 border-l-[#FFB800] border-[rgba(255,184,0,0.25)] shadow-[0_0_12px_rgba(255,184,0,0.08)]"
                  : isUser
                    ? "bg-[rgba(255,150,0,0.08)] border-l-2 border-l-[#FFAA00] border-[rgba(255,150,0,0.25)]"
                    : "bg-[rgba(255,255,255,0.03)] border-l-2 border-l-[#9E8B65] border-[rgba(255,255,255,0.1)]"
              }`}>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <div className="flex items-center gap-1.5 font-semibold">
                  {isUltron && (
                    <>
                      <Bot className="w-3 h-3 text-[#FFB800]" />
                      <span className="text-[#FFB800] tracking-wider">ULTRON // SYSTEM</span>
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
                  isUltron ? "text-[#F0F2F8]" : isUser ? "text-[#FFF8E7]" : "text-[#9E8B65]"
                }`}>
                <MarkdownText content={item.text} isAda={isUltron} />
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

