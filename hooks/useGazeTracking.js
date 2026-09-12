"use client";

import { useRef, useCallback, useEffect } from "react";
import * as THREE from "three";

// Pre-allocated scratch transforms outside the frame loop (Zero GC enforcement)
const _deltaEulerHead = new THREE.Euler(0, 0, 0, "YXZ");
const _deltaQuatHead = new THREE.Quaternion();
const _targetQuatHead = new THREE.Quaternion();

const _deltaEulerNeck = new THREE.Euler(0, 0, 0, "YXZ");
const _deltaQuatNeck = new THREE.Quaternion();
const _targetQuatNeck = new THREE.Quaternion();

// Canonical GLB resting bind-pose quaternions for bone23_022 (Head) and bone22_01 (Neck)
// Extracted directly from public/models/adawong_posed.glb
export const BIND_QUAT_HEAD = new THREE.Quaternion(
  0.0016253397334367037,
  1.8160815073997583e-8,
  1.3969854162354522e-9,
  0.9999986886978149
);

export const BIND_QUAT_NECK = new THREE.Quaternion(
  -0.04135536774992943,
  0.01694701798260212,
  0.13286936283111572,
  0.9901253581047058
);

/**
 * useGazeTracking — Smooth skeletal gaze tracking targeting bone23_022 (Head)
 * and bone22_01 (Neck) with normalized cursor coordinates.
 * Multiplies against initial bind-pose quaternions to prevent rig distortion.
 * Enforces Zero Garbage Collection inside useFrame.
 */
export function useGazeTracking(domElement) {
  const pointerTarget = useRef({ x: 0, y: 0 });
  const isFirstFrameRef = useRef(true);
  const timeRef = useRef(0);

  // Viewport-constrained pointer listener: tracks cursor ONLY within the 3D viewport canvas
  useEffect(() => {
    const el =
      domElement || (typeof document !== "undefined" ? document.querySelector("canvas") : null);
    if (!el) return;

    const onPointerMove = (e) => {
      // Inhibit gaze tracking when hovering over HUD controls, buttons, or elements marked with data-no-gaze
      const isOverHUD = Boolean(
        e.target &&
          (e.target.closest?.("[data-no-gaze]") ||
            e.target.closest?.("button") ||
            e.target.tagName === "BUTTON")
      );

      const rect = el.getBoundingClientRect();
      const isInside =
        !isOverHUD &&
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (isInside && rect.width > 0 && rect.height > 0) {
        pointerTarget.current.x = Math.max(
          -1,
          Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1),
        );
        pointerTarget.current.y = Math.max(
          -1,
          Math.min(1, -((e.clientY - rect.top) / rect.height) * 2 + 1),
        );
      } else {
        // Outside 3D viewport or hovering over HUD controls -> smoothly return gaze straight forward
        pointerTarget.current.x = 0;
        pointerTarget.current.y = 0;
      }
    };

    const onWindowLeave = () => {
      pointerTarget.current.x = 0;
      pointerTarget.current.y = 0;
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onWindowLeave, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onWindowLeave);
    };
  }, [domElement]);

  const updateGaze = useCallback((headBone, neckBone, pointer, delta = 0.016) => {
    if (!headBone && !neckBone) return;

    timeRef.current += delta;
    const time = timeRef.current;

    // Viewport-constrained pointer (defaults to 0,0 when outside viewport)
    const px = Math.max(-1, Math.min(1, pointerTarget.current.x || 0));
    const py = Math.max(-1, Math.min(1, pointerTarget.current.y || 0));

    // Exact skeletal posture counter-calibration:
    // In adawong_posed.glb, the parent bone hierarchy (pelvis + spine + neck) gives the head an initial
    // resting rotation of +6.70° to the right (yaw) and -10.70° upward/higher (pitch).
    // Counter-calibrated on the head bone so Ada's resting gaze is dead-center into the camera:
    const baseHeadPitch = 0.25; // Lowers chin to level eye contact with camera
    const baseNeckPitch = 0; // Neutral neck pitch

    const baseHeadYaw = -0.15; // Centers gaze horizontally from right to straight forward
    const baseNeckYaw = 0; // Neutral neck yaw

    const baseHeadRoll = 0; // Level horizontal eye line

    // Subtle living presence micro-drift (smooth, non-jerky, zero erratic bobbling)
    const idleYaw = Math.sin(time * 0.25) * 0.015;
    const idlePitch = Math.cos(time * 0.35) * 0.008;
    const idleRoll = Math.sin(time * 0.3) * 0.006;

    // Interactive cursor tracking: centered around forward baseline, active strictly when cursor is inside viewport
    const headYaw = baseHeadYaw + px * 0.38 + idleYaw;
    const neckYaw = baseNeckYaw + px * 0.16 + idleYaw * 0.5;

    const headPitch = baseHeadPitch - py * 0.18 + idlePitch;
    const neckPitch = baseNeckPitch - py * 0.08 + idlePitch * 0.5;

    const headRoll = baseHeadRoll - px * 0.04 + idleRoll;

    // Calculate time-independent slerp factor (smooth, lifelike damping)
    const factor = Math.min(1.0, Math.max(0.01, 1 - Math.exp(-8.0 * delta)));

    // 1. Update Head Bone (bone23_022) relative to canonical bind orientation
    if (headBone) {
      _deltaEulerHead.set(headPitch, headYaw, headRoll, "YXZ");
      _deltaQuatHead.setFromEuler(_deltaEulerHead);
      _targetQuatHead.copy(BIND_QUAT_HEAD).multiply(_deltaQuatHead);
      if (isFirstFrameRef.current) {
        headBone.quaternion.copy(_targetQuatHead);
      } else {
        headBone.quaternion.slerp(_targetQuatHead, factor);
      }
    }

    // 2. Update Neck Bone (bone22_01) relative to canonical bind orientation
    if (neckBone) {
      _deltaEulerNeck.set(neckPitch, neckYaw, 0, "YXZ");
      _deltaQuatNeck.setFromEuler(_deltaEulerNeck);
      _targetQuatNeck.copy(BIND_QUAT_NECK).multiply(_deltaQuatNeck);
      if (isFirstFrameRef.current) {
        neckBone.quaternion.copy(_targetQuatNeck);
      } else {
        neckBone.quaternion.slerp(_targetQuatNeck, factor * 0.85);
      }
    }

    if (isFirstFrameRef.current) {
      isFirstFrameRef.current = false;
    }
  }, []);

  return { updateGaze };
}

