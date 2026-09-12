"use client";

import React, { useState } from "react";
import {
  Activity,
  Mic,
  MicOff,
  Square,
  Monitor,
  Wifi,
  Key,
  Power,
  Camera,
  Send,
  Settings,
  Smartphone,
  Brain,
  Terminal,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SunMedium,
  Globe,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { useAdaStore } from "@/lib/store";
import { useGeminiLive } from "@/hooks/useGeminiLive";
import { ApiKeyModal } from "@/components/HUD/ApiKeyModal";
import { UltronViewport } from "@/components/Canvas3D/UltronViewport";
import { ScreenShareModal } from "@/components/Vision/ScreenShareModal";
import { WebCamPiP } from "@/components/Vision/WebCamPiP";
import { MobilePairingModal } from "@/components/HUD/MobilePairingModal";
import { SciFiMemoryModal } from "@/components/HUD/SciFiMemoryModal";
import { SciFiSettingsModal } from "@/components/HUD/SciFiSettingsModal";
import { SciFiMemoryVaultModal } from "@/components/HUD/SciFiMemoryVaultModal";
import { CommsLog } from "@/components/HUD/CommsLog";
import { TelemetryPanel } from "@/components/HUD/TelemetryPanel";
import { IntelModal } from "@/components/HUD/IntelModal";

export default function Home() {
  const {
    status,
    isMuted,
    toggleMute,
    latencyMs,
    userApiKey,
    isKeyModalOpen,
    setIsKeyModalOpen,
    isMemoryVaultOpen,
    setIsMemoryVaultOpen,
    isCommsLogOpen,
    setIsCommsLogOpen,
    commsLog,
    setIsSettingsModalOpen,
    loadStoredApiKey,
    loadStoredMicMuted,
    isScreenModalOpen,
    setIsScreenModalOpen,
    isScreenSharing,
    isWebcamOpen,
    setIsWebcamOpen,
    loadMemories,
    addCommsMessage,
    isMobileModalOpen,
    setIsMobileModalOpen,
    isTelemetryOpen,
    setIsTelemetryOpen,
    isIntelOpen,
    setIsIntelOpen,
    intelSearchResults,
  } = useAdaStore();

  const [textInput, setTextInput] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync fullscreen state with document fullscreenchange
  React.useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch((err) => {
        console.warn("[Fullscreen] Failed to enter fullscreen:", err);
      });
    } else {
      document.exitFullscreen?.().catch((err) => {
        console.warn("[Fullscreen] Failed to exit fullscreen:", err);
      });
    }
  };

  // Load API key, mic mute preference, and memory vault from storage upon client mount
  React.useEffect(() => {
    loadStoredApiKey();
    loadStoredMicMuted();
    loadMemories();
  }, [loadStoredApiKey, loadStoredMicMuted, loadMemories]);

  const {
    connectSession,
    disconnectSession,
    handleBargeIn,
    pcmPlayer,
    getInputByteFrequencyData,
    sendTextMessage,
    sendVideoFrame,
    triggerBriefing,
  } = useGeminiLive();

  // Auto-initiate voice link upon client mount
  const autoConnectAttemptedRef = React.useRef(false);

  React.useEffect(() => {
    if (autoConnectAttemptedRef.current) return;
    autoConnectAttemptedRef.current = true;

    // Synchronously hydrate stored voice preference on client mount
    const { loadStoredVoiceName } = useAdaStore.getState();
    if (loadStoredVoiceName) {
      loadStoredVoiceName();
    }

    const storedKey = loadStoredApiKey();
    // Auto-initiate connection with stored key (or check server env key)
    const timer = setTimeout(() => {
      connectSession(storedKey || "");
    }, 350);

    return () => clearTimeout(timer);
  }, [loadStoredApiKey, connectSession]);

  // Global user interaction unlock for browser AudioContext autoplay policy
  React.useEffect(() => {
    const unlockAudio = () => {
      if (pcmPlayer) {
        pcmPlayer.initContext();
      }
    };

    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("click", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("click", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, [pcmPlayer]);

  const isConnected = status !== "DISCONNECTED" && status !== "CONNECTING";

  const handleToggleConnection = () => {
    if (isConnected || status === "CONNECTING") {
      disconnectSession();
    } else {
      const activeKey = userApiKey || loadStoredApiKey();
      connectSession(activeKey);
    }
  };

  const handleTriggerBriefing = () => {
    triggerBriefing();
  };

  const handleSendText = (e) => {
    if (e) e.preventDefault();
    const trimmed = textInput.trim();
    if (!trimmed) return;

    if (!isConnected && status !== "CONNECTING") {
      const activeKey = userApiKey || loadStoredApiKey();
      connectSession(activeKey);
    }

    addCommsMessage("user", trimmed);
    sendTextMessage(trimmed);
    setTextInput("");
  };

  // Mobile Relay Synchronization Bridge (Phase 5)
  React.useEffect(() => {
    let isMounted = true;

    const syncRelay = async () => {
      try {
        const storeState = useAdaStore.getState();
        await fetch("/api/relay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "desktop",
            state: {
              status: storeState.status,
              latencyMs: storeState.latencyMs,
              systemTelemetry: storeState.systemTelemetry,
              commsLog: (storeState.commsLog || []).slice(-10),
            },
          }),
        });

        // 2. Consume any pending directives from paired mobile devices
        const res = await fetch("/api/relay?client=desktop");
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data.directives && data.directives.length > 0) {
            for (const d of data.directives) {
              if (d.type === "text_directive") {
                storeState.addCommsMessage("user", `[MOBILE RELAY] ${d.payload}`);
                sendTextMessage(d.payload);
              } else if (d.type === "os_action") {
                storeState.addCommsMessage(
                  "system",
                  `[MOBILE RELAY] Executing OS Action: ${d.payload}`,
                );
                storeState.executeOsActionApi(d.payload);
              } else if (d.type === "briefing") {
                handleTriggerBriefing();
              }
            }
          }
        }
      } catch (err) {
        // Silently handle transient network blips
      }
    };

    const interval = setInterval(syncRelay, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [sendTextMessage]);

  // Status visual badge styling
  const getStatusBadge = () => {
    switch (status) {
      case "SPEAKING":
        return {
          text: "ULTRON // TRANSMITTING",
          color:
            "text-[#FFB800] border-[#FFB800] bg-[rgba(255,184,0,0.15)] shadow-[0_0_15px_rgba(255,184,0,0.4)]",
          dot: "bg-[#FFB800] animate-ping",
        };
      case "LISTENING":
        return {
          text: "MIC // LISTENING",
          color:
            "text-[#FFB800] border-[#FFB800] bg-[rgba(255,184,0,0.1)] shadow-[0_0_15px_rgba(255,184,0,0.3)]",
          dot: "bg-[#FFB800] animate-pulse",
        };
      case "CONNECTED":
        return isMuted
          ? {
            text: "MIC OFF // TEXT ONLY",
            color:
              "text-[#FFB800] border-[#FFB800] bg-[rgba(255,184,0,0.12)] shadow-[0_0_12px_rgba(255,184,0,0.3)]",
            dot: "bg-[#FFB800]",
          }
          : {
            text: "LINK // READY",
            color:
              "text-[#FFB800] border-[#FFB800] bg-[rgba(255,184,0,0.1)] shadow-[0_0_12px_rgba(255,184,0,0.25)]",
            dot: "bg-[#FFB800] animate-pulse",
          };
      case "THINKING":
        return {
          text: "NEURAL // PROCESSING",
          color:
            "text-[#FFAA00] border-[#FFAA00] bg-[rgba(255,170,0,0.1)] shadow-[0_0_15px_rgba(255,170,0,0.3)]",
          dot: "bg-[#FFAA00] animate-bounce",
        };
      case "CONNECTING":
        return {
          text: "LINK // ESTABLISHING...",
          color: "text-[#FFAA00] border-[#FFAA00] bg-[rgba(255,170,0,0.06)]",
          dot: "bg-[#FFAA00] animate-pulse",
        };
      default:
        return {
          text: "STANDBY // OFFLINE",
          color: "text-[#7E859E] border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)]",
          dot: "bg-[#7E859E]",
        };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <main className="relative w-screen h-screen bg-[#080602] text-[#F0F2F8] overflow-hidden select-none">
      {/* Background Radial Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_40%,rgba(255,184,0,0.08),rgba(8,6,2,0.98))] pointer-events-none" />

      {/* TOP MIDDLE BRANDING: ULTRON // AUTONOMOUS ARTIFICIAL INTELLIGENCE SYSTEM */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none text-center">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 bg-[#FFB800] animate-pulse shadow-[0_0_8px_#FFB800]" />
          <h1 className="font-['Orbitron',sans-serif] text-lg sm:text-xl md:text-2xl font-black tracking-[0.28em] text-[#F0F2F8] drop-shadow-[0_0_14px_rgba(255,184,0,0.45)]">
            ULTRON
          </h1>
          <span className="w-1.5 h-1.5 bg-[#FFB800] animate-pulse shadow-[0_0_8px_#FFB800]" />
        </div>
        <span className="font-mono text-[8px] sm:text-[10px] md:text-[11px] tracking-[0.18em] sm:tracking-[0.24em] text-[#FFB800] uppercase font-bold mt-1 opacity-90 drop-shadow-[0_0_8px_rgba(255,184,0,0.35)] whitespace-nowrap">
          AUTONOMOUS ARTIFICIAL INTELLIGENCE SYSTEM
        </span>
      </div>

      {/* TOP LEFT BUTTON CLUSTER: SYSTEMS & INTEL */}
      <div className="absolute top-6 left-6 z-20 flex items-center gap-2">
        {/* Systems Panel Toggle */}
        <button
          onClick={() => {
            if (isTelemetryOpen) {
              window.dispatchEvent(new CustomEvent("ada-close-telemetry"));
            } else {
              setIsTelemetryOpen(true);
            }
          }}
          className={`flex items-center gap-2 px-3 py-1.5 chamfer-btn text-xs font-mono font-semibold border transition-all cursor-pointer ${isTelemetryOpen
            ? "border-[#FFB800] bg-[rgba(255,184,0,0.2)] text-[#FFB800] shadow-[0_0_15px_rgba(255,184,0,0.4)]"
            : "border-[rgba(255,184,0,0.25)] bg-[rgba(15,12,5,0.45)] backdrop-blur-xl backdrop-saturate-150 text-[#9E8B65] hover:text-[#FFB800] hover:border-[#FFB800] hover:bg-[rgba(255,184,0,0.1)] shadow-[0_0_20px_rgba(255,184,0,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]"
            }`}
          title="Toggle Systems & Telemetry Panel">
          <Activity className="w-3.5 h-3.5 text-[#FFB800]" />
          <span className="hidden sm:inline tracking-wider">SYSTEMS</span>
        </button>

        {/* Intel Modal Toggle */}
        <button
          onClick={() => {
            if (isIntelOpen) {
              window.dispatchEvent(new CustomEvent("ada-close-intel"));
            } else {
              setIsIntelOpen(true);
            }
          }}
          className={`flex items-center gap-2 px-3 py-1.5 chamfer-btn text-xs font-mono font-semibold border transition-all cursor-pointer ${isIntelOpen
            ? "border-[#FFB800] bg-[rgba(255,184,0,0.2)] text-[#FFB800] shadow-[0_0_15px_rgba(255,184,0,0.4)]"
            : "border-[rgba(255,184,0,0.25)] bg-[rgba(15,12,5,0.45)] backdrop-blur-xl backdrop-saturate-150 text-[#9E8B65] hover:text-[#FFB800] hover:border-[#FFB800] hover:bg-[rgba(255,184,0,0.1)] shadow-[0_0_20px_rgba(255,184,0,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]"
            }`}
          title="Toggle Neural Intel & Dossiers Window">
          <Globe className="w-3.5 h-3.5 text-[#FFB800]" />
          <span className="hidden sm:inline tracking-wider">INTEL</span>
          {intelSearchResults && intelSearchResults.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 chamfer-xs bg-[rgba(255,184,0,0.2)] text-[#FFB800] font-bold border border-[rgba(255,184,0,0.4)]">
              {intelSearchResults.length}
            </span>
          )}
        </button>
      </div>

      {/* TOP RIGHT CLUSTER: ZOOM CONTROLS + COMMS LOG */}
      <div className="absolute top-6 right-6 z-20 flex items-center gap-2">
        {/* Camera Zoom & Reset Controls */}
        <div className="flex items-center gap-0.5 p-1 chamfer-btn border border-[rgba(255,184,0,0.25)] bg-[rgba(15,12,5,0.45)] backdrop-blur-xl backdrop-saturate-150 text-[10px] font-mono shadow-[0_0_20px_rgba(255,184,0,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("ada-camera-action", { detail: "in" }))}
            className="p-1 chamfer-xs text-[#9E8B65] hover:text-[#FFB800] hover:bg-[rgba(255,184,0,0.1)] transition-colors cursor-pointer"
            title="Zoom In (or scroll up)">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("ada-camera-action", { detail: "out" }))}
            className="p-1 chamfer-xs text-[#9E8B65] hover:text-[#FFB800] hover:bg-[rgba(255,184,0,0.1)] transition-colors cursor-pointer"
            title="Zoom Out (or scroll down)">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("ada-camera-action", { detail: "reset" }))}
            className="p-1 chamfer-xs text-[#9E8B65] hover:text-[#FFB800] hover:bg-[rgba(255,184,0,0.1)] transition-colors cursor-pointer"
            title="Reset Camera View">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Fullscreen Toggle Button */}
        <button
          onClick={toggleFullscreen}
          className={`flex items-center justify-center px-2.5 py-1.5 chamfer-btn text-xs font-mono font-semibold border transition-all cursor-pointer ${isFullscreen
            ? "border-[#FFB800] bg-[rgba(255,184,0,0.2)] text-[#FFB800] shadow-[0_0_15px_rgba(255,184,0,0.4)]"
            : "border-[rgba(255,184,0,0.25)] bg-[rgba(15,12,5,0.45)] backdrop-blur-xl backdrop-saturate-150 text-[#9E8B65] hover:text-[#FFB800] hover:border-[#FFB800] hover:bg-[rgba(255,184,0,0.1)] shadow-[0_0_20px_rgba(255,184,0,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]"
            }`}
          title={isFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen"}>
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5 text-[#FFB800]" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Comms Log Toggle Button */}
        <button
          onClick={() => {
            if (isCommsLogOpen) {
              window.dispatchEvent(new CustomEvent("ada-close-comms"));
            } else {
              setIsCommsLogOpen(true);
            }
          }}
          className={`flex items-center gap-2 px-3 py-1.5 chamfer-btn text-xs font-mono font-semibold border transition-all cursor-pointer ${isCommsLogOpen
            ? "border-[#FFB800] bg-[rgba(255,184,0,0.2)] text-[#FFB800] shadow-[0_0_15px_rgba(255,184,0,0.4)]"
            : "border-[rgba(255,184,0,0.25)] bg-[rgba(15,12,5,0.45)] backdrop-blur-xl backdrop-saturate-150 text-[#9E8B65] hover:text-[#FFB800] hover:border-[#FFB800] hover:bg-[rgba(255,184,0,0.1)] shadow-[0_0_20px_rgba(255,184,0,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]"
            }`}
          title="Toggle Comms Log Feed">
          <Terminal className="w-3.5 h-3.5 text-[#FFB800]" />
          <span className="hidden sm:inline tracking-wider">COMMS LOG</span>
          {commsLog && commsLog.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 chamfer-xs bg-[rgba(255,184,0,0.2)] text-[#FFB800] font-bold border border-[rgba(255,184,0,0.4)]">
              {commsLog.length}
            </span>
          )}
        </button>
      </div>

      {/* FULLSCREEN 3D HOLOGRAPHIC VIEWPORT */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <UltronViewport
          pcmPlayer={pcmPlayer}
          getInputByteFrequencyData={getInputByteFrequencyData}
          onToggleListening={toggleMute}
        />
      </div>

      {/* FLOATING MULTIMODAL SCREEN VISION INTERROGATION WINDOW */}
      <ScreenShareModal
        isOpen={isScreenModalOpen}
        onClose={() => setIsScreenModalOpen(false)}
        sendVideoFrame={sendVideoFrame}
      />

      {/* FLOATING OPERATOR WEBCAM PIP WINDOW */}
      <WebCamPiP
        isOpen={isWebcamOpen}
        onClose={() => setIsWebcamOpen(false)}
        sendVideoFrame={sendVideoFrame}
      />

      {/* FLOATING BOTTOM HUD DOCK (BELOW THE ORB) */}
      <div className="absolute bottom-5 left-0 right-0 z-20 w-full px-6 sm:px-10 md:px-14 flex flex-col gap-2.5 items-center">
        {/* Subtle Live Status & Latency Line */}
        <div className="flex items-center justify-between w-full px-1 py-0.5 text-[10px] font-mono">
          <div
            className={`flex items-center gap-2 px-2.5 py-0.5 chamfer-xs border transition-all ${statusBadge.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
            <span className="tracking-wider font-semibold">{statusBadge.text}</span>
          </div>

          <div className="flex items-center gap-1.5 text-[#9E8B65] border border-[rgba(255,184,0,0.25)] bg-[rgba(15,12,5,0.45)] backdrop-blur-lg px-2 py-0.5 chamfer-xs">
            <Wifi className="w-3 h-3 text-[#FFB800]" />
            <span>{latencyMs > 0 ? `${latencyMs}ms` : "STANDBY"}</span>
          </div>
        </div>

        {/* Text Directive Input Bar (Standard Full-Width Underline) */}
        <form
          onSubmit={handleSendText}
          className="relative w-full flex items-center gap-3 pb-2 pt-1 border-b-2 border-[rgba(255,184,0,0.25)] hover:border-[rgba(255,184,0,0.55)] focus-within:border-[#FFB800] focus-within:shadow-[0_4px_16px_-2px_rgba(255,184,0,0.4)] transition-all bg-transparent">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={
              isMuted
                ? "MIC MUTED // Type directive to Ultron.. [Enter]"
                : isConnected
                  ? "Transmit directive or query to Ultron.. [Enter]"
                  : "Type directive or click Connect... [Enter]"
            }
            className="flex-1 bg-transparent text-sm sm:text-base font-mono text-[#F0F2F8] placeholder-[rgba(158,139,101,0.6)] px-1 py-1 outline-none min-w-0 tracking-wide"
          />

          <button
            type="submit"
            disabled={!textInput.trim()}
            title="Transmit directive [Enter]"
            aria-label="Send directive"
            className="flex items-center justify-center p-2 text-[#FFB800] hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all cursor-pointer shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* Action Controls Cluster */}
        <div className="flex items-center justify-between w-full gap-2 pt-1">
          <div className="flex items-center gap-2">
            {/* Connect / Disconnect Button */}
            <button
              onClick={handleToggleConnection}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 chamfer-btn text-xs font-mono font-semibold transition-all cursor-pointer ${isConnected
                ? "border border-[#FFB800] bg-[rgba(255,184,0,0.15)] text-[#FFB800] hover:bg-[rgba(255,184,0,0.25)] shadow-[0_0_12px_rgba(255,184,0,0.3)]"
                : "bg-[#FFB800] hover:bg-[#ffc833] text-[#080602] shadow-[0_0_15px_rgba(255,184,0,0.5)] font-bold"
                }`}
              title={isConnected ? "Disconnect WebSocket link" : "Establish live Gemini 3.1 link"}>
              <Power className="w-3.5 h-3.5" />
              <span>{isConnected ? "DISCONNECT" : "CONNECT"}</span>
            </button>

            {/* Mute / Unmute Mic Button */}
            <button
              onClick={toggleMute}
              disabled={!isConnected}
              className={`flex items-center gap-1.5 px-3 py-1.5 chamfer-btn text-xs font-mono border transition-all cursor-pointer ${!isConnected
                ? "opacity-40 cursor-not-allowed border-[rgba(255,255,255,0.1)] text-[#7E859E]"
                : isMuted
                  ? "border-[#FFAA00] bg-[rgba(255,170,0,0.15)] text-[#FFAA00] shadow-[0_0_10px_rgba(255,170,0,0.2)]"
                  : "border-[rgba(255,184,0,0.4)] bg-[rgba(255,184,0,0.08)] text-[#FFB800] hover:border-[#FFB800] hover:bg-[rgba(255,184,0,0.18)]"
                }`}
              title={isMuted ? "Unmute microphone" : "Mute microphone"}>
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>{isMuted ? "UNMUTE MIC" : "MUTE MIC"}</span>
            </button>

            {/* Interrupt (Barge-In) Button */}
            <button
              onClick={handleBargeIn}
              disabled={!isConnected}
              className={`flex items-center gap-1.5 px-3 py-1.5 chamfer-btn text-xs font-mono border transition-all cursor-pointer ${!isConnected
                ? "opacity-40 cursor-not-allowed border-[rgba(255,255,255,0.1)] text-[#7E859E]"
                : "border-[rgba(255,184,0,0.5)] bg-[rgba(255,184,0,0.1)] text-[#FFB800] hover:bg-[rgba(255,184,0,0.25)] hover:border-[#FFB800] shadow-[0_0_8px_rgba(255,184,0,0.2)]"
                }`}
              title="Instantly stop Ultron's playback within 50ms (Barge-in)">
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">INTERRUPT</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Autonomous Daily / Tactical Briefing Button */}
            <button
              onClick={triggerBriefing}
              className="flex items-center gap-1.5 px-3 py-1.5 chamfer-btn text-xs font-mono border border-[rgba(255,184,0,0.3)] bg-[rgba(255,184,0,0.06)] text-[#FFB800] hover:border-[#FFB800] hover:bg-[rgba(255,184,0,0.15)] transition-all cursor-pointer shadow-[0_0_10px_rgba(255,184,0,0.15)]"
              title="Execute Autonomous Daily / Tactical Briefing">
              <SunMedium className="w-3.5 h-3.5 text-[#FFB800]" />
              <span className="hidden sm:inline">BRIEFING</span>
            </button>

            {/* Neural Memory Vault Modal Button */}
            <button
              onClick={() => setIsMemoryVaultOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 chamfer-btn text-xs font-mono border border-[rgba(255,184,0,0.3)] bg-[rgba(255,184,0,0.06)] text-[#FFB800] hover:border-[#FFB800] hover:bg-[rgba(255,184,0,0.15)] transition-all cursor-pointer"
              title="Open Neural Memory Vault">
              <Brain className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">MEMORIES</span>
            </button>

            {/* API Key Modal Button */}
            <button
              onClick={() => setIsKeyModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 chamfer-btn text-xs font-mono border border-[rgba(255,184,0,0.3)] bg-[rgba(255,184,0,0.06)] text-[#FFB800] hover:border-[#FFB800] hover:bg-[rgba(255,184,0,0.15)] transition-all cursor-pointer"
              title="Configure Gemini API Key">
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">API KEY</span>
            </button>

            {/* Secondary Utility Controls */}
            <button
              onClick={() => {
                if (isScreenModalOpen) {
                  window.dispatchEvent(new CustomEvent("ada-close-screen"));
                } else {
                  setIsScreenModalOpen(true);
                }
              }}
              className={`p-1.5 chamfer-btn text-xs border transition-all cursor-pointer ${isScreenSharing || isScreenModalOpen
                ? "border-[#FFB800] bg-[rgba(255,184,0,0.2)] text-[#FFB800]"
                : "border-[rgba(255,184,0,0.25)] bg-[rgba(255,184,0,0.04)] text-[#9E8B65] hover:text-[#FFB800] hover:border-[#FFB800]"
                }`}
              title={isScreenModalOpen ? "Close Screen Vision" : "Open Screen Vision"}>
              <Monitor className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                if (isWebcamOpen) {
                  window.dispatchEvent(new CustomEvent("ada-close-webcam"));
                } else {
                  setIsWebcamOpen(true);
                }
              }}
              className={`p-1.5 chamfer-btn text-xs border transition-all cursor-pointer ${isWebcamOpen
                ? "border-[#FFB800] bg-[rgba(255,184,0,0.2)] text-[#FFB800]"
                : "border-[rgba(255,184,0,0.25)] bg-[rgba(255,184,0,0.04)] text-[#9E8B65] hover:text-[#FFB800] hover:border-[#FFB800]"
                }`}
              title={isWebcamOpen ? "Close Webcam PiP" : "Open Webcam PiP"}>
              <Camera className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-1.5 chamfer-btn text-xs border border-[rgba(255,184,0,0.25)] bg-[rgba(255,184,0,0.04)] text-[#9E8B65] hover:text-[#FFB800] hover:border-[#FFB800] transition-all cursor-pointer"
              title="Open Operative Settings">
              <Settings className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                if (isMobileModalOpen) {
                  window.dispatchEvent(new CustomEvent("ada-close-mobile"));
                } else {
                  setIsMobileModalOpen(true);
                }
              }}
              className={`p-1.5 chamfer-btn text-xs border transition-all cursor-pointer ${isMobileModalOpen
                ? "border-[#FFB800] bg-[rgba(255,184,0,0.2)] text-[#FFB800] shadow-[0_0_15px_rgba(255,184,0,0.4)]"
                : "border-[rgba(255,184,0,0.25)] bg-[rgba(255,184,0,0.04)] text-[#9E8B65] hover:text-[#FFB800] hover:border-[#FFB800]"
                }`}
              title={isMobileModalOpen ? "Close Smartphone Pairing" : "Pair Smartphone via QR Code"}>
              <Smartphone className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Remote Pairing Modal */}
      <MobilePairingModal isOpen={isMobileModalOpen} onClose={() => setIsMobileModalOpen(false)} />

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        onSaveKey={(key) => {
          if (status === "DISCONNECTED") {
            connectSession(key);
          }
        }}
      />

      {/* Sci-Fi Syndicate Neural Memory Modal */}
      <SciFiMemoryModal />

      {/* Sci-Fi Neural Memory Vault Modal */}
      <SciFiMemoryVaultModal />

      {/* Floating Right-Side Comms Log Panel (No Backdrop Blur) */}
      <CommsLog sendTextMessage={sendTextMessage} />

      {/* Sci-Fi Operative Settings & Customization Modal */}
      <SciFiSettingsModal onReconnectSession={connectSession} />

      {/* Floating Left-Side Systems & Telemetry Panel */}
      <TelemetryPanel
        isConnected={isConnected}
        onToggleConnection={handleToggleConnection}
      />

      {/* Floating Freely-Movable Neural Intel & Reconnaissance Modal */}
      <IntelModal />
    </main>
  );
}

