"use client";

import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAdaStore } from "@/lib/store";

/**
 * CyberStage — Pure White Studio Lighting & Clean Stage.
 * All lights calibrated to pure white (#FFFFFF) for true-color texture rendering:
 * - Key Light: [-1.5, 2.2, 2.0], #FFFFFF
 * - Fill Light: [1.8, 1.4, 1.8], #FFFFFF
 * - Top Rim Spotlight: [0, 2.8, -1.8], #FFFFFF
 * - Front Soft Light: [0, 1.2, 2.5], #FFFFFF
 * - Ambient Light: #FFFFFF
 */
export function CyberStage({ showFloor = true }) {
  const status = useAdaStore((state) => state.status);
  const ringRef1 = useRef(null);
  const ringRef2 = useRef(null);
  const keyLightRef = useRef(null);

  useFrame((state, delta) => {
    // Rotate holographic floor rings slowly in opposite directions when visible
    if (showFloor) {
      if (ringRef1.current) {
        ringRef1.current.rotation.z += delta * 0.15;
      }
      if (ringRef2.current) {
        ringRef2.current.rotation.z -= delta * 0.08;
      }
    }

    // Subtle white brightness modulation when Ada is speaking
    if (keyLightRef.current) {
      if (status === "SPEAKING") {
        const pulse = Math.sin(state.clock.elapsedTime * 7) * 0.3 + 2.3;
        keyLightRef.current.intensity = pulse;
      } else {
        keyLightRef.current.intensity = 2.2;
      }
    }
  });

  return (
    <group>
      {/* 1. Stark Gold Ambient Lighting */}
      <ambientLight color="#FFB800" intensity={1.1} />

      {/* 2. Key Light (Clean White Studio Directional) */}
      <directionalLight
        ref={keyLightRef}
        position={[-1.5, 2.2, 2.0]}
        color="#ffffff"
        intensity={2.2}
      />

      {/* 3. Fill Light (Gold Accent) */}
      <directionalLight position={[1.8, 1.4, 1.8]} color="#FFB800" intensity={1.8} />

      {/* 4. Top Rim Spotlight (Amber Silhouette) */}
      <spotLight
        position={[0, 2.8, -1.8]}
        color="#FFAA00"
        intensity={1.8}
        angle={0.7}
        penumbra={0.8}
      />

      {/* 5. Front Lower Fill Light (Stark Gold) */}
      <directionalLight position={[0, 1.0, 2.5]} color="#FFB800" intensity={0.8} />

      {/* 6. Cyberpunk Holographic Pedestal (if floor ever enabled) */}
      {showFloor && (
        <group position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          {/* Dark Carbon Pedestal Base */}
          <mesh position={[0, 0, 0]}>
            <circleGeometry args={[1.05, 48]} />
            <meshStandardMaterial color="#080602" roughness={0.8} />
          </mesh>

          {/* Outer Stark Gold Theme Ring */}
          <mesh ref={ringRef1} position={[0, 0, 0.002]}>
            <ringGeometry args={[0.9, 0.95, 48]} />
            <meshBasicMaterial color="#FFB800" transparent opacity={0.65} wireframe />
          </mesh>

          {/* Inner Stark Gold Theme Ring */}
          <mesh ref={ringRef2} position={[0, 0, 0.003]}>
            <ringGeometry args={[0.65, 0.7, 36]} />
            <meshBasicMaterial color="#FFB800" transparent opacity={0.7} wireframe />
          </mesh>
        </group>
      )}
    </group>
  );
}

