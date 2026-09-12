"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  QrCode,
  Smartphone,
  Copy,
  Check,
  X,
  ExternalLink,
  Wifi,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { useAdaStore } from "@/lib/store";

export function MobilePairingModal({ isOpen, onClose }) {
  const {
    isMobileModalOpen,
    setIsMobileModalOpen,
    mobilePairingData,
    isPairingLoading,
    loadMobilePairing,
  } = useAdaStore();

  const [copied, setCopied] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);

  const open = isOpen !== undefined ? isOpen : isMobileModalOpen;

  useEffect(() => {
    if (open && !mobilePairingData) {
      loadMobilePairing();
    }
  }, [open, mobilePairingData, loadMobilePairing]);

  // Smooth Shutter Close
  const triggerClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsClosing(false);
      onClose?.();
      setIsMobileModalOpen(false);
    }, 220); // Matches 0.22s scifi-modal-collapse-up keyframe
  }, [isClosing, onClose, setIsMobileModalOpen]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && open) {
        triggerClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, triggerClose]);

  // Listen for external toggle close event (e.g. from bottom dock button)
  useEffect(() => {
    const handleExternalClose = () => {
      if (open) {
        triggerClose();
      }
    };
    window.addEventListener("ada-close-mobile", handleExternalClose);
    return () => window.removeEventListener("ada-close-mobile", handleExternalClose);
  }, [open, triggerClose]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  if (!open && !isClosing) return null;

  const handleCopy = () => {
    if (!mobilePairingData?.mobileUrl) return;
    navigator.clipboard.writeText(mobilePairingData.mobileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        className={`relative w-full max-w-md p-6 chamfer-xl border border-[rgba(255, 184, 0,0.25)] bg-[rgba(15,12,5,0.65)] backdrop-blur-xl backdrop-saturate-150 shadow-[0_0_40px_rgba(255, 184, 0,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col gap-4 text-[#F0F2F8] select-none font-mono overflow-hidden ${
          isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"
        }`}>
        {/* Holographic Top Accent Gradient Line */}
        <div className="mx-2 -mt-2 h-0.5 w-[calc(100%-16px)] bg-gradient-to-r from-[#FFB800] via-[#FFD54F] to-[#FFB800] animate-pulse" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[rgba(255, 184, 0,0.2)] pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 chamfer-xs bg-[#FFB800]/10 text-[#FFB800]">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-['Orbitron',sans-serif] font-bold tracking-wider text-[#FFB800]">
                MOBILE REMOTE RELAY (PWA)
              </h2>
              <p className="text-[10px] text-[#9E8B65]">Local WiFi Peer-to-Peer Pairing Protocol</p>
            </div>
          </div>
          <button
            onClick={triggerClose}
            className="p-1 chamfer-xs text-[#9E8B65] hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title="Close Window (Esc)">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center p-4 chamfer-md bg-[rgba(5,5,8,0.9)] border border-[rgba(255,255,255,0.08)] relative">
          {isPairingLoading ? (
            <div className="w-56 h-56 flex flex-col items-center justify-center gap-2 text-[#FFB800]">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <span className="text-xs">Scanning Local LAN Interfaces...</span>
            </div>
          ) : mobilePairingData?.qrSvg ? (
            <div
              className="w-56 h-56 flex items-center justify-center p-2 chamfer-sm bg-[#0A0B10] border border-[#FFB800]/30 shadow-[0_0_20px_rgba(255, 184, 0,0.2)] [&>svg]:w-full [&>svg]:h-full"
              dangerouslySetInnerHTML={{ __html: mobilePairingData.qrSvg }}
            />
          ) : (
            <div className="w-56 h-56 flex flex-col items-center justify-center gap-2 text-[#FF003C]">
              <span className="text-xs">Failed to generate QR code</span>
              <button
                onClick={loadMobilePairing}
                className="px-3 py-1 text-[10px] chamfer-btn border border-[#FF003C] hover:bg-[#FF003C]/20">
                RETRY
              </button>
            </div>
          )}

          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#00FF66]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF66] animate-pulse" />
            <span>Ready for phone camera scan</span>
          </div>
        </div>

        {/* Network Endpoint Info */}
        <div className="flex flex-col gap-1.5 text-xs">
          <div className="flex justify-between items-center text-[10px] text-[#9E8B65]">
            <span className="flex items-center gap-1">
              <Wifi className="w-3 h-3 text-[#FFB800]" />
              <span>DIRECT LAN ADDRESS</span>
            </span>
            <span className="text-[#FFB800]">{mobilePairingData?.localIp || "Detecting..."}</span>
          </div>

          <div className="flex items-center gap-1.5 p-2 chamfer-xs bg-[rgba(0,0,0,0.4)] border border-[rgba(255,255,255,0.1)] text-[11px] text-[#FFB800] truncate">
            <span className="truncate flex-1 select-all font-mono">
              {mobilePairingData?.mobileUrl || "Generating link..."}
            </span>
            <button
              onClick={handleCopy}
              className="p-1.5 chamfer-xs bg-[#FFB800]/10 hover:bg-[#FFB800]/20 text-[#FFB800] transition-all cursor-pointer"
              title="Copy mobile pairing URL">
              {copied ? (
                <Check className="w-3.5 h-3.5 text-[#00FF66]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)]">
          <a
            href={mobilePairingData?.mobileUrl || "/mobile"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2 chamfer-btn bg-[rgba(255, 184, 0,0.15)] border border-[#FFB800] text-[#FFB800] hover:bg-[#FFB800] hover:text-black transition-all font-mono text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(255, 184, 0,0.2)]">
            <ExternalLink className="w-3.5 h-3.5" />
            <span>LAUNCH MOBILE VIEW</span>
          </a>

          <button
            onClick={loadMobilePairing}
            className="p-2 chamfer-btn border border-[rgba(255,255,255,0.15)] hover:border-[#FFB800] text-[#9E8B65] hover:text-[#FFB800] transition-colors cursor-pointer"
            title="Refresh network interfaces">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default MobilePairingModal;

