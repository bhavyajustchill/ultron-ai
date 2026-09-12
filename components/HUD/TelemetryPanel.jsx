"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Activity, Cpu, Database, Zap, Clock, Server, Terminal, X } from "lucide-react";
import { useAdaStore } from "@/lib/store";

/**
 * CpuMetricCard — Isolated CPU telemetry badge.
 */
const CpuMetricCard = React.memo(function CpuMetricCard() {
  const cpu = useAdaStore((state) => state.systemTelemetry?.cpu ?? 0);
  return (
    <div className="chamfer-sm border border-[rgba(255,184,0,0.25)] bg-[rgba(15,12,5,0.55)] hover:border-[rgba(255,184,0,0.45)] hover:bg-[rgba(20,16,8,0.65)] p-2.5 flex flex-col gap-1.5 transition-all duration-200 shadow-[0_0_15px_rgba(255,184,0,0.04),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5">
          <div className="p-1 chamfer-xs bg-[rgba(255,184,0,0.1)] border border-[rgba(255,184,0,0.25)]">
            <Cpu className="w-3 h-3 text-[#FFB800]" />
          </div>
          <span className="text-[#FFB800] font-['Orbitron',sans-serif] text-[11px] font-bold tracking-wider">
            CPU
          </span>
        </div>
        <div className="flex items-baseline gap-1 font-mono">
          <span className="text-white font-bold text-xs drop-shadow-[0_0_8px_rgba(255,184,0,0.4)]">
            {cpu}%
          </span>
        </div>
      </div>
      <div className="h-1.5 w-full bg-[rgba(255,184,0,0.08)] border border-[rgba(255,184,0,0.18)] chamfer-xs overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#CC8800] via-[#FFB800] to-[#FFE066] chamfer-xs transition-all duration-300 shadow-[0_0_8px_rgba(255,184,0,0.6)]"
          style={{ width: `${Math.min(100, Math.max(4, cpu))}%` }}
        />
      </div>
    </div>
  );
});

/**
 * MemMetricCard — Isolated RAM telemetry badge.
 */
const MemMetricCard = React.memo(function MemMetricCard() {
  const mem = useAdaStore((state) => state.systemTelemetry?.mem ?? 0);
  const memUsed = useAdaStore(
    (state) => state.systemTelemetry?.memUsed || state.systemTelemetry?.memUsedGb || "0 GB"
  );
  const memTotal = useAdaStore(
    (state) => state.systemTelemetry?.memTotal || state.systemTelemetry?.memTotalGb || "0 GB"
  );

  return (
    <div className="chamfer-sm border border-[rgba(255,184,0,0.25)] bg-[rgba(15,12,5,0.55)] hover:border-[rgba(255,184,0,0.45)] hover:bg-[rgba(20,16,8,0.65)] p-2.5 flex flex-col gap-1.5 transition-all duration-200 shadow-[0_0_15px_rgba(255,184,0,0.04),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5">
          <div className="p-1 chamfer-xs bg-[rgba(255,184,0,0.1)] border border-[rgba(255,184,0,0.25)]">
            <Database className="w-3 h-3 text-[#FFB800]" />
          </div>
          <span className="text-[#FFB800] font-['Orbitron',sans-serif] text-[11px] font-bold tracking-wider">
            RAM
          </span>
        </div>
        <div className="flex items-baseline gap-1.5 font-mono">
          <span className="text-white font-bold text-xs drop-shadow-[0_0_8px_rgba(255,184,0,0.4)]">
            {mem}%
          </span>
          <span className="text-[10px] text-[#9E8B65]">
            ({memUsed} / {memTotal})
          </span>
        </div>
      </div>
      <div className="h-1.5 w-full bg-[rgba(255,184,0,0.08)] border border-[rgba(255,184,0,0.18)] chamfer-xs overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#CC8800] via-[#FFB800] to-[#FFE066] chamfer-xs transition-all duration-300 shadow-[0_0_8px_rgba(255,184,0,0.6)]"
          style={{ width: `${Math.min(100, Math.max(4, mem))}%` }}
        />
      </div>
    </div>
  );
});

/**
 * RenderProfilerBadge — 3D R3F Hardware Frame Profiler badge.
 */
const RenderProfilerBadge = React.memo(function RenderProfilerBadge() {
  const fps = useAdaStore((state) => state.renderFps ?? 60);
  const frameDeltaMs = useAdaStore((state) => state.renderFrameDeltaMs ?? 16.6);

  return (
    <div className="chamfer-sm border border-[rgba(255,184,0,0.25)] bg-[rgba(15,12,5,0.55)] hover:border-[rgba(255,184,0,0.45)] p-2.5 flex flex-col gap-1.5 shadow-sm">
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5">
          <div className="p-1 chamfer-xs bg-[rgba(255,184,0,0.1)] border border-[rgba(255,184,0,0.25)]">
            <Zap className="w-3 h-3 text-[#FFB800]" />
          </div>
          <span className="text-[#FFB800] font-['Orbitron',sans-serif] text-[11px] font-bold tracking-wider">
            3D PROFILER
          </span>
        </div>
        <div className="flex items-center gap-2 font-mono">
          <span className="text-white font-bold drop-shadow-[0_0_8px_rgba(255,184,0,0.4)]">
            {fps} FPS
          </span>
          <span className="text-[10px] text-[#9E8B65]">({frameDeltaMs}ms)</span>
        </div>
      </div>
      <div className="h-1.5 w-full bg-[rgba(255,184,0,0.08)] border border-[rgba(255,184,0,0.18)] chamfer-xs overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#CC8800] via-[#FFB800] to-[#FFE066] chamfer-xs transition-all duration-300 shadow-[0_0_8px_rgba(255,184,0,0.6)]"
          style={{ width: `${Math.min(100, Math.max(8, (fps / 60) * 100))}%` }}
        />
      </div>
    </div>
  );
});

/**
 * NetworkThroughputBadge — Isolated live network speed & bandwidth load badge.
 */
const NetworkThroughputBadge = React.memo(function NetworkThroughputBadge() {
  const net = useAdaStore((state) => state.systemTelemetry?.net || "0 KB/s");
  const netPercent = useAdaStore((state) => state.systemTelemetry?.netPercent ?? 6);

  return (
    <div className="chamfer-sm border border-[rgba(255,184,0,0.25)] bg-[rgba(15,12,5,0.55)] hover:border-[rgba(255,184,0,0.45)] hover:bg-[rgba(20,16,8,0.65)] p-2.5 flex flex-col gap-1.5 transition-all duration-200 shadow-[0_0_15px_rgba(255,184,0,0.04),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5">
          <div className="p-1 chamfer-xs bg-[rgba(255,184,0,0.1)] border border-[rgba(255,184,0,0.25)]">
            <Activity className="w-3 h-3 text-[#FFB800]" />
          </div>
          <span className="text-[#FFB800] font-['Orbitron',sans-serif] text-[11px] font-bold tracking-wider">
            NETWORK
          </span>
        </div>
        <div className="flex items-baseline gap-1 font-mono">
          <span className="text-white font-bold text-xs drop-shadow-[0_0_8px_rgba(255,184,0,0.4)]">
            {net}
          </span>
        </div>
      </div>
      <div className="h-1.5 w-full bg-[rgba(255,184,0,0.08)] border border-[rgba(255,184,0,0.18)] chamfer-xs overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#CC8800] via-[#FFB800] to-[#FFE066] chamfer-xs transition-all duration-300 shadow-[0_0_8px_rgba(255,184,0,0.6)]"
          style={{ width: `${Math.min(100, Math.max(4, netPercent))}%` }}
        />
      </div>
    </div>
  );
});

/**
 * GpuMetricCard — Isolated GPU telemetry badge.
 */
const GpuMetricCard = React.memo(function GpuMetricCard() {
  const gpu = useAdaStore((state) => state.systemTelemetry?.gpu ?? 15);
  return (
    <div className="chamfer-sm border border-[rgba(255,184,0,0.25)] bg-[rgba(15,12,5,0.55)] hover:border-[rgba(255,184,0,0.45)] hover:bg-[rgba(20,16,8,0.65)] p-2.5 flex flex-col gap-1.5 transition-all duration-200 shadow-[0_0_15px_rgba(255,184,0,0.04),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex justify-between items-center text-xs">
        <div className="flex items-center gap-1.5">
          <div className="p-1 chamfer-xs bg-[rgba(255,184,0,0.1)] border border-[rgba(255,184,0,0.25)]">
            <Zap className="w-3 h-3 text-[#FFB800]" />
          </div>
          <span className="text-[#FFB800] font-['Orbitron',sans-serif] text-[11px] font-bold tracking-wider">
            GPU
          </span>
        </div>
        <div className="flex items-baseline gap-1 font-mono">
          <span className="text-white font-bold text-xs drop-shadow-[0_0_8px_rgba(255,184,0,0.4)]">
            {gpu}%
          </span>
        </div>
      </div>
      <div className="h-1.5 w-full bg-[rgba(255,184,0,0.08)] border border-[rgba(255,184,0,0.18)] chamfer-xs overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#CC8800] via-[#FFB800] to-[#FFE066] chamfer-xs transition-all duration-300 shadow-[0_0_8px_rgba(255,184,0,0.6)]"
          style={{ width: `${Math.min(100, Math.max(4, gpu))}%` }}
        />
      </div>
    </div>
  );
});

/**
 * HostStatsCard — Isolated Uptime, Process count, and OS Platform badge.
 */
const HostStatsCard = React.memo(function HostStatsCard() {
  const uptime = useAdaStore((state) => state.systemTelemetry?.uptime || "12:00");
  const proc = useAdaStore((state) => state.systemTelemetry?.proc || "264");
  const osTag = useAdaStore((state) => state.systemTelemetry?.os || "WIN");

  return (
    <div className="chamfer-sm border border-[rgba(255,184,0,0.25)] bg-[rgba(15,12,5,0.55)] p-2.5 flex flex-col gap-2 shadow-[0_0_15px_rgba(255,184,0,0.04),inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between border-b border-[rgba(255,184,0,0.12)] pb-1.5">
        <span className="text-[10px] font-['Orbitron',sans-serif] font-bold text-[#FFB800] tracking-wider flex items-center gap-1.5">
          <Terminal className="w-3 h-3 text-[#FFB800]" />
          HOST ARCHITECTURE
        </span>
        <span className="text-[9px] font-mono px-1.5 py-0.5 chamfer-xs bg-[rgba(255,184,0,0.1)] border border-[rgba(255,184,0,0.25)] text-[#FFB800] font-bold">
          {osTag}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
        <div className="flex flex-col gap-0.5 p-1.5 chamfer-xs bg-[rgba(255,184,0,0.04)] border border-[rgba(255,184,0,0.12)]">
          <div className="flex items-center gap-1 text-[#9E8B65] text-[10px]">
            <Clock className="w-2.5 h-2.5 text-[#FFB800]" />
            <span>UPTIME</span>
          </div>
          <span className="text-white font-bold text-xs drop-shadow-[0_0_6px_rgba(255,184,0,0.3)]">
            {uptime}
          </span>
        </div>

        <div className="flex flex-col gap-0.5 p-1.5 chamfer-xs bg-[rgba(255,184,0,0.04)] border border-[rgba(255,184,0,0.12)]">
          <div className="flex items-center gap-1 text-[#9E8B65] text-[10px]">
            <Server className="w-2.5 h-2.5 text-[#FFB800]" />
            <span>PROCESSES</span>
          </div>
          <span className="text-white font-bold text-xs drop-shadow-[0_0_6px_rgba(255,184,0,0.3)]">
            {proc}
          </span>
        </div>
      </div>
    </div>
  );
});

function TelemetryPanelComponent({ isConnected, onToggleConnection }) {
  const { setSystemTelemetry, setIsSettingsModalOpen, isTelemetryOpen, setIsTelemetryOpen } =
    useAdaStore();

  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);

  // Smooth Shutter Close
  const triggerClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsTelemetryOpen(false);
      setIsClosing(false);
    }, 220);
  }, [isClosing, setIsTelemetryOpen]);

  // Listen for external close toggle event (e.g. from top header button)
  useEffect(() => {
    const handleExternalClose = () => {
      if (isTelemetryOpen) {
        triggerClose();
      }
    };
    window.addEventListener("ada-close-telemetry", handleExternalClose);
    return () => window.removeEventListener("ada-close-telemetry", handleExternalClose);
  }, [isTelemetryOpen, triggerClose]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isTelemetryOpen) {
        triggerClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTelemetryOpen, triggerClose]);

  // Clean up close timer on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Poll host operating system telemetry every 2.5 seconds
  useEffect(() => {
    let isMounted = true;

    const fetchTelemetry = async () => {
      try {
        const res = await fetch("/api/system-telemetry");
        if (res.ok && isMounted) {
          const data = await res.json();
          setSystemTelemetry(data);
        }
      } catch (err) {
        console.warn("[TelemetryPanel] Telemetry poll failed:", err);
      }
    };

    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [setSystemTelemetry]);

  if (!isTelemetryOpen && !isClosing) return null;

  return (
    <aside
      className={`fixed top-18 left-6 h-[44vh] max-h-[440px] w-88 sm:w-96 max-w-[calc(100vw-3rem)] z-30 flex flex-col bg-[rgba(15,12,5,0.65)] backdrop-blur-xl backdrop-saturate-150 border border-[rgba(255,184,0,0.25)] shadow-[0_0_40px_rgba(255,184,0,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] chamfer-xl overflow-hidden text-[#F0F2F8] font-mono select-none pointer-events-auto p-3.5 gap-2.5 ${isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"
        }`}>
      {/* TOP ACCENT LINE */}
      <div className="mx-4 mt-1 h-0.5 w-[calc(100%-32px)] bg-gradient-to-r from-[#CC8800] via-[#FFB800] to-[#CC8800] animate-pulse shrink-0" />

      {/* TOP HEADER: BRANDING & CONTROLS */}
      <div className="flex items-center justify-between border-b border-[rgba(255,184,0,0.18)] pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 bg-[#FFB800] rounded-full animate-pulse shadow-[0_0_8px_#FFB800]" />
          <div className="flex flex-col">
            <span className="text-sm font-['Orbitron',sans-serif] font-black tracking-widest text-[#FFB800]">
              SYSTEMS PANEL
            </span>
            <span className="text-[9px] font-mono tracking-wider text-[#9E8B65] uppercase">
              Host OS &amp; Core Telemetry
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Close Panel Button */}
          <button
            onClick={triggerClose}
            className="p-1.5 chamfer-btn border border-transparent hover:border-[rgba(255,184,0,0.3)] hover:bg-[rgba(255,184,0,0.1)] text-[#9E8B65] hover:text-[#FFB800] transition-all cursor-pointer"
            title="Close Systems Panel (Esc)">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SCROLLABLE SYS CONTENT */}
      <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto pr-1 min-h-0">
        {/* System Metric Cards */}
        <div className="flex flex-col gap-2">
          <CpuMetricCard />
          <MemMetricCard />
          <NetworkThroughputBadge />
          <GpuMetricCard />
        </div>

        {/* Host OS Uptime & Process Stats */}
        <HostStatsCard />
      </div>
    </aside>
  );
}

export const TelemetryPanel = React.memo(TelemetryPanelComponent);
export default TelemetryPanel;
