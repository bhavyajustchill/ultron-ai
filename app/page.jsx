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
  History,
  Terminal,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SunMedium,
  Globe,
  Maximize2,
  Minimize2,
  Paperclip,
  Ear,
  EarOff,
  ListChecks,
} from "lucide-react";
import { useJarvisStore } from "@/lib/store";
import { useGeminiLive } from "@/hooks/useGeminiLive";
import { useApplyAccentTheme } from "@/hooks/useAccentTheme";
import { GEMINI_LIVE_LABEL } from "@/lib/jarvisPersona";
import { ApiKeyModal } from "@/components/HUD/ApiKeyModal";
import { UltronViewport } from "@/components/Canvas3D/UltronViewport";
import { ScreenShareModal } from "@/components/Vision/ScreenShareModal";
import { WebCamPiP } from "@/components/Vision/WebCamPiP";
import { MobilePairingModal } from "@/components/HUD/MobilePairingModal";
import { SciFiSettingsModal } from "@/components/HUD/SciFiSettingsModal";
import { SciFiMemoryVaultModal } from "@/components/HUD/SciFiMemoryVaultModal";
import { SciFiSessionVaultModal } from "@/components/HUD/SciFiSessionVaultModal";
import { CommsLog } from "@/components/HUD/CommsLog";
import { TelemetryPanel } from "@/components/HUD/TelemetryPanel";
import { IntelModal } from "@/components/HUD/IntelModal";
import { UploadDropZone } from "@/components/HUD/UploadDropZone";
import { YouTubePanel } from "@/components/Media/YouTubePanel";
import { useWakePhrase } from "@/hooks/useWakePhrase";
import { useIsCompact } from "@/hooks/useIsPhone";
import { DEFAULT_WAKE_PHRASE } from "@/lib/wakePhrase";
import { ModelViewerPanel } from "@/components/Media/ModelViewerPanel";
import { CommandConfirmModal } from "@/components/HUD/CommandConfirmModal";
import { ClipboardPanel } from "@/components/HUD/ClipboardPanel";
import { TodoPanel } from "@/components/HUD/TodoPanel";

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
    isIntelOpen,
    setIsIntelOpen,
    intelSearchResults,
    isTodoOpen,
    setIsTodoOpen,
    todoCounts,
    loadTodos,
  } = useJarvisStore();

  const [textInput, setTextInput] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  // iPhone Safari has no page fullscreen, so its button is hidden there
  const [canFullscreen, setCanFullscreen] = useState(true);
  const isCompact = useIsCompact();
  // Below 1024px the permanent Systems / Comms Log stack is hidden and one panel opens at a time under
  // the controls ("systems" | "comms" | null), full width on phones; desktop always shows both
  const [compactPanel, setCompactPanel] = useState(null);
  const toggleCompactPanel = (panel) => {
    setCompactPanel((open) => (open === panel ? null : panel));
    // The Task List shares that slot
    if (useJarvisStore.getState().isTodoOpen) window.dispatchEvent(new CustomEvent("jarvis-close-tasks"));
  };

  // Opening the Task List below 1024px closes Systems / Comms Log
  React.useEffect(() => {
    if (isCompact && isTodoOpen) setCompactPanel(null);
  }, [isCompact, isTodoOpen]);

  React.useEffect(() => {
    if (!isCompact || !compactPanel) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setCompactPanel(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCompact, compactPanel]);

  // Sync fullscreen state with document fullscreenchange
  React.useEffect(() => {
    setCanFullscreen(Boolean(document.fullscreenEnabled));
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
    loadTodos();
    // Offline "Hey Jarvis" (Phase 8.12) is used when its models are installed
    fetch("/api/wakeword")
      .then((res) => res.json())
      .then((data) => useJarvisStore.getState().setOfflineWakeReady(Boolean(data.installed)))
      .catch(() => {});
  }, [loadStoredApiKey, loadStoredMicMuted, loadMemories, loadTodos]);

  const {
    connectSession,
    disconnectSession,
    handleBargeIn,
    pcmPlayer,
    getInputByteFrequencyData,
    sendTextMessage,
    sendVideoFrame,
    sendContentParts,
    triggerBriefing,
  } = useGeminiLive();

  // HUD accent theme (Phase 8.7): CSS variables follow the operator's chosen accent
  useApplyAccentTheme();

  // Standby wake phrase: armed once the link has stayed offline for a moment, so startup and
  // reconnect blips never grab the microphone
  const operatorProfile = useJarvisStore((state) => state.operatorProfile);
  const wakeEnabled = operatorProfile?.wakeWordEnabled !== false;
  const wakePhrase = operatorProfile?.wakePhrase?.trim() || DEFAULT_WAKE_PHRASE;
  const [isStandby, setIsStandby] = useState(false);
  React.useEffect(() => {
    if (status !== "DISCONNECTED") {
      setIsStandby(false);
      return undefined;
    }
    const timer = setTimeout(() => setIsStandby(true), 1500);
    return () => clearTimeout(timer);
  }, [status]);
  const wakeState = useWakePhrase({
    enabled: wakeEnabled,
    active: isStandby,
    phrase: wakePhrase,
    onWake: () => {
      addCommsMessage("system", `[WAKE] "${wakePhrase}" detected. Linking Ultron..`);
      connectSession(userApiKey || loadStoredApiKey());
    },
  });
  const wakeChip = {
    listening: { text: `WAKE // SAY "${wakePhrase.toUpperCase()}"`, color: "text-[var(--jarvis-accent)] border-[rgba(var(--jarvis-accent-rgb),0.5)] bg-[rgba(var(--jarvis-accent-rgb),0.08)] animate-pulse", Icon: Ear },
    "listening-offline": { text: `WAKE // OFFLINE // SAY "${wakePhrase.toUpperCase()}"`, color: "text-[var(--jarvis-accent)] border-[rgba(var(--jarvis-accent-rgb),0.5)] bg-[rgba(var(--jarvis-accent-rgb),0.08)] animate-pulse", Icon: Ear },
    unsupported: { text: "WAKE // NEEDS CHROME OR EDGE", color: "text-[#9E8B65] border-[rgba(255,255,255,0.15)]", Icon: EarOff },
    blocked: { text: "WAKE // MIC BLOCKED", color: "text-[#FF8095] border-[rgba(255,0,60,0.4)]", Icon: EarOff },
    error: { text: "WAKE // RETRYING", color: "text-[#FFB020] border-[rgba(255,176,32,0.4)]", Icon: Ear },
    off: { text: "WAKE // ARMED FOR STANDBY", color: "text-[#9E8B65] border-[rgba(var(--jarvis-accent-rgb),0.2)]", Icon: Ear },
  }[wakeState];

  // Auto-initiate voice link upon client mount
  const autoConnectAttemptedRef = React.useRef(false);

  React.useEffect(() => {
    if (autoConnectAttemptedRef.current) return;
    autoConnectAttemptedRef.current = true;

    // Synchronously hydrate stored voice preference on client mount
    const { loadStoredVoiceName } = useJarvisStore.getState();
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

    // sendTextMessage logs the directive and links up first when offline
    sendTextMessage(trimmed);
    setTextInput("");
  };

  // Mobile Relay Synchronization Bridge (Phase 5)
  React.useEffect(() => {
    let isMounted = true;

    const syncRelay = async () => {
      try {
        const storeState = useJarvisStore.getState();
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
                // sendTextMessage logs the directive itself as the operator's turn
                storeState.addCommsMessage("system", "[MOBILE RELAY] Directive received from the paired phone.");
                sendTextMessage(d.payload);
              } else if (d.type === "os_action") {
                const allowedActions = [
                  "mute", "unmute", "volume_up", "volume_down",
                  "screenshot", "lock_screen", "browser", "editor",
                  "terminal", "calc", "explorer", "spotify", "minimize_all"
                ];
                if (allowedActions.includes(d.payload)) {
                  storeState.addCommsMessage(
                    "system",
                    `[MOBILE RELAY] Executing OS Action: ${d.payload}`,
                  );
                  storeState.executeOsActionApi(d.payload);
                } else {
                  storeState.addCommsMessage(
                    "system",
                    `[MOBILE RELAY] Refused unknown OS Action: ${d.payload}`,
                  );
                }
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
            "text-[var(--jarvis-accent)] border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.15)] shadow-[0_0_15px_rgba(var(--jarvis-accent-rgb),0.4)]",
          dot: "bg-[var(--jarvis-accent)] animate-ping",
        };
      case "LISTENING":
        return {
          text: "MIC // LISTENING",
          color:
            "text-[var(--jarvis-accent)] border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.1)] shadow-[0_0_15px_rgba(var(--jarvis-accent-rgb),0.3)]",
          dot: "bg-[var(--jarvis-accent)] animate-pulse",
        };
      case "CONNECTED":
        return isMuted
          ? {
            text: "MIC OFF // TEXT ONLY",
            color:
              "text-[var(--jarvis-accent)] border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.12)] shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.3)]",
            dot: "bg-[var(--jarvis-accent)]",
          }
          : {
            text: "LINK // READY",
            color:
              "text-[var(--jarvis-accent)] border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.1)] shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.25)]",
            dot: "bg-[var(--jarvis-accent)] animate-pulse",
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
      case "RECONNECTING":
        return {
          text: "LINK // RE-SYNCING...",
          color: "text-[#FFB020] border-[#FFB020] bg-[rgba(255,176,32,0.08)] shadow-[0_0_12px_rgba(255,176,32,0.25)]",
          dot: "bg-[#FFB020] animate-pulse",
        };
      default:
        return {
          text: "STANDBY // OFFLINE",
          color: "text-[#9E8B65] border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.03)]",
          dot: "bg-[#9E8B65]",
        };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    // Below 1024px (`lg`, see hooks/useIsPhone.js) the max-lg: classes put the controls in a row of their
    // own, the title below them, and a two-row dock at the bottom; phones (max-sm:) also get full-width
    // panels and room for the notch and home bar. h-dvh keeps the dock above mobile browser toolbars.
    <main className="relative w-screen h-dvh bg-black text-[#F0F2F8] overflow-hidden select-none">
      {/* Pure Black Void Backdrop */}
      <div className="absolute inset-0 bg-black pointer-events-none" />

      {/* TOP MIDDLE BRANDING: ULTRON // AUTONOMOUS ARTIFICIAL INTELLIGENCE SYSTEM */}
      <div className="absolute top-6 max-lg:top-[calc(env(safe-area-inset-top)_+_3.25rem)] left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none text-center">
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 bg-[var(--jarvis-accent)] animate-pulse shadow-[0_0_8px_var(--jarvis-accent)]" />
          <h1 className="font-['Orbitron',sans-serif] text-lg sm:text-xl md:text-2xl font-black tracking-[0.28em] text-[#F0F2F8] drop-shadow-[0_0_14px_rgba(var(--jarvis-accent-rgb),0.45)]">
            ULTRON
          </h1>
          <span className="w-1.5 h-1.5 bg-[var(--jarvis-accent)] animate-pulse shadow-[0_0_8px_var(--jarvis-accent)]" />
        </div>
        <span className="font-mono text-[8px] sm:text-[10px] md:text-[11px] tracking-[0.18em] sm:tracking-[0.24em] text-[var(--jarvis-accent)] uppercase font-bold mt-1 opacity-90 drop-shadow-[0_0_8px_rgba(var(--jarvis-accent-rgb),0.35)] whitespace-nowrap">
          AUTONOMOUS ARTIFICIAL INTELLIGENCE SYSTEM
        </span>
      </div>

      {/* TOP LEFT CLUSTER (BELOW 1024PX): SYSTEMS & COMMS LOG, which desktop shows permanently */}
      <div className="hidden max-lg:flex absolute top-[calc(env(safe-area-inset-top)_+_0.75rem)] left-4 sm:left-6 z-20 items-center gap-1.5">
        {[
          { panel: "systems", Icon: Activity, title: "Toggle Systems & Telemetry Panel" },
          { panel: "comms", Icon: Terminal, title: "Toggle Comms Log Feed" },
        ].map(({ panel, Icon, title }) => (
          <button
            key={panel}
            onClick={() => toggleCompactPanel(panel)}
            className={`flex items-center px-2.5 py-1.5 chamfer-btn text-xs font-mono font-semibold border transition-all cursor-pointer ${compactPanel === panel
              ? "border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.2)] text-[var(--jarvis-accent)] shadow-[0_0_15px_rgba(var(--jarvis-accent-rgb),0.4)]"
              : "border-[rgba(var(--jarvis-accent-rgb),0.2)] bg-[rgba(15,12,5,0.35)] backdrop-blur-xl backdrop-saturate-150 text-[#9E8B65] shadow-[0_0_20px_rgba(var(--jarvis-accent-rgb),0.08),inset_0_1px_0_rgba(255,255,255,0.05)]"
              }`}
            title={title}>
            <Icon className="w-3.5 h-3.5 text-[var(--jarvis-accent)]" />
          </button>
        ))}
      </div>

      {/* TOP RIGHT CLUSTER: TASKS + INTEL + ZOOM CONTROLS + FULLSCREEN */}
      <div className="absolute top-6 right-6 max-lg:top-[calc(env(safe-area-inset-top)_+_0.75rem)] max-sm:right-4 z-20 flex items-center gap-2 max-sm:gap-1.5">
        {/* Task List Toggle (Phase 15) */}
        <button
          onClick={() => {
            if (isTodoOpen) {
              window.dispatchEvent(new CustomEvent("jarvis-close-tasks"));
            } else {
              setIsTodoOpen(true);
            }
          }}
          className={`flex items-center gap-2 px-3 max-sm:px-2.5 py-1.5 chamfer-btn text-xs font-mono font-semibold border transition-all cursor-pointer ${isTodoOpen
            ? "border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.2)] text-[var(--jarvis-accent)] shadow-[0_0_15px_rgba(var(--jarvis-accent-rgb),0.4)]"
            : "border-[rgba(var(--jarvis-accent-rgb),0.2)] bg-[rgba(15,12,5,0.35)] backdrop-blur-xl backdrop-saturate-150 text-[#9E8B65] hover:text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.1)] shadow-[0_0_20px_rgba(var(--jarvis-accent-rgb),0.08),inset_0_1px_0_rgba(255,255,255,0.05)]"
            }`}
          title="Toggle Task List">
          <ListChecks className="w-3.5 h-3.5 text-[var(--jarvis-accent)]" />
          <span className="hidden md:inline tracking-wider">TASKS</span>
          {todoCounts.open > 0 && (
            <span className="max-sm:hidden text-[10px] px-1.5 py-0.2 chamfer-xs bg-[rgba(var(--jarvis-accent-rgb),0.2)] text-[var(--jarvis-accent)] font-bold border border-[rgba(var(--jarvis-accent-rgb),0.4)]">
              {todoCounts.open}
            </span>
          )}
        </button>

        {/* Intel Modal Toggle */}
        <button
          onClick={() => {
            if (isIntelOpen) {
              window.dispatchEvent(new CustomEvent("jarvis-close-intel"));
            } else {
              setIsIntelOpen(true);
            }
          }}
          className={`flex items-center gap-2 px-3 max-sm:px-2.5 py-1.5 chamfer-btn text-xs font-mono font-semibold border transition-all cursor-pointer ${isIntelOpen
            ? "border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.2)] text-[var(--jarvis-accent)] shadow-[0_0_15px_rgba(var(--jarvis-accent-rgb),0.4)]"
            : "border-[rgba(var(--jarvis-accent-rgb),0.2)] bg-[rgba(15,12,5,0.35)] backdrop-blur-xl backdrop-saturate-150 text-[#9E8B65] hover:text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.1)] shadow-[0_0_20px_rgba(var(--jarvis-accent-rgb),0.08),inset_0_1px_0_rgba(255,255,255,0.05)]"
            }`}
          title="Toggle Neural Intel & Dossiers Window">
          <Globe className="w-3.5 h-3.5 text-[var(--jarvis-accent)]" />
          <span className="hidden md:inline tracking-wider">INTEL</span>
          {intelSearchResults && intelSearchResults.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 chamfer-xs bg-[rgba(var(--jarvis-accent-rgb),0.2)] text-[var(--jarvis-accent)] font-bold border border-[rgba(var(--jarvis-accent-rgb),0.4)]">
              {intelSearchResults.length}
            </span>
          )}
        </button>

        {/* Camera Zoom & Reset Controls */}
        <div className="flex items-center gap-0.5 p-1 chamfer-btn border border-[rgba(var(--jarvis-accent-rgb),0.2)] bg-[rgba(15,12,5,0.35)] backdrop-blur-xl backdrop-saturate-150 text-[10px] font-mono shadow-[0_0_20px_rgba(var(--jarvis-accent-rgb),0.08),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("jarvis-camera-action", { detail: "in" }))}
            className="p-1 chamfer-xs text-[#9E8B65] hover:text-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.1)] transition-colors cursor-pointer"
            title="Zoom In (or scroll up)">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("jarvis-camera-action", { detail: "out" }))}
            className="p-1 chamfer-xs text-[#9E8B65] hover:text-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.1)] transition-colors cursor-pointer"
            title="Zoom Out (or scroll down)">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("jarvis-camera-action", { detail: "reset" }))}
            className="p-1 chamfer-xs text-[#9E8B65] hover:text-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.1)] transition-colors cursor-pointer"
            title="Reset Camera View">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Fullscreen Toggle Button (hidden where the browser has no page fullscreen) */}
        <button
          onClick={toggleFullscreen}
          className={`${canFullscreen ? "flex" : "hidden"} items-center justify-center px-2.5 max-sm:px-2 py-1.5 chamfer-btn text-xs font-mono font-semibold border transition-all cursor-pointer ${isFullscreen
            ? "border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.2)] text-[var(--jarvis-accent)] shadow-[0_0_15px_rgba(var(--jarvis-accent-rgb),0.4)]"
            : "border-[rgba(var(--jarvis-accent-rgb),0.2)] bg-[rgba(15,12,5,0.35)] backdrop-blur-xl backdrop-saturate-150 text-[#9E8B65] hover:text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.1)] shadow-[0_0_20px_rgba(var(--jarvis-accent-rgb),0.08),inset_0_1px_0_rgba(255,255,255,0.05)]"
            }`}
          title={isFullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen"}>
          {isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5 text-[var(--jarvis-accent)]" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
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
      <div className="absolute bottom-5 max-sm:bottom-[calc(env(safe-area-inset-bottom)_+_0.75rem)] left-0 right-0 z-20 w-full px-6 max-sm:px-4 sm:px-10 md:px-14 flex flex-col gap-2.5 max-sm:gap-2 items-center">
        {/* Subtle Live Status & Latency Line */}
        <div className="flex items-center justify-between w-full px-1 py-0.5 text-[10px] font-mono">
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 px-2.5 py-0.5 chamfer-xs border transition-all ${statusBadge.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
              <span className="tracking-wider font-semibold">{statusBadge.text}</span>
            </div>
            {wakeEnabled && wakeChip && (
              <div
                className={`hidden sm:flex items-center gap-1.5 px-2 py-0.5 chamfer-xs border bg-[rgba(15,12,5,0.45)] tracking-wider ${wakeChip.color}`}
                title="Standby wake phrase (configure in Settings)">
                <wakeChip.Icon className="w-3 h-3" />
                <span>{wakeChip.text}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[#9E8B65] border border-[rgba(var(--jarvis-accent-rgb),0.2)] bg-[rgba(15,12,5,0.45)] backdrop-blur-lg px-2 py-0.5 chamfer-xs">
            <Wifi className="w-3 h-3 text-[var(--jarvis-accent)]" />
            <span>{latencyMs > 0 ? `${latencyMs}ms` : "STANDBY"}</span>
          </div>
        </div>

        {/* Text Directive Input Bar (Standard Full-Width Underline) */}
        <form
          onSubmit={handleSendText}
          className="relative w-full flex items-center gap-3 pb-2 pt-1 border-b-2 border-[rgba(var(--jarvis-accent-rgb),0.25)] hover:border-[rgba(var(--jarvis-accent-rgb),0.55)] focus-within:border-[var(--jarvis-accent)] focus-within:shadow-[0_4px_16px_-2px_rgba(var(--jarvis-accent-rgb),0.4)] transition-all bg-transparent">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder={
              isMuted
                ? "MIC MUTED // Type directive to Ultron. [Enter]"
                : isConnected
                  ? "Transmit directive or query to Ultron. [Enter]"
                  : "Type directive or click Connect... [Enter]"
            }
            className="flex-1 bg-transparent text-sm sm:text-base font-mono text-[#F0F2F8] placeholder-[rgba(158,139,101,0.6)] px-1 py-1 outline-none min-w-0 tracking-wide"
          />

          <button
            type="submit"
            disabled={!textInput.trim()}
            title="Transmit directive [Enter]"
            aria-label="Send directive"
            className="flex items-center justify-center p-2 text-[var(--jarvis-accent)] hover:text-white disabled:opacity-25 disabled:pointer-events-none transition-all cursor-pointer shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* Action Controls Cluster (phones: link controls in three equal buttons, then a row of nine icons) */}
        <div className="flex items-center justify-between w-full gap-2 pt-1 max-lg:flex-col max-lg:items-stretch">
          <div className="flex items-center gap-2 max-lg:grid max-lg:grid-cols-3">
            {/* Connect / Disconnect Button */}
            <button
              onClick={handleToggleConnection}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 max-lg:justify-center max-sm:gap-1 max-sm:px-1.5 max-lg:py-2 chamfer-btn text-xs font-mono font-semibold transition-all cursor-pointer ${isConnected
                ? "border border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.15)] text-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.25)] shadow-[0_0_12px_rgba(var(--jarvis-accent-rgb),0.3)]"
                : "bg-[var(--jarvis-accent)] hover:bg-[var(--jarvis-accent-soft)] text-[#080602] shadow-[0_0_15px_rgba(var(--jarvis-accent-rgb),0.5)] font-bold"
                }`}
              title={isConnected ? "Disconnect WebSocket link" : `Establish live ${GEMINI_LIVE_LABEL} link`}>
              <Power className="w-3.5 h-3.5" />
              <span>{isConnected ? "DISCONNECT" : "CONNECT"}</span>
            </button>

            {/* Mute / Unmute Mic Button */}
            <button
              onClick={toggleMute}
              disabled={!isConnected}
              className={`flex items-center gap-1.5 px-3 py-1.5 max-lg:justify-center max-sm:gap-1 max-sm:px-1.5 max-lg:py-2 chamfer-btn text-xs font-mono border transition-all cursor-pointer ${!isConnected
                ? "opacity-40 cursor-not-allowed border-[rgba(255,255,255,0.1)] text-[#9E8B65]"
                : isMuted
                  ? "border-[#FFAA00] bg-[rgba(255,170,0,0.15)] text-[#FFAA00] shadow-[0_0_10px_rgba(255,170,0,0.2)]"
                  : "border-[rgba(var(--jarvis-accent-rgb),0.4)] bg-[rgba(var(--jarvis-accent-rgb),0.08)] text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.18)]"
                }`}
              title={isMuted ? "Unmute microphone" : "Mute microphone"}>
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              <span>
                {isMuted ? "UNMUTE" : "MUTE"}
                <span className="max-sm:hidden">{" MIC"}</span>
              </span>
            </button>

            {/* Interrupt (Barge-In) Button */}
            <button
              onClick={handleBargeIn}
              disabled={!isConnected}
              className={`flex items-center gap-1.5 px-3 py-1.5 max-lg:justify-center max-sm:gap-1 max-sm:px-1.5 max-lg:py-2 chamfer-btn text-xs font-mono border transition-all cursor-pointer ${!isConnected
                ? "opacity-40 cursor-not-allowed border-[rgba(255,255,255,0.1)] text-[#9E8B65]"
                : "border-[rgba(var(--jarvis-accent-rgb),0.5)] bg-[rgba(var(--jarvis-accent-rgb),0.1)] text-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.25)] hover:border-[var(--jarvis-accent)] shadow-[0_0_8px_rgba(var(--jarvis-accent-rgb),0.2)]"
                }`}
              title="Instantly stop Ultron's playback within 50ms (Barge-in)">
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="max-[359px]:hidden">INTERRUPT</span>
            </button>
          </div>

          <div className="flex items-center gap-2 max-lg:grid max-lg:grid-cols-9 max-sm:gap-1">
            {/* Autonomous Daily / Tactical Briefing Button */}
            <button
              onClick={triggerBriefing}
              className="flex items-center gap-1.5 px-3 py-1.5 max-lg:justify-center max-lg:px-0 max-lg:py-2.5 chamfer-btn text-xs font-mono border border-[rgba(var(--jarvis-accent-rgb),0.3)] bg-[rgba(var(--jarvis-accent-rgb),0.06)] text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.15)] transition-all cursor-pointer shadow-[0_0_10px_rgba(var(--jarvis-accent-rgb),0.15)]"
              title="Execute Autonomous Daily / Tactical Briefing">
              <SunMedium className="w-3.5 h-3.5 text-[var(--jarvis-accent)]" />
              <span className="hidden lg:inline">BRIEFING</span>
            </button>

            {/* Neural Memory Vault Modal Button */}
            <button
              onClick={() => setIsMemoryVaultOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 max-lg:justify-center max-lg:px-0 max-lg:py-2.5 chamfer-btn text-xs font-mono border border-[rgba(var(--jarvis-accent-rgb),0.3)] bg-[rgba(var(--jarvis-accent-rgb),0.06)] text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.15)] transition-all cursor-pointer"
              title="Open Neural Memory Vault">
              <Brain className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">MEMORIES</span>
            </button>

            {/* Session Archive Button (Phase 11) */}
            <button
              onClick={() => useJarvisStore.getState().setIsSessionVaultOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 max-lg:justify-center max-lg:px-0 max-lg:py-2.5 chamfer-btn text-xs font-mono border border-[rgba(var(--jarvis-accent-rgb),0.3)] bg-[rgba(var(--jarvis-accent-rgb),0.06)] text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.15)] transition-all cursor-pointer"
              title="Open the Session Archive: past conversations and recaps">
              <History className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">SESSIONS</span>
            </button>

            {/* File Uplink Button (drag-and-drop works anywhere on the HUD too) */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("jarvis-open-upload"))}
              className="flex items-center gap-1.5 px-3 py-1.5 max-lg:justify-center max-lg:px-0 max-lg:py-2.5 chamfer-btn text-xs font-mono border border-[rgba(var(--jarvis-accent-rgb),0.3)] bg-[rgba(var(--jarvis-accent-rgb),0.06)] text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.15)] transition-all cursor-pointer"
              title="Upload files to Ultron (or drag and drop anywhere)">
              <Paperclip className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">UPLOAD</span>
            </button>

            {/* API Key Modal Button */}
            <button
              onClick={() => setIsKeyModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 max-lg:justify-center max-lg:px-0 max-lg:py-2.5 chamfer-btn text-xs font-mono border border-[rgba(var(--jarvis-accent-rgb),0.3)] bg-[rgba(var(--jarvis-accent-rgb),0.06)] text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)] hover:bg-[rgba(var(--jarvis-accent-rgb),0.15)] transition-all cursor-pointer"
              title="Configure Gemini API Key">
              <Key className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">API KEY</span>
            </button>

            {/* Secondary Utility Controls */}
            <button
              onClick={() => {
                if (isScreenModalOpen) {
                  window.dispatchEvent(new CustomEvent("jarvis-close-screen"));
                } else {
                  setIsScreenModalOpen(true);
                }
              }}
              className={`p-1.5 max-lg:flex max-lg:items-center max-lg:justify-center max-lg:py-2.5 chamfer-btn text-xs border transition-all cursor-pointer ${isScreenSharing || isScreenModalOpen
                ? "border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.2)] text-[var(--jarvis-accent)]"
                : "border-[rgba(var(--jarvis-accent-rgb),0.25)] bg-[rgba(var(--jarvis-accent-rgb),0.04)] text-[#9E8B65] hover:text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)]"
                }`}
              title={isScreenModalOpen ? "Close Screen Vision" : "Open Screen Vision"}>
              <Monitor className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                if (isWebcamOpen) {
                  window.dispatchEvent(new CustomEvent("jarvis-close-webcam"));
                } else {
                  setIsWebcamOpen(true);
                }
              }}
              className={`p-1.5 max-lg:flex max-lg:items-center max-lg:justify-center max-lg:py-2.5 chamfer-btn text-xs border transition-all cursor-pointer ${isWebcamOpen
                ? "border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.2)] text-[var(--jarvis-accent)]"
                : "border-[rgba(var(--jarvis-accent-rgb),0.25)] bg-[rgba(var(--jarvis-accent-rgb),0.04)] text-[#9E8B65] hover:text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)]"
                }`}
              title={isWebcamOpen ? "Close Webcam PiP" : "Open Webcam PiP"}>
              <Camera className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-1.5 max-lg:flex max-lg:items-center max-lg:justify-center max-lg:py-2.5 chamfer-btn text-xs border border-[rgba(var(--jarvis-accent-rgb),0.25)] bg-[rgba(var(--jarvis-accent-rgb),0.04)] text-[#9E8B65] hover:text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)] transition-all cursor-pointer"
              title="Open Operative Settings">
              <Settings className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                if (isMobileModalOpen) {
                  window.dispatchEvent(new CustomEvent("jarvis-close-mobile"));
                } else {
                  setIsMobileModalOpen(true);
                }
              }}
              className={`p-1.5 max-lg:flex max-lg:items-center max-lg:justify-center max-lg:py-2.5 chamfer-btn text-xs border transition-all cursor-pointer ${isMobileModalOpen
                ? "border-[var(--jarvis-accent)] bg-[rgba(var(--jarvis-accent-rgb),0.2)] text-[var(--jarvis-accent)] shadow-[0_0_15px_rgba(var(--jarvis-accent-rgb),0.4)]"
                : "border-[rgba(var(--jarvis-accent-rgb),0.25)] bg-[rgba(var(--jarvis-accent-rgb),0.04)] text-[#9E8B65] hover:text-[var(--jarvis-accent)] hover:border-[var(--jarvis-accent)]"
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

      {/* Sci-Fi Neural Memory Vault Modal */}
      <SciFiMemoryVaultModal />

      {/* Session Archive Modal (Phase 11) */}
      <SciFiSessionVaultModal />

      {/* PERMANENT LEFT HUD STACK (SYSTEMS ABOVE, COMMS LOG ON BOTTOM); below 1024px one panel at a time
          under the controls row (full width on phones), opened from the buttons in the top left; at
          1024-1279px it starts below the title so it never covers the subtitle */}
      <aside
        className={`fixed top-6 lg:max-xl:top-24 left-4 sm:left-6 bottom-40 w-88 sm:w-96 max-w-[calc(100vw-2rem)] z-30 flex flex-col gap-2.5 pointer-events-none max-lg:top-[calc(env(safe-area-inset-top)_+_3.5rem)] max-sm:left-3 max-sm:right-3 max-lg:bottom-auto max-lg:h-[55dvh] max-sm:w-auto max-sm:max-w-none ${compactPanel ? "" : "max-lg:hidden"} ${isCompact && compactPanel ? "scifi-modal-unfold-down" : ""}`}>
        <div className={`flex-[1.15] min-h-0 flex flex-col pointer-events-auto ${compactPanel === "comms" ? "max-lg:hidden" : ""}`}>
          <TelemetryPanel
            isConnected={isConnected}
            onToggleConnection={handleToggleConnection}
          />
        </div>
        <div className={`flex-1 min-h-0 flex flex-col pointer-events-auto ${compactPanel === "systems" ? "max-lg:hidden" : ""}`}>
          <CommsLog sendTextMessage={sendTextMessage} />
        </div>
      </aside>

      {/* Task List Panel (Phase 15) */}
      <TodoPanel />

      {/* Sci-Fi Operative Settings & Customization Modal */}
      <SciFiSettingsModal onReconnectSession={connectSession} />

      {/* Floating Freely-Movable Neural Intel & Reconnaissance Modal */}
      <IntelModal />

      {/* Window-Wide Drag-and-Drop File Uplink */}
      <UploadDropZone onSendParts={sendContentParts} />

      {/* Media Deck: Built-in YouTube Player & 3D Model Holo-Viewer */}
      <YouTubePanel />
      <ModelViewerPanel />

      {/* Terminal Command Authorization Gate */}
      <CommandConfirmModal />
      <ClipboardPanel />
    </main>
  );
}

