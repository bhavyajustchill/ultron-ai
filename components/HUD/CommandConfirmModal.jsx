"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, FolderOpen, ShieldAlert, SquareTerminal, Timer } from "lucide-react";
import { useJarvisStore } from "@/lib/store";
import { respondToCommand, runCommandWithApproval } from "@/lib/terminalClient";

/**
 * On-screen authorization card for terminal commands (Phase 7.7). Only a click here can
 * approve a non-read-only command; voice cannot, so instructions hidden in web pages or
 * documents Jarvis reads can never get a command run. Escape denies; it auto-denies on timeout.
 */
export function CommandConfirmModal() {
  const request = useJarvisStore((state) => state.pendingCommand);
  const addCommsMessage = useJarvisStore((state) => state.addCommsMessage);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Other HUD components can run a command through the same gate:
  // dispatchEvent(new CustomEvent("jarvis-run-command", { detail: { command, cwd, reason } }))
  useEffect(() => {
    const onRunRequest = (e) => {
      if (e.detail?.command) runCommandWithApproval(e.detail, (line) => addCommsMessage("system", line));
    };
    window.addEventListener("jarvis-run-command", onRunRequest);
    return () => window.removeEventListener("jarvis-run-command", onRunRequest);
  }, [addCommsMessage]);

  useEffect(() => {
    if (!request) return undefined;
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((request.expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    const onKeyDown = (e) => {
      if (e.key === "Escape") respondToCommand(request.id, false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [request]);

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[rgba(1,14,22,0.7)] backdrop-blur-sm px-4">
      <div
        role="alertdialog"
        aria-label="Command authorization"
        className="w-full max-w-xl flex flex-col gap-3 p-5 chamfer-lg bg-[rgba(8,12,18,0.92)] border border-[rgba(255,176,32,0.45)] shadow-[0_0_50px_rgba(255,176,32,0.18)] font-mono text-[#F0F2F8] scifi-modal-unfold-down">
        <div className="flex items-center justify-between gap-3 border-b border-[rgba(255,176,32,0.25)] pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 chamfer-xs bg-[rgba(255,176,32,0.12)] border border-[rgba(255,176,32,0.45)]">
              <ShieldAlert className="w-4 h-4 text-[#FFB020]" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-['Orbitron',sans-serif] font-bold tracking-wider text-[#FFB020]">COMMAND AUTHORIZATION</span>
              <span className="text-[9px] tracking-wider text-[#7E859E] uppercase">J.A.R.V.I.S requests terminal access</span>
            </div>
          </div>
          <span className="flex items-center gap-1 text-[10px] text-[#7E859E]" title="Denied automatically when the timer runs out">
            <Timer className="w-3 h-3" /> {secondsLeft}s
          </span>
        </div>

        {request.reason && <p className="text-[11px] text-[#B8BDCC] leading-relaxed">{request.reason}</p>}

        <pre className="flex items-start gap-2 p-3 chamfer-sm bg-black/60 border border-[rgba(0,229,255,0.25)] text-[12px] text-[#00E5FF] whitespace-pre-wrap break-all select-text">
          <SquareTerminal className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#00E5FF]/70" />
          <code>{request.command}</code>
        </pre>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[#7E859E]">
          <span className="flex items-center gap-1">
            <FolderOpen className="w-3 h-3" /> {request.cwd}
          </span>
          {request.background && <span className="text-[#00E5FF]">Runs in the background (output logged to a file)</span>}
        </div>

        {request.warnings?.length > 0 && (
          <ul className="flex flex-col gap-1 p-2.5 chamfer-sm bg-[rgba(255,176,32,0.06)] border border-[rgba(255,176,32,0.3)]">
            {request.warnings.map((warning) => (
              <li key={warning} className="flex items-center gap-1.5 text-[10px] text-[#FFB020]">
                <AlertTriangle className="w-3 h-3 shrink-0" /> {warning}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => respondToCommand(request.id, false)}
            className="px-4 py-1.5 chamfer-btn text-[11px] font-bold border border-white/15 bg-white/5 text-[#B8BDCC] hover:border-[rgba(255,0,60,0.5)] hover:text-[#FF8095] transition-all cursor-pointer">
            DENY (ESC)
          </button>
          <button
            type="button"
            onClick={() => respondToCommand(request.id, true)}
            className="px-4 py-1.5 chamfer-btn text-[11px] font-bold border border-[#FFB020] bg-[rgba(255,176,32,0.18)] text-[#FFB020] hover:bg-[rgba(255,176,32,0.3)] shadow-[0_0_14px_rgba(255,176,32,0.25)] transition-all cursor-pointer">
            AUTHORIZE &amp; RUN
          </button>
        </div>
      </div>
    </div>
  );
}

export default CommandConfirmModal;
