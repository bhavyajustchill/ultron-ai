"use client";

import React, { Suspense, useState, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { CyberStage } from "./CyberStage";
import { ArcReactorOrb } from "./ArcReactorOrb";
import { useAdaStore } from "@/lib/store";
import {
  Loader2,
  ShieldAlert,
} from "lucide-react";

// Default camera distance: 5.265 (calibrated in-between current 4.68 and 1 zoom-out step 5.85: (4.68 + 5.85) / 2 = 5.265)
const DEFAULT_CAMERA_Z = 5.265;

/**
 * CameraSynchronizer — Synchronizes Three.js camera position, fov, and OrbitControls target
 * for the Arc Reactor Orb visual core.
 */
function CameraSynchronizer({ resetTrigger, controlsRef }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.fov = 45;
    camera.position.set(0, 0, DEFAULT_CAMERA_Z);
    camera.updateProjectionMatrix();
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [resetTrigger, camera, controlsRef]);

  return null;
}

/**
 * FrameRateMonitor — Zero-allocation live FPS sampler.
 * Samples frames inside R3F render loop and updates Zustand at a calm 1-second interval (1000ms).
 */
function FrameRateMonitor() {
  const frameCount = useRef(0);
  const lastTime = useRef(typeof performance !== "undefined" ? performance.now() : 0);
  const totalDelta = useRef(0);

  useFrame((_, delta) => {
    frameCount.current++;
    totalDelta.current += delta;

    const now = performance.now();
    const elapsed = now - lastTime.current;

    if (elapsed >= 1000) {
      const fps = Math.min(240, Math.round((frameCount.current / (elapsed / 1000)) * 10) / 10);
      const frameTimeMs = Math.round((totalDelta.current / frameCount.current) * 10000) / 10;

      useAdaStore.getState().setPerformanceMetrics({
        fps,
        frameTimeMs,
      });

      frameCount.current = 0;
      totalDelta.current = 0;
      lastTime.current = now;
    }
  });

  return null;
}

function HologramLoadingFallback() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#010e16]/80 backdrop-blur-sm z-10 text-center p-6">
      <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
        <div className="w-16 h-16 border-2 border-dashed border-[#00E5FF] rounded-full animate-spin [animation-duration:4s]" />
        <Loader2 className="w-8 h-8 text-[#00E5FF] animate-spin absolute" />
      </div>
      <h3 className="font-['Orbitron',sans-serif] text-sm font-bold tracking-widest text-[#F0F2F8] mb-1">
        INITIALIZING QUANTUM REACTOR
      </h3>
      <p className="font-mono text-xs text-[#7E859E]">
        Synchronizing Orbital Belts &amp; Particle Matrix...
      </p>
    </div>
  );
}

function JarvisViewportComponent({
  pcmPlayer,
  getInputByteFrequencyData,
  onToggleListening,
}) {
  const [mounted, setMounted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [resetTrigger, setResetTrigger] = useState(0);
  const controlsRef = useRef(null);

  const status = useAdaStore((state) => state.status);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleZoom = (direction) => {
    if (!controlsRef.current) return;
    const cam = controlsRef.current.object;
    const target = controlsRef.current.target;
    const factor = direction === "in" ? 0.8 : 1.25;
    cam.position.sub(target).multiplyScalar(factor).add(target);
    controlsRef.current.update();
  };

  const handleReset = () => {
    setResetTrigger((c) => c + 1);
  };

  useEffect(() => {
    const onCameraAction = (e) => {
      if (e.detail === "in") handleZoom("in");
      else if (e.detail === "out") handleZoom("out");
      else if (e.detail === "reset") handleReset();
    };
    window.addEventListener("ada-camera-action", onCameraAction);
    return () => window.removeEventListener("ada-camera-action", onCameraAction);
  }, []);

  if (!mounted) {
    return <HologramLoadingFallback />;
  }

  if (hasError) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-xs font-mono">
        <ShieldAlert className="w-10 h-10 text-[#00E5FF] mb-2" />
        <p className="text-[#00E5FF] font-bold">3D VIEWPORT HARDWARE ACCELERATION ERROR</p>
        <p className="text-[#7E859E] mt-1">
          Please ensure WebGL2 is enabled in your browser settings.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-[radial-gradient(circle_at_50%_50%,rgba(0,215,255,0.45)_0%,rgba(0,170,220,0.30)_25%,rgba(0,115,165,0.18)_50%,rgba(1,35,55,0.85)_75%,#010e16_100%)]">


      {/* 3D R3F CANVAS */}
      <Suspense fallback={<HologramLoadingFallback />}>
        <Canvas
          camera={{
            position: [0, 0, DEFAULT_CAMERA_Z],
            fov: 45,
            near: 0.1,
            far: 100,
          }}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: "default",
            preserveDrawingBuffer: true,
          }}
          dpr={[1, 2]}
          style={{ width: "100%", height: "100%", background: "transparent" }}
          className="w-full h-full"
          onCreated={({ gl, camera }) => {
            gl.toneMappingExposure = 1.15;
            camera.lookAt(0, 0, 0);

            // Intercept WebGL context loss
            const canvasEl = gl.domElement;
            if (canvasEl) {
              canvasEl.addEventListener(
                "webglcontextlost",
                (e) => {
                  e.preventDefault();
                  console.warn(
                    "[JarvisViewport] WebGL context loss intercepted. Preventing surface drop.",
                  );
                },
                false,
              );
              canvasEl.addEventListener(
                "webglcontextrestored",
                () => {
                  console.info("[JarvisViewport] WebGL context restored successfully.");
                  setHasError(false);
                },
                false,
              );
            }
          }}
          onError={(err) => {
            console.error("[JarvisViewport] WebGL Canvas Error:", err);
            setHasError(true);
          }}>
          {/* Synchronizes exact camera position and zoom across loads and resets */}
          <CameraSynchronizer
            resetTrigger={resetTrigger}
            controlsRef={controlsRef}
          />

          {/* Cyberpunk Lighting Setup */}
          <CyberStage showFloor={false} />

          {/* Singular 3D Core: Arc Reactor Orb */}
          <ArcReactorOrb
            getInputByteFrequencyData={getInputByteFrequencyData}
            pcmPlayer={pcmPlayer}
            onToggleListening={onToggleListening}
          />

          {/* Zero-Allocation 1-Second Live Frame Rate & Profiling Monitor */}
          <FrameRateMonitor />

          {/* Interactive Camera Controls (Particle-only rotation; smooth zoom & pan locked) */}
          <OrbitControls
            ref={controlsRef}
            target={[0, 0, 0]}
            enableZoom={true}
            minDistance={1.8}
            maxDistance={12.0}
            enablePan={false}
            enableRotate={false}
            maxPolarAngle={Math.PI}
            minPolarAngle={0}
            dampingFactor={0.06}
          />
        </Canvas>
      </Suspense>
    </div>
  );
}

export const JarvisViewport = React.memo(JarvisViewportComponent);
export const AdaViewport = JarvisViewport;
export default JarvisViewport;
