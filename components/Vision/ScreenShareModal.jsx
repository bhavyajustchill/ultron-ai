"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Monitor,
  Video,
  VideoOff,
  X,
  Play,
  Pause,
  Camera,
  Shield,
  Zap,
  Activity,
  Maximize2,
  Minimize2,
  GripHorizontal,
} from "lucide-react";
import { useAdaStore } from "@/lib/store";

/**
 * ScreenShareModal
 * Real-time desktop screen capture & frame streaming to Gemini 2.5 Live
 * Bounded floating cyber-window inside the 3D stage with zero chat UI blockage.
 */
export function ScreenShareModal({ isOpen, onClose, sendVideoFrame }) {
  const {
    isScreenSharing,
    setIsScreenSharing,
    visionMode,
    setVisionMode,
    visionInterval,
    setVisionInterval,
    visionFramesSent,
    incrementVisionFrames,
    resetVisionFrames,
    setActiveVisionSource,
    addCommsMessage,
  } = useAdaStore();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const streamIntervalRef = useRef(null);

  const [streamResolution, setStreamResolution] = useState({ width: 0, height: 0 });
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastCaptureTime, setLastCaptureTime] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [isMinimized, setIsMinimized] = useState(false);

  // Sci-Fi Shutter Open/Close Animation State
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);

  // Free Dragging State & Viewport Clamping
  const [position, setPosition] = useState(null); // { x: number, y: number }
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const panelRef = useRef(null);

  // Initialize position below Comms Log on right side
  useEffect(() => {
    if (isOpen && position === null && typeof window !== "undefined") {
      const panelWidth = panelRef.current?.offsetWidth || 384;
      const defaultX = Math.max(20, window.innerWidth - panelWidth - 24);
      // Comms Log is top-18 (72px) with h-[44vh] max-h-[440px]
      const commsBottom = 72 + Math.min(440, window.innerHeight * 0.44);
      const defaultY = Math.min(
        Math.max(commsBottom + 16, 480),
        Math.max(100, window.innerHeight - 340)
      );
      setPosition({ x: defaultX, y: defaultY });
    }
  }, [isOpen, position]);

  // Handle Free Pointer Dragging
  const handlePointerDown = (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (e.target.closest("button") || e.target.closest("input") || e.target.closest("select")) {
      return;
    }

    const currentX = position?.x ?? (typeof window !== "undefined" ? window.innerWidth - 400 : 800);
    const currentY = position?.y ?? 500;

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: currentX,
      posY: currentY,
    };
    setIsDragging(true);

    const onPointerMove = (moveEvent) => {
      const dx = moveEvent.clientX - dragStartRef.current.startX;
      const dy = moveEvent.clientY - dragStartRef.current.startY;

      const panelWidth = panelRef.current?.offsetWidth || 384;
      const panelHeight = panelRef.current?.offsetHeight || 250;

      const maxX = Math.max(10, window.innerWidth - panelWidth - 10);
      const maxY = Math.max(10, window.innerHeight - panelHeight - 10);

      const nextX = Math.min(Math.max(10, dragStartRef.current.posX + dx), maxX);
      const nextY = Math.min(Math.max(10, dragStartRef.current.posY + dy), maxY);

      setPosition({ x: nextX, y: nextY });
    };

    const onPointerUp = () => {
      setIsDragging(false);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  // Stop active display media stream
  const stopStream = useCallback(() => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    setIsStreaming(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScreenSharing(false);
    setActiveVisionSource("none");
    setStreamResolution({ width: 0, height: 0 });
  }, [setIsScreenSharing, setActiveVisionSource]);

  // Capture single frame and transmit to Gemini Live
  const captureAndTransmitFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.videoWidth === 0) return false;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;

    // Rescale to 1280px max width for optimal token latency
    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Compress as JPEG 72% quality
    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);

    if (sendVideoFrame) {
      const sent = sendVideoFrame(dataUrl, "image/jpeg");
      if (sent) {
        incrementVisionFrames();
        setLastCaptureTime(new Date().toLocaleTimeString());
        return true;
      }
    }
    return false;
  }, [sendVideoFrame, incrementVisionFrames]);

  // Start desktop display media capture
  const startScreenCapture = async () => {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          frameRate: { ideal: 15, max: 30 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Handle user pressing browser native "Stop sharing" bar
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          stopStream();
          addCommsMessage("system", "Desktop interrogation feed terminated by host.");
        };

        const settings = videoTrack.getSettings();
        if (settings.width && settings.height) {
          setStreamResolution({ width: settings.width, height: settings.height });
        }
      }

      setIsScreenSharing(true);
      setActiveVisionSource("screen");
      resetVisionFrames();
      addCommsMessage("system", "Desktop vision link established. Interrogation channel active.");
    } catch (err) {
      console.error("[ScreenShareModal] Error starting screen capture:", err);
      if (err.name !== "NotAllowedError") {
        setErrorMsg(`Failed to initiate display capture: ${err.message}`);
      }
    }
  };

  // Toggle continuous surveillance streaming loop
  const toggleContinuousStream = () => {
    if (isStreaming) {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
      setIsStreaming(false);
      setVisionMode("snapshot");
      addCommsMessage("system", "Continuous visual stream paused. Snapshot mode ready.");
    } else {
      // First frame immediate
      captureAndTransmitFrame();
      streamIntervalRef.current = setInterval(() => {
        captureAndTransmitFrame();
      }, visionInterval);
      setIsStreaming(true);
      setVisionMode("stream");
      addCommsMessage(
        "system",
        `Continuous visual feed engaged (${(1000 / visionInterval).toFixed(1)} FPS).`,
      );
    }
  };

  // Manual single snapshot action
  const handleTransmitSnapshot = () => {
    const success = captureAndTransmitFrame();
    if (success) {
      addCommsMessage("system", `Tactical snapshot transmitted to J.A.R.V.I.S`);
    } else {
      setErrorMsg("Failed to transmit frame. Ensure live session is connected.");
    }
  };

  // Smooth Shutter Close and immediate screen share termination
  const triggerClose = useCallback(() => {
    if (isClosing) return;
    stopStream();
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsClosing(false);
      onClose?.();
    }, 220); // Matches 0.22s scifi-modal-collapse-up keyframe
  }, [isClosing, stopStream, onClose]);

  // Terminate stream if closed externally
  useEffect(() => {
    if (!isOpen && streamRef.current) {
      stopStream();
    }
  }, [isOpen, stopStream]);

  // Listen for external close toggle event (e.g. from bottom dock button)
  useEffect(() => {
    const handleExternalClose = () => {
      if (isOpen) {
        triggerClose();
      }
    };
    window.addEventListener("ada-close-screen", handleExternalClose);
    return () => window.removeEventListener("ada-close-screen", handleExternalClose);
  }, [isOpen, triggerClose]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && isOpen) {
        triggerClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, triggerClose]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  if (!isOpen && !isClosing) return null;

  return (
    <div
      ref={panelRef}
      style={
        position
          ? {
            left: `${position.x}px`,
            top: `${position.y}px`,
            transition: isDragging ? "none" : "box-shadow 0.2s ease",
          }
          : undefined
      }
      className={`fixed z-35 ${!position ? "top-[52vh] right-6" : ""
        } ${isMinimized ? "w-72 sm:w-80" : "w-80 sm:w-96"
        } chamfer-lg border border-[rgba(255, 184, 0,0.25)] bg-[rgba(15,12,5,0.65)] backdrop-blur-xl backdrop-saturate-150 shadow-[0_0_40px_rgba(255, 184, 0,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col overflow-hidden ${isDragging ? "shadow-[0_0_50px_rgba(255, 184, 0,0.25)] border-[rgba(255, 184, 0,0.5)]" : ""
        } ${isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"}`}>
      {/* Top Accent Gradient Line */}
      <div className="mx-4 mt-1 h-0.5 w-[calc(100%-32px)] bg-gradient-to-r from-[#FFB800] via-[#FFD54F] to-[#FFB800] animate-pulse shrink-0" />

      {/* Header */}
      <div
        onPointerDown={handlePointerDown}
        className="flex items-center justify-between px-3 py-2 border-b border-[rgba(255, 184, 0,0.18)] bg-[rgba(255, 184, 0,0.04)] select-none cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2 pointer-events-none">
          <GripHorizontal className="w-3.5 h-3.5 text-[#FFB800]/60" />
          <div className="p-1 chamfer-xs bg-[rgba(255, 184, 0,0.12)] border border-[rgba(255, 184, 0,0.3)] text-[#FFB800]">
            <Monitor className="w-3 h-3" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold tracking-wider text-[#F0F2F8] font-mono">
                SCREEN OPTIC // INTERROGATION
              </span>
              {isStreaming && (
                <span className="px-1 py-0.2 chamfer-xs bg-[rgba(255, 184, 0,0.25)] border border-[#FFB800] text-[#FFB800] text-[8px] font-mono animate-pulse">
                  REC
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => setIsMinimized((prev) => !prev)}
            className="p-1 chamfer-xs text-[#9E8B65] hover:text-[#F0F2F8] hover:bg-[rgba(255,255,255,0.05)] transition-colors cursor-pointer"
            title={isMinimized ? "Expand Window" : "Minimize Window"}>
            {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </button>
          <button
            onClick={triggerClose}
            className="p-1 chamfer-xs text-[#9E8B65] hover:text-[#FFB800] hover:bg-[rgba(255, 184, 0,0.1)] transition-colors cursor-pointer"
            title="Close Window (Esc)">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Video Viewport - Remains mounted even when minimized to keep stream active */}
      <div
        className={`relative w-full aspect-video bg-[#050508] flex items-center justify-center overflow-hidden border-b border-[rgba(255,255,255,0.06)] ${isMinimized ? "hidden" : "block"}`}>
        {/* Tactical Corner Reticles */}
        <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-[#FFB800] pointer-events-none z-10" />
        <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-[#FFB800] pointer-events-none z-10" />
        <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-[#FFB800] pointer-events-none z-10" />
        <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-[#FFB800] pointer-events-none z-10" />

        {/* Active Video Element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-contain ${!isScreenSharing ? "hidden" : "block"}`}
          onLoadedMetadata={(e) => {
            setStreamResolution({
              width: e.target.videoWidth,
              height: e.target.videoHeight,
            });
          }}
        />

        {/* Fallback Standby Display */}
        {!isScreenSharing && (
          <div className="flex flex-col items-center justify-center gap-2 p-4 text-center z-10">
            <div className="p-2 chamfer-md border border-[rgba(255, 184, 0,0.3)] bg-[rgba(255, 184, 0,0.05)] text-[#FFB800] animate-pulse">
              <Monitor className="w-6 h-6" />
            </div>
            <div className="max-w-xs">
              <h3 className="text-[11px] font-semibold text-[#F0F2F8] font-mono">
                SCREEN INTERROGATION
              </h3>
              <p className="text-[10px] text-[#9E8B65] mt-0.5 font-mono leading-relaxed">
                Feed active desktop or window to J.A.R.V.I.S
              </p>
            </div>
            <button
              onClick={startScreenCapture}
              className="mt-1 flex items-center gap-1.5 px-3 py-1 chamfer-btn bg-[#FFB800] hover:bg-[#ffc833] text-black text-[10px] font-mono font-semibold shadow-[0_0_12px_rgba(255, 184, 0,0.4)] transition-all cursor-pointer">
              <Video className="w-3 h-3" />
              <span>ENGAGE CAPTURE</span>
            </button>
          </div>
        )}

        {/* Real-time Streaming Overlay Indicator */}
        {isStreaming && (
          <div className="absolute top-2 left-2 z-20 flex items-center gap-1 px-2 py-0.5 chamfer-xs bg-[rgba(255, 184, 0,0.85)] text-black text-[8px] font-mono font-bold tracking-widest shadow-[0_0_10px_rgba(255, 184, 0,0.6)]">
            <span className="w-1.5 h-1.5 rounded-full bg-black animate-ping" />
            <span>REC // CONTINUOUS</span>
          </div>
        )}

        {lastCaptureTime && (
          <div className="absolute bottom-2 right-2 z-20 px-1.5 py-0.5 chamfer-xs bg-[rgba(10,11,16,0.85)] border border-[rgba(255, 184, 0,0.3)] text-[8px] font-mono text-[#FFB800]">
            {lastCaptureTime}
          </div>
        )}
      </div>

      {/* Error message strip if any */}
      {errorMsg && (
        <div className="px-3 py-1 bg-[rgba(255,0,60,0.15)] border-b border-[rgba(255,0,60,0.3)] text-[10px] font-mono text-[#FF8095]">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Tactical Control Rail */}
      <div className="flex items-center justify-between p-2 bg-[rgba(14,16,23,0.95)] gap-2">
        <div className="flex items-center gap-1.5">
          {isScreenSharing ? (
            <>
              <button
                onClick={handleTransmitSnapshot}
                className="flex items-center gap-1 px-2 py-1 chamfer-btn bg-[rgba(255, 184, 0,0.1)] border border-[#FFB800] text-[#FFB800] hover:bg-[rgba(255, 184, 0,0.2)] text-[10px] font-mono font-semibold transition-all cursor-pointer"
                title="Transmit current screen frame to J.A.R.V.I.S">
                <Camera className="w-2.5 h-2.5" />
                <span>SNAPSHOT</span>
              </button>

              <button
                onClick={toggleContinuousStream}
                className={`flex items-center gap-1 px-2 py-1 chamfer-btn text-[10px] font-mono font-semibold border transition-all cursor-pointer ${isStreaming
                    ? "border-[#FFB800] bg-[rgba(255, 184, 0,0.2)] text-[#FFB800]"
                    : "border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.05)] text-[#F0F2F8] hover:border-[#FFB800]"
                  }`}
                title="Stream frames continuously">
                {isStreaming ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                <span>{isStreaming ? "STOP" : "STREAM"}</span>
              </button>

              {!isMinimized && (
                <div className="flex items-center gap-1 text-[9px] font-mono text-[#9E8B65]">
                  <select
                    value={visionInterval}
                    onChange={(e) => setVisionInterval(Number(e.target.value))}
                    className="bg-[#0A0B10] border border-[rgba(255,255,255,0.15)] chamfer-xs px-1.5 py-0.5 text-[9px] font-mono text-[#FFB800] focus:outline-none focus:border-[#FFB800]">
                    <option value={1000}>1.0s</option>
                    <option value={1500}>1.5s</option>
                    <option value={2000}>2.0s</option>
                    <option value={3000}>3.0s</option>
                  </select>
                </div>
              )}
            </>
          ) : (
            <div className="text-[9px] font-mono text-[#9E8B65] flex items-center gap-1">
              <Shield className="w-2.5 h-2.5 text-[#FFB800]" />
              <span>STANDBY</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-[9px] font-mono text-[#9E8B65]">
          {isScreenSharing && (
            <button
              onClick={stopStream}
              className="flex items-center gap-1 px-2 py-0.5 chamfer-btn border border-[rgba(255, 184, 0,0.4)] bg-[rgba(255, 184, 0,0.1)] text-[#FFB800] hover:bg-[rgba(255, 184, 0,0.25)] text-[9px] font-mono transition-all cursor-pointer">
              <VideoOff className="w-2.5 h-2.5" />
              <span>TERMINATE</span>
            </button>
          )}
          <span>
            {visionFramesSent > 0
              ? `${visionFramesSent}F`
              : streamResolution.width
                ? `${streamResolution.width}x${streamResolution.height}`
                : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
export default ScreenShareModal;

