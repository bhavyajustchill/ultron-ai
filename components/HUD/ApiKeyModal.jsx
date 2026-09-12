"use client";

import React, { useState, useEffect, useRef } from "react";
import { Key, ShieldCheck, X, ExternalLink, Trash2, CheckCircle } from "lucide-react";
import { useAdaStore } from "@/lib/store";

export function ApiKeyModal({ isOpen, onClose, onSaveKey }) {
  const userApiKey = useAdaStore((state) => state.userApiKey);
  const setUserApiKey = useAdaStore((state) => state.setUserApiKey);
  const [tempKey, setTempKey] = useState("");
  const [saved, setSaved] = useState(false);

  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTempKey(userApiKey || "");
      setSaved(false);
      setIsClosing(false);
    }
  }, [isOpen, userApiKey]);

  // Smooth Shutter Close
  const triggerClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 220); // Matches 0.22s scifi-modal-collapse-up keyframe
  };

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        triggerClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  if (!isOpen && !isClosing) return null;

  const handleSave = () => {
    if (!tempKey.trim()) return;
    const cleanKey = tempKey.trim();
    setUserApiKey(cleanKey);
    setSaved(true);
    if (onSaveKey) {
      onSaveKey(cleanKey);
    }
    setTimeout(() => {
      setSaved(false);
      triggerClose();
    }, 600);
  };

  const handleClear = () => {
    setUserApiKey("");
    setTempKey("");
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) triggerClose();
      }}
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-md select-none transition-all duration-200 ${
        isClosing
          ? "opacity-0 backdrop-blur-none pointer-events-none"
          : "opacity-100 backdrop-blur-md"
      }`}>
      {/* Sci-Fi Shutter Unfold / Collapse Modal Container */}
      <div
        className={`relative w-full max-w-md bg-[rgba(15,12,5,0.65)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(255, 184, 0,0.25)] shadow-[0_0_40px_rgba(255, 184, 0,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden flex flex-col gap-4 text-[#F0F2F8] font-mono ${
          isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"
        }`}>
        {/* Holographic Top Accent Gradient Line */}
        <div className="mx-6 mt-1 h-0.5 w-[calc(100%-48px)] bg-gradient-to-r from-[#FFB800] via-[#FFD54F] to-[#FFB800] animate-pulse" />

        {/* Modal Header */}
        <div className="px-6 pt-3 flex items-center justify-between border-b border-[rgba(255, 184, 0,0.18)] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 chamfer-xs bg-[rgba(255, 184, 0,0.1)] border border-[rgba(255, 184, 0,0.35)] shadow-[0_0_12px_rgba(255, 184, 0,0.25)]">
              <Key className="w-4 h-4 text-[#FFB800]" />
            </div>
            <div className="flex flex-col">
              <h3 className="font-['Orbitron',sans-serif] text-xs sm:text-sm font-bold text-[#F0F2F8] tracking-wider">
                GEMINI LIVE CREDENTIALS
              </h3>
              <span className="text-[10px] text-[#9E8B65]">
                Encrypted Client-Side Key Storage
              </span>
            </div>
          </div>

          <button
            onClick={triggerClose}
            className="px-2.5 py-1 chamfer-xs text-xs text-[#9E8B65] hover:text-[#FFB800] hover:bg-[rgba(255, 184, 0,0.1)] border border-transparent hover:border-[rgba(255, 184, 0,0.3)] transition-all cursor-pointer flex items-center gap-1"
            title="Close credentials panel (Esc)">
            <X className="w-4 h-4" />
            <span className="text-[10px] hidden sm:inline font-mono">ESC</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="px-6 flex flex-col gap-3.5 text-xs">
          <div className="flex flex-col gap-2 text-xs font-mono text-[#9E8B65] leading-relaxed">
            <p>
              To activate real-time speech with{" "}
              <span className="text-[#FFB800] font-semibold">gemini-3.1-flash-live-preview</span>,
              enter your Gemini API key below.
            </p>
            <div className="flex items-center gap-2 p-2.5 chamfer-xs bg-[rgba(255, 184, 0,0.06)] border border-[rgba(255, 184, 0,0.25)] text-[11px] text-[#FFB800]">
              <CheckCircle className="w-4 h-4 text-[#FFB800] shrink-0" />
              <span>
                Saved securely in browser localStorage. Never transmitted to any third-party server.
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-mono text-[#FFB800] uppercase font-semibold">
                Gemini API Key
              </label>
              {userApiKey && (
                <span className="text-[10px] font-mono text-[#FFB800] border border-[rgba(255, 184, 0,0.3)] bg-[rgba(255, 184, 0,0.1)] px-1.5 py-0.2 chamfer-xs">
                  Key Currently Stored
                </span>
              )}
            </div>
            <input
              type="password"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-3 py-2 bg-[rgba(20,16,8,0.9)] border border-[rgba(255, 184, 0,0.3)] chamfer-sm text-xs font-mono text-[#F0F2F8] placeholder-[rgba(126,133,158,0.5)] focus:outline-none focus:border-[#FFB800] focus:shadow-[0_0_12px_rgba(255, 184, 0,0.25)] shadow-inner transition-all"
              autoFocus
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[rgba(255, 184, 0,0.18)] flex items-center justify-between bg-[rgba(15,12,5,0.6)]">
          <div className="flex items-center gap-3">
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] font-mono text-[#9E8B65] hover:text-[#FFB800] transition-colors"
              title="Open Google AI Studio to get an API key">
              <span>Get Free Key</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            {userApiKey && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1 text-[11px] font-mono text-[#9E8B65] hover:text-[#FF003C] transition-colors cursor-pointer"
                title="Remove key from localStorage">
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={!tempKey.trim()}
            className={`flex items-center gap-1.5 px-4 py-1.5 chamfer-btn font-mono text-xs font-bold transition-all cursor-pointer ${
              tempKey.trim()
                ? "bg-[#FFB800] hover:bg-[#ffca28] text-[#080602] shadow-[0_0_15px_rgba(255, 184, 0,0.4)]"
                : "opacity-35 cursor-not-allowed bg-[rgba(255,255,255,0.1)] text-[#9E8B65]"
            }`}>
            <ShieldCheck className="w-4 h-4" />
            <span>{saved ? "SAVED TO LOCAL STORAGE" : "SAVE CREDENTIALS"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ApiKeyModal;
