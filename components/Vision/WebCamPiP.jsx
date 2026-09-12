"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Camera,
  Video,
  VideoOff,
  X,
  Minimize2,
  Maximize2,
  RefreshCw,
  Zap,
  Play,
  Pause,
  Scan,
  GripHorizontal,
} from "lucide-react";
import { useAdaStore } from "@/lib/store";

/**
 * WebCamPiP
 * Real-time operator webcam optical surveillance & frame feed to Gemini 2.5 Live
 * Bounded inside the center 3D stage so it NEVER blocks the right-side chat UI.
 */
export function WebCamPiP({ isOpen, onClose, sendVideoFrame }) {
  const {
    isWebcamActive,
    setIsWebcamActive,
    visionInterval,
    incrementVisionFrames,
    setActiveVisionSource,
    addCommsMessage,
  } = useAdaStore();

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const streamIntervalRef = useRef(null);

  const [isMinimized, setIsMinimized] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [framesCount, setFramesCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  // Sci-Fi Shutter Open/Close Animation State
  const [isClosing, setIsClosing] = useState(false);
  const closeTimeoutRef = useRef(null);

  // Free Dragging State & Viewport Clamping
  const [position, setPosition] = useState(null); // { x: number, y: number }
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const panelRef = useRef(null);

  // Initialize position below Systems Panel on left side
  useEffect(() => {
    if (isOpen && position === null && typeof window !== "undefined") {
      const defaultX = 24;
      // Systems Panel is top-18 (72px) with h-[44vh] max-h-[440px]
      const sysBottom = 72 + Math.min(440, window.innerHeight * 0.44);
      const defaultY = Math.min(
        Math.max(sysBottom + 16, 480),
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

    const currentX = position?.x ?? 24;
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

      const panelWidth = panelRef.current?.offsetWidth || 320;
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

  // Stop active camera stream
  const stopCamera = useCallback(() => {
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

    setIsWebcamActive(false);
    setActiveVisionSource("none");
    setFramesCount(0);
  }, [setIsWebcamActive, setActiveVisionSource]);

  // Start operator camera feed
  const startCamera = useCallback(async () => {
    setErrorMsg("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setIsWebcamActive(true);
      setActiveVisionSource("webcam");
      addCommsMessage("system", "Operator optical feed engaged. Camera sensor online.");
    } catch (err) {
      console.error("[WebCamPiP] Error starting camera:", err);
      setErrorMsg(`Camera error: ${err.message}`);
      setIsWebcamActive(false);
    }
  }, [setIsWebcamActive, setActiveVisionSource, addCommsMessage]);

  // Automatically start camera when modal opens
  useEffect(() => {
    if (isOpen && !streamRef.current) {
      startCamera();
    } else if (!isOpen && streamRef.current) {
      stopCamera();
    }
  }, [isOpen, startCamera, stopCamera]);

  // Capture frame and send to Gemini Live
  const captureAndTransmitFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.videoWidth === 0) return false;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");

    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.75);

    if (sendVideoFrame) {
      const sent = sendVideoFrame(dataUrl, "image/jpeg");
      if (sent) {
        incrementVisionFrames();
        setFramesCount((prev) => prev + 1);
        return true;
      }
    }
    return false;
  }, [sendVideoFrame, incrementVisionFrames, isMirrored]);

  // Toggle continuous stream
  const toggleContinuousStream = () => {
    if (isStreaming) {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
      }
      setIsStreaming(false);
      addCommsMessage("system", "Operator webcam live stream paused.");
    } else {
      captureAndTransmitFrame();
      streamIntervalRef.current = setInterval(() => {
        captureAndTransmitFrame();
      }, visionInterval);
      setIsStreaming(true);
      addCommsMessage("system", `Webcam optical telemetry streaming to J.A.R.V.I.S`);
    }
  };

  // Transmit single snapshot
  const handleSnapshot = () => {
    const sent = captureAndTransmitFrame();
    if (sent) {
      addCommsMessage("system", "Operator optical snapshot transmitted to J.A.R.V.I.S");
    }
  };

  // Smooth Shutter Close and camera termination
  const triggerClose = useCallback(() => {
    if (isClosing) return;
    stopCamera();
    setIsClosing(true);
    closeTimeoutRef.current = setTimeout(() => {
      setIsClosing(false);
      onClose?.();
    }, 220); // Matches 0.22s scifi-modal-collapse-up keyframe
  }, [isClosing, stopCamera, onClose]);

  // Listen for external close toggle event (e.g. from bottom dock button)
  useEffect(() => {
    const handleExternalClose = () => {
      if (isOpen) {
        triggerClose();
      }
    };
    window.addEventListener("ada-close-webcam", handleExternalClose);
    return () => window.removeEventListener("ada-close-webcam", handleExternalClose);
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
    <aside
      ref={panelRef}
      aria-label="Operator Optical Feed"
      style={
        position
          ? {
            left: `${position.x}px`,
            top: `${position.y}px`,
            transition: isDragging ? "none" : "box-shadow 0.2s ease",
          }
          : undefined
      }
      className={`fixed z-35 ${!position ? "top-[52vh] left-6" : ""
        } ${isMinimized ? "w-64" : "w-72 sm:w-80"
        } chamfer-lg border border-[rgba(0,229,255,0.25)] bg-[rgba(8,12,18,0.55)] backdrop-blur-xl backdrop-saturate-150 shadow-[0_0_40px_rgba(0,229,255,0.12),inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden ${isDragging ? "shadow-[0_0_50px_rgba(0,229,255,0.25)] border-[rgba(0,229,255,0.5)]" : ""
        } ${isClosing ? "scifi-modal-collapse-up" : "scifi-modal-unfold-down"}`}>
      {/* Top Accent Gradient Line */}
      <div className="mx-4 mt-1 h-0.5 w-[calc(100%-32px)] bg-gradient-to-r from-[#00E5FF] via-[#70E8FF] to-[#00E5FF] animate-pulse shrink-0" />

      {/* Header Bar */}
      <div
        onPointerDown={handlePointerDown}
        className="flex items-center justify-between px-3 py-2 border-b border-[rgba(0,229,255,0.18)] bg-[rgba(0,229,255,0.04)] select-none cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2 pointer-events-none">
          <GripHorizontal className="w-3.5 h-3.5 text-[#00E5FF]/60" />
          <span
            className={`w-2 h-2 rounded-full ${isWebcamActive ? "bg-[#00E5FF] animate-pulse shadow-[0_0_6px_#00E5FF]" : "bg-[#7E859E]"}`}
          />
          <span className="text-[10px] font-mono font-semibold tracking-wider text-[#00E5FF] flex items-center gap-1.5">
            OPTIC PiP // LIVE FEED
          </span>
          {isStreaming && (
            <span className="px-1.5 py-0.2 chamfer-xs bg-[rgba(0,229,255,0.2)] border border-[#00E5FF] text-[#00E5FF] text-[9px] font-mono animate-pulse">
              LIVE
            </span>
          )}
        </div>

        <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => setIsMirrored((prev) => !prev)}
            className="p-1 chamfer-xs text-[#7E859E] hover:text-[#00E5FF] hover:bg-[rgba(0,229,255,0.1)] transition-colors cursor-pointer"
            title="Mirror Video">
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            onClick={() => setIsMinimized((prev) => !prev)}
            className="p-1 chamfer-xs text-[#7E859E] hover:text-[#F0F2F8] hover:bg-[rgba(255,255,255,0.05)] transition-colors cursor-pointer"
            title={isMinimized ? "Expand PiP" : "Minimize PiP"}>
            {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
          </button>
          <button
            onClick={triggerClose}
            className="p-1 chamfer-xs text-[#7E859E] hover:text-[#00E5FF] hover:bg-[rgba(0,229,255,0.1)] transition-colors cursor-pointer"
            title="Close Webcam Feed (Esc)">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Video Viewport - Remains mounted even when minimized to keep stream active */}
      <div
        className={`relative w-full aspect-video bg-[#050508] flex items-center justify-center overflow-hidden ${isMinimized ? "hidden" : "block"}`}>
        {/* Cyberpunk Optical Reticle Overlay */}
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-[#00F0FF]" />
          <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-[#00F0FF]" />
          <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-[#00F0FF]" />
          <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-[#00F0FF]" />

          {/* Center Targeting Bracket */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 border border-[rgba(0,240,255,0.25)] rounded-full flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-[rgba(0,240,255,0.6)]" />
          </div>

          <div className="absolute bottom-1 left-2 text-[8px] font-mono text-[#00F0FF]/80">
            OPTIC // SENSOR-01
          </div>
          {framesCount > 0 && (
            <div className="absolute bottom-1 right-2 text-[8px] font-mono text-[#FF8095]">
              {framesCount} FRAMES
            </div>
          )}
        </div>

        {/* HTML5 Video Element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover ${isMirrored ? "scale-x-[-1]" : ""}`}
        />

        {errorMsg && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-3 bg-black/90 text-center">
            <p className="text-[11px] font-mono text-[#00F0FF] mb-2">{errorMsg}</p>
            <button
              onClick={startCamera}
              className="px-2.5 py-0.5 chamfer-btn bg-[#00F0FF] text-black font-bold text-[10px] font-mono cursor-pointer">
              RETRY
            </button>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="flex items-center justify-between p-2 bg-[rgba(14,16,23,0.95)] border-t border-[rgba(255,255,255,0.06)]">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSnapshot}
            disabled={!isWebcamActive}
            className="flex items-center gap-1 px-2 py-1 chamfer-btn bg-[rgba(0,240,255,0.1)] border border-[#00F0FF] text-[#00F0FF] hover:bg-[rgba(0,240,255,0.2)] text-[10px] font-mono transition-all cursor-pointer disabled:opacity-40"
            title="Send optical snapshot to J.A.R.V.I.S">
            <Camera className="w-2.5 h-2.5" />
            <span>SNAPSHOT</span>
          </button>

          <button
            onClick={toggleContinuousStream}
            disabled={!isWebcamActive}
            className={`flex items-center gap-1 px-2 py-1 chamfer-btn text-[10px] font-mono border transition-all cursor-pointer disabled:opacity-40 ${isStreaming
                ? "border-[#00F0FF] bg-[rgba(0,240,255,0.2)] text-[#00F0FF]"
                : "border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.05)] text-[#F0F2F8] hover:border-[#00F0FF]"
              }`}
            title="Continuous frame stream to J.A.R.V.I.S">
            {isStreaming ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
            <span>{isStreaming ? "STOP" : "STREAM"}</span>
          </button>
        </div>

        <div className="text-[9px] font-mono text-[#7E859E]">
          {isWebcamActive
            ? framesCount > 0 && isMinimized
              ? `${framesCount}F`
              : "READY"
            : "OFFLINE"}
        </div>
      </div>
    </aside>
  );
}
export default WebCamPiP;

