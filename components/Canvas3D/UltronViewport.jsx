"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createOrbScene } from "@/lib/ultronOrbScene";
import { HandTracker } from "@/lib/handTracker";
import { useAdaStore } from "@/lib/store";
import {
  Loader2,
  ShieldAlert,
  Hand,
  Video,
  VideoOff,
  Maximize2,
  Minimize2,
} from "lucide-react";

function HologramLoadingFallback() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#080602]/85 backdrop-blur-md z-10 text-center p-6">
      <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
        <div className="w-16 h-16 border-2 border-dashed border-[#FFB800] rounded-full animate-spin [animation-duration:4s]" />
        <Loader2 className="w-8 h-8 text-[#FFB800] animate-spin absolute" />
      </div>
      <h3 className="font-['Orbitron',sans-serif] text-sm font-bold tracking-widest text-[#F0F2F8] mb-1">
        INITIALIZING ULTRON HOLOGRAPHIC ORB
      </h3>
      <p className="font-mono text-xs text-[#9E957E]">
        Synthesizing 5 Wireframe Shells, 1,700 Text Sprites &amp; Debris Belts...
      </p>
    </div>
  );
}

function UltronViewportComponent({
  pcmPlayer,
  getInputByteFrequencyData,
  onToggleListening,
}) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const trackerRef = useRef(null);
  const videoRef = useRef(null);
  const overlayRef = useRef(null);

  const [mounted, setMounted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isGesturesActive, setIsGesturesActive] = useState(false);
  const [gestureStatus, setGestureStatus] = useState({ hands: 0, mode: "idle" });
  const [gestureError, setGestureError] = useState(null);

  const status = useAdaStore((state) => state.status);

  // Audio energy computation callback
  const getAudioEnergy = useCallback(() => {
    let energy = 0;
    // 1. Ultron speaking output energy
    if (pcmPlayer && typeof pcmPlayer.getEnergy === "function") {
      energy = Math.max(energy, pcmPlayer.getEnergy() || 0);
    }
    // 2. Operator speech frequency energy
    if (getInputByteFrequencyData && typeof getInputByteFrequencyData === "function") {
      const data = getInputByteFrequencyData();
      if (data && data.length > 0) {
        let sum = 0;
        const count = Math.min(32, data.length);
        for (let i = 0; i < count; i++) {
          sum += data[i];
        }
        const micAvg = sum / (count * 255);
        energy = Math.max(energy, micAvg * 1.5);
      }
    }
    return energy;
  }, [pcmPlayer, getInputByteFrequencyData]);

  // Mount Ultron Three.js scene
  useEffect(() => {
    setMounted(true);
    const container = containerRef.current;
    if (!container) return;

    try {
      const scene = createOrbScene(container, {
        getAudioEnergy,
        getStatus: () => useAdaStore.getState().status,
      });
      sceneRef.current = scene;

      // Frame rate profiler ticker
      let frameCount = 0;
      let lastFpsTime = performance.now();
      let lastFrameTime = performance.now();
      let totalDelta = 0;
      let rafId = 0;

      const profileLoop = () => {
        frameCount++;
        const now = performance.now();
        const delta = (now - lastFrameTime) / 1000;
        lastFrameTime = now;
        totalDelta += delta;

        if (now - lastFpsTime >= 1000) {
          const fps = Math.min(240, Math.round((frameCount / ((now - lastFpsTime) / 1000)) * 10) / 10);
          const frameTimeMs = Math.round((totalDelta / frameCount) * 10000) / 10;
          useAdaStore.getState().setPerformanceMetrics({ fps, frameTimeMs });
          frameCount = 0;
          totalDelta = 0;
          lastFpsTime = now;
        }
        rafId = requestAnimationFrame(profileLoop);
      };
      rafId = requestAnimationFrame(profileLoop);

      return () => {
        cancelAnimationFrame(rafId);
        trackerRef.current?.stop();
        trackerRef.current = null;
        scene.dispose();
        sceneRef.current = null;
      };
    } catch (err) {
      console.error("[UltronViewport] Ultron Orb initialization error:", err);
      setHasError(true);
    }
  }, [getAudioEnergy]);

  // Synchronize dynamic status changes to 3D scene
  useEffect(() => {
    if (sceneRef.current) {
      sceneRef.current.setStatus(status);
    }
  }, [status]);

  // Handle external camera events (Zoom In, Zoom Out, Reset View)
  useEffect(() => {
    const onCameraAction = (e) => {
      if (!sceneRef.current) return;
      if (e.detail === "in") sceneRef.current.zoomIn();
      else if (e.detail === "out") sceneRef.current.zoomOut();
      else if (e.detail === "reset") sceneRef.current.resetView();
    };
    window.addEventListener("ada-camera-action", onCameraAction);
    return () => window.removeEventListener("ada-camera-action", onCameraAction);
  }, []);

  // Hand gesture controls
  const stopGestures = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    setIsGesturesActive(false);
    setGestureStatus({ hands: 0, mode: "idle" });
  }, []);

  const startGestures = useCallback(async () => {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (!video || !overlay || trackerRef.current) return;

    setGestureError(null);
    const tracker = new HandTracker(video, overlay, {
      onRotate: (dt, dp) => sceneRef.current?.rotateBy(dt, dp),
      onZoom: (factor) => sceneRef.current?.zoomBy(factor),
      onStatus: setGestureStatus,
    });
    trackerRef.current = tracker;

    try {
      await tracker.start();
      setIsGesturesActive(true);
    } catch (err) {
      trackerRef.current = null;
      tracker.stop();
      setIsGesturesActive(false);
      setGestureError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "CAMERA PERMISSION DENIED"
          : "HAND TRACKING INITIALIZATION FAILED"
      );
    }
  }, []);

  const toggleGestures = useCallback(() => {
    if (trackerRef.current) stopGestures();
    else void startGestures();
  }, [startGestures, stopGestures]);

  // Keyboard controls (+ / -, R, G)
  useEffect(() => {
    const onKey = (e) => {
      // Don't intercept if user is typing in an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      switch (e.key) {
        case "+":
        case "=":
          sceneRef.current?.zoomIn();
          break;
        case "-":
        case "_":
          sceneRef.current?.zoomOut();
          break;
        case "r":
        case "R":
          sceneRef.current?.resetView();
          break;
        case "g":
        case "G":
          toggleGestures();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleGestures]);

  // Listen for global gesture toggle request
  useEffect(() => {
    const onToggleGesturesEvent = () => toggleGestures();
    window.addEventListener("ada-toggle-gestures", onToggleGesturesEvent);
    return () => window.removeEventListener("ada-toggle-gestures", onToggleGesturesEvent);
  }, [toggleGestures]);

  if (!mounted) {
    return <HologramLoadingFallback />;
  }

  if (hasError) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-xs font-mono bg-[#080602]">
        <ShieldAlert className="w-10 h-10 text-[#FFB800] mb-2" />
        <p className="text-[#FFB800] font-bold">3D VIEWPORT HARDWARE ACCELERATION ERROR</p>
        <p className="text-[#9E957E] mt-1">
          Please ensure WebGL2 is enabled in your browser settings.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-[radial-gradient(circle_at_50%_50%,rgba(255,184,0,0.28)_0%,rgba(221,119,0,0.18)_25%,rgba(180,83,9,0.10)_50%,rgba(15,12,5,0.85)_75%,#080602_100%)]">
      {/* 3D WebGL Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Hand Gestures Mirror PiP overlay (when enabled) */}
      <div
        className={`absolute bottom-28 right-8 z-30 transition-all duration-300 pointer-events-auto ${
          isGesturesActive ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 pointer-events-none translate-y-4"
        }`}
      >
        <div className="relative w-48 h-36 chamfer-md bg-[rgba(15,12,6,0.92)] border border-[rgba(255,184,0,0.4)] shadow-[0_0_20px_rgba(255,184,0,0.25)] overflow-hidden backdrop-blur-md">
          {/* Top Status Banner */}
          <div className="absolute top-0 inset-x-0 h-6 px-2.5 flex items-center justify-between bg-[rgba(255,184,0,0.12)] border-b border-[rgba(255,184,0,0.25)] text-[9px] font-mono font-bold text-[#FFB800]">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FFB800] animate-pulse" />
              GESTURE TRACKER
            </span>
            <span className="text-[#FFE082]">
              {gestureStatus.hands > 0
                ? `${gestureStatus.hands} HAND${gestureStatus.hands > 1 ? "S" : ""} · ${gestureStatus.mode.toUpperCase()}`
                : "SHOW HANDS"}
            </span>
          </div>

          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-full object-cover pt-6 scale-x-[-1]"
          />
          <canvas
            ref={overlayRef}
            width={192}
            height={144}
            className="absolute inset-0 pt-6 w-full h-full pointer-events-none"
          />
        </div>
      </div>

      {gestureError && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 chamfer-sm bg-[#FF003C]/20 border border-[#FF003C] text-[#FF003C] text-xs font-mono font-bold shadow-[0_0_12px_rgba(255,0,60,0.3)] animate-in fade-in">
          {gestureError}
        </div>
      )}
    </div>
  );
}

export const UltronViewport = React.memo(UltronViewportComponent);
export const JarvisViewport = UltronViewport;
export const AdaViewport = UltronViewport;
export default UltronViewport;
