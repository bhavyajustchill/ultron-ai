"use client";

import React, { useRef, useMemo, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useJarvisStore } from "@/lib/store";
import { useAccentTint } from "@/hooks/useAccentTheme";

// Core plasma sphere: brightest where the surface faces the camera and fading to nothing at the limb (no hard
// outline), with faint slowly rotating surface noise so it reads as a 3D ball. uHeat (thinking / speaking) widens
// the white-hot centre from a tiny point and brightens the body into a saturated corona; uLevel (speech loudness)
// brightens the corona further while the core's growth carries the size.
const CORE_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vObjPos;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    vObjPos = position;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const CORE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform float uHeat;
  uniform float uLevel;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vObjPos;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  void main() {
    float facing = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);

    // Surface detail turns slowly around the vertical axis
    float a = uTime * 0.25;
    vec3 p = vec3(cos(a) * vObjPos.x - sin(a) * vObjPos.z, vObjPos.y, sin(a) * vObjPos.x + cos(a) * vObjPos.z);
    float n = noise(p * 14.0 + vec3(0.0, uTime * 0.15, 0.0));

    float body = pow(facing, mix(2.5, 2.0, uHeat)) * (0.85 + 0.3 * n) * (0.6 + 1.3 * uHeat + 1.2 * uLevel);
    // White from facing > hi, fading to the body colour by facing < lo
    float lo = mix(0.956, 0.45, uHeat);
    float hi = mix(1.0, 0.9, uHeat);
    float hot = smoothstep(lo, hi, facing);
    vec3 col = mix(uColor * body, vec3(1.0), hot);
    // Alpha follows brightness like the sprite textures, so the dim limb does not hide the CSS
    // background behind the transparent canvas
    float alpha = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
    gl_FragColor = vec4(col / max(alpha, 0.0001), alpha);
    #include <colorspace_fragment>
  }
`;

// Speech energy (mean of the 32 lowest analyser bins, 0-1) treated as full loudness for the max-level core
const SPEECH_LEVEL_FULL = 0.6;
// Bloom haze opacity: idle base, plus extra while thinking / speaking
const BLOOM_IDLE_OPACITY = 1.3;
const BLOOM_HEAT_OPACITY = 0.32;
// Core sphere scale when idle and while thinking / speaking (before speech growth), and extra bloom size
// while active; the small idle sphere keeps the white point inside a soft glow rather than a visible ball
const CORE_IDLE_SCALE = 0.66;
const CORE_ACTIVE_SCALE = 1.3;
const BLOOM_HEAT_GROWTH = 0.4;

/**
 * ArcReactorOrb — Holographic Radar Reactor Orb with Particle-Only Rotation.
 * Features:
 * - Particle-only 3D rotation: only the 3D particle sphere rotates when dragged or procedurally.
 *   The core, radial stator dial, and sweeping light remain locked facing forward without tilting.
 * - Electric aqua-cyan (#00E5FF) J.A.R.V.I.S palette. The core is a shaded 3D plasma sphere: theme colour with
 *   a tiny white-hot point when idle, a white centre and saturated corona while thinking, growing with speech level.
 * - Synchronized speed scaling: very slow in IDLE (0.045 rad/s particles, 0.18 rad/s sweep light),
 *   accelerating in sync during listening, speaking, and thinking.
 * - Very dim, subtle, ethereal rotating radar light wedge (opacity 0.045).
 * - True 3D Fibonacci spherical particle globe with strict out-of-bounds mathematical clamping.
 * - Compact center core that grows strictly when speaking.
 * - Zero heap allocations inside useFrame().
 */
export function ArcReactorOrb({ getInputByteFrequencyData, pcmPlayer, onToggleListening }) {
  const pointsRef = useRef(null);
  const coreMeshRef = useRef(null);
  const flareSpriteRef = useRef(null);
  const flareMatRef = useRef(null);
  const coreMatRef = useRef(null);
  const centerLightRef = useRef(null);
  const accentLightRef = useRef(null);
  const cyanLightRef = useRef(null);
  const radarSweepRef = useRef(null);
  const statorGroupRef = useRef(null);
  const statorTicksRef = useRef(null);
  const innerOrbiterRef = useRef(null);
  const outerOrbiterRef = useRef(null);
  const middleOrbiterRef = useRef(null);
  const outerSpectrumRef = useRef(null);
  const outerSpectrumMatRef = useRef(null);
  const outerSpectrumHeightsRef = useRef(new Float32Array(50));
  const outerSpectrumOpacityRef = useRef(0);

  // Orbital phase accumulators for 3 particle layers + sprinkles (Zero jump when speed changes)
  const layerPhaseL1Ref = useRef(0);
  const layerPhaseL2Ref = useRef(0);
  const layerPhaseL3Ref = useRef(0);
  const layerPhaseSprinkleL2Ref = useRef(0);
  const layerPhaseSprinkleL3Ref = useRef(0);

  const shockwaveRef = useRef(0);
  const speechEnergyRef = useRef(0);
  // 0 = idle (theme-coloured plasma core), 1 = thinking / speaking (white-hot centre)
  const coreHeatRef = useRef(0);
  const [isHovered, setIsHovered] = useState(false);

  const status = useJarvisStore((state) => state.status);
  const isMuted = useJarvisStore((state) => state.isMuted);
  // Accent theme (Phase 8.7): colours below are designed in cyan and tinted into the chosen accent;
  // anything built from them is rebuilt only when the theme changes, never per frame
  const tint = useAccentTint();
  // Core plasma sphere initial uniforms. R3F copies each uniform into the material, so later writes go
  // through coreMatRef rather than this object.
  const coreUniforms = useMemo(
    () => ({ uColor: { value: new THREE.Color() }, uHeat: { value: 0 }, uLevel: { value: 0 }, uTime: { value: 0 } }),
    []
  );
  useEffect(() => {
    coreMatRef.current?.uniforms.uColor.value.set(tint("#00E5FF"));
  }, [tint]);

  // 1. Procedural Radial Optical Bloom Texture (Seamless Cubic Falloff, Zero Ring Banding)
  const coreBloomTexture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(512, 512);
    const data = imgData.data;

    const center = 255.5;
    const maxR = 255.5;

    for (let y = 0; y < 512; y++) {
      const dy = y - center;
      const rowOffset = y * 512 * 4;
      for (let x = 0; x < 512; x++) {
        const dx = x - center;
        const d = Math.sqrt(dx * dx + dy * dy);
        const normR = d / maxR;

        const idx = rowOffset + x * 4;

        if (normR >= 1.0) {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
          continue;
        }

        // Hermite smooth window: (1 - normR^2)^2 ensures value and derivative reach exactly 0 at normR = 1.0
        const window = (1 - normR * normR) * (1 - normR * normR);

        // Continuous multi-stop optical falloff (the white-hot centre comes from the plasma sphere, so the
        // haze has no solid disc of its own):
        // 1. Radiant Electric Aqua-Cyan centre and transition (#00E5FF / #00F0FF)
        // 2. Deep ocean cyan-blue ambient haze
        let r, g, b, alpha;

        if (normR < 0.52) {
          // Radiant Electric Aqua-Cyan (#00E5FF / #00F0FF)
          const t = Math.max(0, normR - 0.2) / 0.32;
          const s = t * t * (3 - 2 * t);
          r = Math.round(30 * (1 - s));
          g = Math.round(235 - s * 25);
          b = 255;
          alpha = Math.exp(-1.15 * normR) * window;
        } else {
          // Deep ocean cyan-blue ambient haze, continuing from the aqua band's edge colour and alpha
          // so the two bands meet without a visible ring
          const t = (normR - 0.52) / 0.48;
          const s = t * t * (3 - 2 * t);
          r = 0;
          g = Math.round(210 - s * 165);
          b = Math.round(255 - s * 115);
          alpha = Math.exp(-1.15 * 0.52 - 1.45 * (normR - 0.52)) * window;
        }

        const [tr, tg, tb] = tint.rgb(r, g, b);
        data[idx] = tr;
        data[idx + 1] = tg;
        data[idx + 2] = tb;
        data[idx + 3] = Math.round(Math.min(255, Math.max(0, alpha * 255)));
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [tint]);

  // 1b. Procedural Polar-Feathered Radar Sweep Beam Texture (Soft Gaussian Leading, Exponential Tail, Hermite Radial)
  const radarSweepTexture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    const imgData = ctx.createImageData(512, 512);
    const data = imgData.data;

    const center = 255.5;
    const maxR = 255.5;

    // Arc span ~43 degrees (0.75 rad), soft leading shoulder ~4.5 degrees (0.08 rad)
    const arcSpan = 0.75;
    const leadFeather = 0.08;

    // Radial bounds normalized to [0, 1] for the 2.8 x 2.8 plane (max radius 1.4)
    // World space: a long inner fade from 0.21 (just outside the core glow) to 0.84 (the dial ring), so the
    // beam never brightens toward the core; outer fade from 0.98 to 1.4
    const rInnerMin = 0.15;
    const rInnerMax = 0.6;
    const rOuterMin = 0.7;
    const rOuterMax = 1;

    for (let y = 0; y < 512; y++) {
      const dy = y - center;
      const rowOffset = y * 512 * 4;
      for (let x = 0; x < 512; x++) {
        const dx = x - center;
        const d = Math.sqrt(dx * dx + dy * dy);
        const normR = d / maxR;

        const idx = rowOffset + x * 4;

        if (normR < rInnerMin || normR > rOuterMax) {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
          continue;
        }

        // Inner & outer radial Hermite feathering (zero sharp circle edges)
        let radialFade = 1.0;
        if (normR < rInnerMax) {
          const t = (normR - rInnerMin) / (rInnerMax - rInnerMin);
          radialFade = t * t * (3 - 2 * t);
        } else if (normR > rOuterMin) {
          const t = (normR - rOuterMin) / (rOuterMax - rOuterMin);
          radialFade = 1.0 - t * t * (3 - 2 * t);
        }

        // Angular polar coordinate relative to +X axis
        const angle = Math.atan2(dy, dx);

        // Beam spans [-arcSpan, leadFeather]
        let angFade = 0;
        if (angle >= 0 && angle <= leadFeather) {
          // Leading edge: soft Gaussian shoulder
          const t = angle / leadFeather;
          angFade = 1.0 - t * t * (3 - 2 * t);
        } else if (angle < 0 && angle >= -arcSpan) {
          // Trailing tail: smooth exponential decay
          const t = -angle / arcSpan;
          const hermite = (1 - t * t) * (1 - t * t);
          angFade = hermite * Math.pow(1 - t, 1.4);
        }

        if (angFade <= 0.001 || radialFade <= 0.001) {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
          data[idx + 3] = 0;
          continue;
        }

        const combinedAlpha = radialFade * angFade;

        // Luminous Electric Aqua-Cyan beam, one colour along its length (no whitening toward the core)
        const [tr, tg, tb] = tint.rgb(0, 225, 255);
        data[idx] = tr;
        data[idx + 1] = tg;
        data[idx + 2] = tb;
        data[idx + 3] = Math.round(Math.min(255, combinedAlpha * 255));
      }
    }

    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, [tint]);

  // 1c. Procedural Smooth Circular Anti-Aliased Particle Texture (Eliminates Square Quads)
  const circleParticleTexture = useMemo(() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");

    const center = 32;
    const radius = 30;

    const grad = ctx.createRadialGradient(center, center, 0, center, center, radius);
    grad.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
    grad.addColorStop(0.72, "rgba(255, 255, 255, 1.0)");
    grad.addColorStop(0.92, "rgba(255, 255, 255, 0.6)");
    grad.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // 2. Stator Fin Radial Ticks Geometry & Spectrum Anchor (50 Uniform-Length Alternating Segments)
  const tickCount = 50;
  const tickBaseData = useMemo(() => {
    // Bounding rings: inner at 0.60, outer at 0.86
    // rIn = 0.63 → 0.03 gap from inner border (0.60)
    // rOut = 0.86 → restored to original position
    // Segment length = 0.23 units
    const rIn = 0.63;
    const rOut = 0.86;
    const cosA = new Float32Array(tickCount);
    const sinA = new Float32Array(tickCount);
    const baseOuterR = new Float32Array(tickCount);

    for (let i = 0; i < tickCount; i++) {
      const angle = (i / tickCount) * Math.PI * 2;
      cosA[i] = Math.cos(angle);
      sinA[i] = Math.sin(angle);
      baseOuterR[i] = rOut;
    }
    return { rIn, cosA, sinA, baseOuterR };
  }, []);

  const statorTicksGeometry = useMemo(() => {
    const { rIn, cosA, sinA, baseOuterR } = tickBaseData;
    const positions = new Float32Array(tickCount * 2 * 3);
    // RGBA: itemSize = 4 for native Three.js USE_COLOR_ALPHA support
    const colors = new Float32Array(tickCount * 2 * 4);

    const electricAqua = new THREE.Color(tint("#00E5FF"));

    for (let i = 0; i < tickCount; i++) {
      const p1X = cosA[i] * rIn;
      const p1Y = sinA[i] * rIn;
      const p2X = cosA[i] * baseOuterR[i];
      const p2Y = sinA[i] * baseOuterR[i];

      const idx = i * 6;
      positions[idx] = p1X;
      positions[idx + 1] = p1Y;
      positions[idx + 2] = 0;

      positions[idx + 3] = p2X;
      positions[idx + 4] = p2Y;
      positions[idx + 5] = 0;

      // Eye-catching randomized opacity distribution for radial dial line segments:
      // Some lines are more visible and catch the eye (0.92 - 1.00),
      // some are medium HUD cadence (0.72 - 0.86), and some subtle depth (0.52 - 0.65).
      // Floor is kept strictly at >= 0.52 so lines never go as low as particles (0.25).
      const opRand = Math.random();
      let alpha;
      if (opRand < 0.4) {
        // High visibility / catches the eye
        alpha = 0.92 + Math.random() * 0.08;
      } else if (opRand < 0.75) {
        // Medium visibility cadence
        alpha = 0.72 + Math.random() * 0.14;
      } else {
        // Subtle depth (visible, non-faint floor)
        alpha = 0.52 + Math.random() * 0.13;
      }

      const colIdx = i * 8; // 2 vertices * 4 components
      // Vertex 1
      colors[colIdx] = electricAqua.r;
      colors[colIdx + 1] = electricAqua.g;
      colors[colIdx + 2] = electricAqua.b;
      colors[colIdx + 3] = alpha;

      // Vertex 2
      colors[colIdx + 4] = electricAqua.r;
      colors[colIdx + 5] = electricAqua.g;
      colors[colIdx + 6] = electricAqua.b;
      colors[colIdx + 7] = alpha;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 4));
    return geom;
  }, [tickBaseData, tint]);

  // 3. Stator Bounding Rings
  const { innerStatorGeom, outerStatorGeom } = useMemo(() => {
    const createCircleGeom = (radius, segments = 96) => {
      const pts = [];
      for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0));
      }
      return new THREE.BufferGeometry().setFromPoints(pts);
    };

    return {
      innerStatorGeom: createCircleGeom(0.6),
      outerStatorGeom: createCircleGeom(0.9),
    };
  }, []);

  // 3b. Border Orbiting Comet Particles with Constant Line Tails
  const { innerCometTailGeom, outerCometTailGeom, middleCometTailGeom } = useMemo(() => {
    const createCometTailGeom = (
      radius,
      arcAngleRad,
      segments,
      colorHex,
      isCounterClockwise = false,
      zOffset = 0.006,
    ) => {
      const positions = new Float32Array(segments * 3);
      const colors = new Float32Array(segments * 4); // RGBA (itemSize = 4)
      const baseColor = new THREE.Color(colorHex);
      const headColor = new THREE.Color("#FFFFFF");

      for (let i = 0; i < segments; i++) {
        const t = i / (segments - 1); // 0 at head, 1 at tail tip
        const angle = isCounterClockwise ? -t * arcAngleRad : t * arcAngleRad;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        const idx = i * 3;
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = zOffset;

        // Leading head has bright white-cyan specular highlight
        const headGlow = Math.max(0, 1.0 - t * 3.0);
        const r = THREE.MathUtils.lerp(baseColor.r, headColor.r, headGlow * 0.9);
        const g = THREE.MathUtils.lerp(baseColor.g, headColor.g, headGlow * 0.9);
        const b = THREE.MathUtils.lerp(baseColor.b, headColor.b, headGlow * 0.9);

        // Constant luminance curve: sustained high contrast across entire arc (NEVER drops to zero)
        const alpha = Math.max(0.22, Math.pow(1.0 - t * 0.78, 1.15));

        const colIdx = i * 4;
        colors[colIdx] = r;
        colors[colIdx + 1] = g;
        colors[colIdx + 2] = b;
        colors[colIdx + 3] = alpha;
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geom.setAttribute("color", new THREE.BufferAttribute(colors, 4));
      return geom;
    };

    return {
      // Lower border ring: Glowing Electric Aqua-Cyan comet tail (1/3rd length, clockwise)
      innerCometTailGeom: createCometTailGeom(0.6, 0.26, 32, tint("#00E5FF"), false, 0.006),
      // Upper border ring: Glowing Electric Aqua-Cyan comet tail (1/3rd length, clockwise)
      outerCometTailGeom: createCometTailGeom(0.9, 0.24, 32, tint("#00E5FF"), false, 0.006),
      // Middle particle orbiter (r=1.18): Glowing Electric Cyan comet line tail matching borders (1/3rd length, counter-clockwise)
      middleCometTailGeom: createCometTailGeom(1.18, 0.24, 32, tint("#00E5FF"), true, 0.015),
    };
  }, [tint]);

  // =========================================================================
  // SPEECH SPIKE CALIBRATION VARIABLES (Tweak these parameters to adjust appearance)
  // =========================================================================
  // Start height multiplier at the top (12 o'clock) — default 0.80 (80%)
  const SPEECH_SPIKE_START_HEIGHT = 0.35;
  // End height multiplier near the other side (11:30 o'clock) — default 0.50 (50%)
  const SPEECH_SPIKE_END_HEIGHT = 0.3;
  // Base maximum physical spike length (boosted so spikes aren't way too small)
  const SPEECH_SPIKE_BASE_LENGTH = 0.75;

  // 3c. Dedicated Outer Speech Spectrum Layer Geometry (50 Segments outside r=0.86 border)
  // Configured clockwise from 12 o'clock (top) down to other side (11:30 o'clock)
  const outerSpectrumBaseData = useMemo(() => {
    const rIn = 0.92; // 0.06 padding outside the 0.86 outer border ring
    const dirX = new Float32Array(tickCount);
    const dirY = new Float32Array(tickCount);
    const envelope = new Float32Array(tickCount);

    for (let i = 0; i < tickCount; i++) {
      // theta = 0 at top (12 o'clock), progressing clockwise: (sin(theta), cos(theta))
      const angle = (i / tickCount) * Math.PI * 2;
      dirX[i] = Math.sin(angle);
      dirY[i] = Math.cos(angle);

      // Interpolate from SPEECH_SPIKE_START_HEIGHT (80%) down to SPEECH_SPIKE_END_HEIGHT (50%)
      const t = i / (tickCount - 1);
      envelope[i] = THREE.MathUtils.lerp(SPEECH_SPIKE_START_HEIGHT, SPEECH_SPIKE_END_HEIGHT, t);
    }
    return { rIn, dirX, dirY, envelope };
  }, [SPEECH_SPIKE_START_HEIGHT, SPEECH_SPIKE_END_HEIGHT]);

  const outerSpectrumGeometry = useMemo(() => {
    const { rIn, dirX, dirY } = outerSpectrumBaseData;
    const positions = new Float32Array(tickCount * 2 * 3);
    // RGBA: itemSize = 4 for native Three.js USE_COLOR_ALPHA support
    const colors = new Float32Array(tickCount * 2 * 4);

    const electricAqua = new THREE.Color(tint("#00E5FF"));

    for (let i = 0; i < tickCount; i++) {
      // At rest, outer vertex rests at rIn (length 0 until speech begins)
      const p1X = dirX[i] * rIn;
      const p1Y = dirY[i] * rIn;
      const p2X = dirX[i] * rIn;
      const p2Y = dirY[i] * rIn;

      const idx = i * 6;
      positions[idx] = p1X;
      positions[idx + 1] = p1Y;
      positions[idx + 2] = 0;

      positions[idx + 3] = p2X;
      positions[idx + 4] = p2Y;
      positions[idx + 5] = 0;

      // Eye-catching randomized opacity for speech radiating spikes:
      // Some spikes burst with maximum visual pop (0.92 - 1.00),
      // some moderate cadence (0.72 - 0.86), and subtle depth (0.55 - 0.66).
      // Floor is kept at >= 0.55 so spikes never go as low as particles (0.25).
      const opRand = Math.random();
      let alpha;
      if (opRand < 0.4) {
        alpha = 0.92 + Math.random() * 0.08;
      } else if (opRand < 0.75) {
        alpha = 0.72 + Math.random() * 0.14;
      } else {
        alpha = 0.55 + Math.random() * 0.11;
      }

      const colIdx = i * 8; // 2 vertices * 4 components
      // Vertex 1
      colors[colIdx] = electricAqua.r;
      colors[colIdx + 1] = electricAqua.g;
      colors[colIdx + 2] = electricAqua.b;
      colors[colIdx + 3] = alpha;

      // Vertex 2
      colors[colIdx + 4] = electricAqua.r;
      colors[colIdx + 5] = electricAqua.g;
      colors[colIdx + 6] = electricAqua.b;
      colors[colIdx + 7] = alpha;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 4));
    return geom;
  }, [outerSpectrumBaseData, tint]);

  // 4. 3-Level Organically Scattered Orbital Particle Belts
  // Band 1 (Inner): r=1.02 ± 0.042 (80 particles, Clockwise)
  // Band 2 (Middle): r=1.18 ± 0.044 (95 particles, Counter-clockwise, with rotating comet orbiter)
  // Band 3 (Outer): r=1.34 ± 0.048 (85 particles, Clockwise)
  // Inter-Band & Boundary Motes: r in [0.96, 1.40] (40 particles)
  // Total: 300 particles, Electric Aqua-Cyan, Ice-Cyan, and Pure White
  const particleCount = 300;
  const { positions, baseRadii, baseAngles, baseZ, layerIds, colors, baseColors, scales } = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const bRadii = new Float32Array(particleCount);
    const bAngles = new Float32Array(particleCount);
    const bZ = new Float32Array(particleCount);
    const lIds = new Uint8Array(particleCount);
    // RGBA: itemSize = 4 for native Three.js USE_COLOR_ALPHA support
    const col = new Float32Array(particleCount * 4);
    const sca = new Float32Array(particleCount);

    const electricAqua = new THREE.Color("#00E5FF");
    const iceCyan = new THREE.Color("#B8F6FF");
    const pureWhite = new THREE.Color("#FFFFFF");

    const countB1 = 80; // Band 1: Inner Belt at r ≈ 1.02
    const countB2 = 95; // Band 2: Middle Belt at r ≈ 1.18
    const countB3 = 85; // Band 3: Outer Belt at r ≈ 1.34
    const countSprinkle = 40; // Inter-band and boundary motes

    for (let i = 0; i < particleCount; i++) {
      let r, angle, z, layerId;

      if (i < countB1) {
        // Band 1: Inner Belt (r ≈ 1.02, scatter ± 0.042)
        angle = (i / countB1) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
        r = 1.02 + (Math.random() - 0.5) * 0.084;
        z = (Math.random() - 0.5) * 0.06;
        layerId = 1; // Clockwise
      } else if (i < countB1 + countB2) {
        // Band 2: Middle Belt (r ≈ 1.18, scatter ± 0.044)
        const k = i - countB1;
        angle = (k / countB2) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
        r = 1.18 + (Math.random() - 0.5) * 0.088;
        z = (Math.random() - 0.5) * 0.06;
        layerId = 2; // Counter-clockwise
      } else if (i < countB1 + countB2 + countB3) {
        // Band 3: Outer Belt (r ≈ 1.34, scatter ± 0.048)
        const k = i - (countB1 + countB2);
        angle = (k / countB3) * Math.PI * 2 + (Math.random() - 0.5) * 0.1;
        r = 1.34 + (Math.random() - 0.5) * 0.096;
        z = (Math.random() - 0.5) * 0.07;
        layerId = 3; // Clockwise
      } else {
        // Inter-band and boundary motes
        const k = i - (countB1 + countB2 + countB3);
        angle = Math.random() * Math.PI * 2;
        if (k % 2 === 0) {
          r = 1.06 + Math.random() * 0.08; // between Band 1 and 2
          layerId = 4; // Counter-clockwise with Band 2
        } else {
          r = 1.22 + Math.random() * 0.08; // between Band 2 and 3
          layerId = 5; // Clockwise with Band 3
        }
        z = (Math.random() - 0.5) * 0.07;
      }

      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      const idx = i * 3;
      pos[idx] = x;
      pos[idx + 1] = y;
      pos[idx + 2] = z;

      bRadii[i] = r;
      bAngles[i] = angle;
      bZ[i] = z;
      lIds[i] = layerId;

      // Unified Holographic Electric Aqua-Cyan Palette matching reference laptop screen
      const colorRand = Math.random();
      const pColor = colorRand < 0.65 ? electricAqua : colorRand < 0.85 ? iceCyan : pureWhite;

      // Random opacity for each particle:
      // Some appear opaque (0.88 - 1.0), some translucent (0.50 - 0.75),
      // and some soft translucent (0.25 - 0.45) — strictly NO particles with zero opacity.
      const opRand = Math.random();
      let alpha;
      if (opRand < 0.35) {
        // Opaque / high-luminance motes
        alpha = 0.88 + Math.random() * 0.12;
      } else if (opRand < 0.7) {
        // Medium translucent motes
        alpha = 0.5 + Math.random() * 0.25;
      } else {
        // Subtle translucent motes (strictly non-zero, visible floor)
        alpha = 0.25 + Math.random() * 0.2;
      }

      const colIdx = i * 4;
      col[colIdx] = pColor.r;
      col[colIdx + 1] = pColor.g;
      col[colIdx + 2] = pColor.b;
      col[colIdx + 3] = alpha;
      sca[i] = 0.75 + Math.random() * 0.5;
    }

    return {
      positions: pos,
      baseRadii: bRadii,
      baseAngles: bAngles,
      baseZ: bZ,
      layerIds: lIds,
      colors: col,
      baseColors: col.slice(),
      scales: sca,
    };
  }, [particleCount]);

  // Recolour particles in place on a theme change, keeping their positions and opacities
  useEffect(() => {
    for (let i = 0; i < particleCount; i++) {
      const c = i * 4;
      const [r, g, b] = tint.rgb(baseColors[c] * 255, baseColors[c + 1] * 255, baseColors[c + 2] * 255);
      colors[c] = r / 255;
      colors[c + 1] = g / 255;
      colors[c + 2] = b / 255;
    }
    const attribute = pointsRef.current?.geometry?.attributes?.color;
    if (attribute) attribute.needsUpdate = true;
  }, [tint, colors, baseColors, particleCount]);

  // Free GPU copies of textures / geometries replaced by a theme change
  useEffect(() => () => coreBloomTexture?.dispose(), [coreBloomTexture]);
  useEffect(() => () => radarSweepTexture?.dispose(), [radarSweepTexture]);
  useEffect(() => () => statorTicksGeometry.dispose(), [statorTicksGeometry]);
  useEffect(() => () => outerSpectrumGeometry.dispose(), [outerSpectrumGeometry]);
  useEffect(
    () => () => {
      innerCometTailGeom.dispose();
      outerCometTailGeom.dispose();
      middleCometTailGeom.dispose();
    },
    [innerCometTailGeom, outerCometTailGeom, middleCometTailGeom]
  );

  // Frame Loop — Synchronized speed scaling, speech growth, particle-only rotation, zero GC
  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    const isSpeaking = status === "SPEAKING";
    const isThinking = status === "THINKING";
    const isListening = status === "LISTENING";

    // 1. Calculate speech energy strictly when speaking
    let instantSpeechEnergy = 0;
    let freqData = null;
    if (isSpeaking && pcmPlayer) {
      freqData = pcmPlayer.getByteFrequencyData();
      if (freqData && freqData.length > 0) {
        let sum = 0;
        const sampleCount = Math.min(32, freqData.length);
        for (let i = 0; i < sampleCount; i++) {
          sum += freqData[i];
        }
        instantSpeechEnergy = sum / (sampleCount * 255);
      }
    }

    const attack = instantSpeechEnergy > speechEnergyRef.current ? 0.45 : 0.12;
    speechEnergyRef.current += (instantSpeechEnergy - speechEnergyRef.current) * attack;
    const speechEnergy = speechEnergyRef.current;

    // Decay interactive click shockwave
    if (shockwaveRef.current > 0.01) {
      shockwaveRef.current -= delta * 2.5;
      if (shockwaveRef.current < 0) shockwaveRef.current = 0;
    }
    const shockwave = shockwaveRef.current;

    // 2. Synchronized Speeds: everything is very slow when IDLE
    const rotSpeed = isThinking ? 0.35 : isSpeaking ? 0.4 : isListening ? 0.16 : 0.045;
    const sweepSpeed = isThinking ? 0.5 : isSpeaking ? 0.6 : isListening ? 0.32 : 0.18;

    // 3. Rotate Holographic Radar Scanner Sweep Beam (Clockwise, subtle & very slow in idle)
    if (radarSweepRef.current) {
      radarSweepRef.current.rotation.z -= delta * sweepSpeed;
    }

    // 3b. Animate Stator Radial Line Segments:
    // - Rotates opposite to the light beam (counter-clockwise)
    // - Fixed uniform length (rIn = 0.63, rOut = 0.81), zero vertex mutation!
    const statorSpeed = sweepSpeed * 0.6;
    if (statorTicksRef.current) {
      statorTicksRef.current.rotation.z += delta * statorSpeed;
    }

    // 3c. Animate Dedicated Outer Speech Spectrum Layer (Outside r=0.86 outer border):
    // - Anchored permanently at top (no Z-rotation) so tallest spikes remain at 12 o'clock
    // - Radiates outward dynamically strictly when speaking, tapering clockwise down to 30% near the end
    // - Smoothly decays and fades to invisible (opacity 0) when idle
    if (outerSpectrumRef.current && outerSpectrumMatRef.current) {
      outerSpectrumRef.current.rotation.z = 0; // Spatially locked so top stays at top

      const heights = outerSpectrumHeightsRef.current;
      const { rIn, dirX, dirY, envelope } = outerSpectrumBaseData;
      const posAttr = outerSpectrumRef.current.geometry.attributes.position;
      const posArray = posAttr.array;

      let targetOpacity = 0.0;
      if (isSpeaking && freqData && freqData.length > 0) {
        targetOpacity = 0.92;
        const maxGrowthBase = SPEECH_SPIKE_BASE_LENGTH;
        for (let i = 0; i < tickCount; i++) {
          // Sample audio frequencies smoothly around the spectrum
          const binIndex = Math.min(
            freqData.length - 1,
            Math.floor((i / tickCount) * (freqData.length * 0.65)) + 1,
          );
          const rawAmp = freqData[binIndex] / 255;
          // Scale by rawAmp and apply clockwise envelope: startHeight at top (i=0) -> endHeight at end (i=49)
          const targetGrowth = (rawAmp * 0.85 + speechEnergy * 0.35) * maxGrowthBase * envelope[i];

          const attackSpeed = targetGrowth > heights[i] ? 0.48 : 0.22;
          heights[i] += (targetGrowth - heights[i]) * attackSpeed;
        }
      } else {
        targetOpacity = 0.0;
        for (let i = 0; i < tickCount; i++) {
          heights[i] *= 0.82;
          if (heights[i] < 0.001) heights[i] = 0;
        }
      }

      // Smoothly blend material opacity
      const opAttack = targetOpacity > outerSpectrumOpacityRef.current ? 0.38 : 0.14;
      outerSpectrumOpacityRef.current +=
        (targetOpacity - outerSpectrumOpacityRef.current) * opAttack;
      if (outerSpectrumOpacityRef.current < 0.005) outerSpectrumOpacityRef.current = 0;
      outerSpectrumMatRef.current.opacity = outerSpectrumOpacityRef.current;

      // Update buffer vertices while visible
      if (outerSpectrumOpacityRef.current > 0.005) {
        for (let i = 0; i < tickCount; i++) {
          const outerR = rIn + heights[i];
          const idx = i * 6 + 3;
          posArray[idx] = dirX[i] * outerR;
          posArray[idx + 1] = dirY[i] * outerR;
        }
        posAttr.needsUpdate = true;
      }
    }

    // 3c. Rotate Upper, Lower & Middle Border Orbiting Comet Particles
    const orbiterSpeedInner = sweepSpeed * 0.75;
    const orbiterSpeedOuter = sweepSpeed * 0.65;
    const orbiterSpeedMiddle = sweepSpeed * 0.55;
    if (innerOrbiterRef.current) {
      innerOrbiterRef.current.rotation.z -= delta * orbiterSpeedInner; // Clockwise
    }
    if (outerOrbiterRef.current) {
      outerOrbiterRef.current.rotation.z -= delta * orbiterSpeedOuter; // Clockwise
    }
    if (middleOrbiterRef.current) {
      middleOrbiterRef.current.rotation.z += delta * orbiterSpeedMiddle; // Counter-clockwise
    }

    // 4. FLOATING PARTICLES (3-level circular rings + sparse motes)
    // Speed is affected strictly by speaking state and they do not get displaced at all
    if (pointsRef.current) {
      const posAttr = pointsRef.current.geometry.attributes.position;
      const posArray = posAttr.array;

      const particleSpeedMult = isSpeaking
        ? 1.5 + speechEnergy * 3.0
        : isThinking
          ? 2.2
          : isListening
            ? 1.2
            : 1.0;

      // Accumulate orbital phases smoothly (Clockwise = negative, Counter-clockwise = positive)
      layerPhaseL1Ref.current -= delta * 0.024 * particleSpeedMult;
      layerPhaseL2Ref.current += delta * 0.02 * particleSpeedMult;
      layerPhaseL3Ref.current -= delta * 0.016 * particleSpeedMult;
      layerPhaseSprinkleL2Ref.current += delta * 0.02 * particleSpeedMult;
      layerPhaseSprinkleL3Ref.current -= delta * 0.016 * particleSpeedMult;

      const pL1 = layerPhaseL1Ref.current;
      const pL2 = layerPhaseL2Ref.current;
      const pL3 = layerPhaseL3Ref.current;
      const pSprL2 = layerPhaseSprinkleL2Ref.current;
      const pSprL3 = layerPhaseSprinkleL3Ref.current;

      for (let i = 0; i < particleCount; i++) {
        const idx = i * 3;
        const r = baseRadii[i]; // Strict fixed radius: ZERO displacement!
        const bA = baseAngles[i];
        const z = baseZ[i]; // Strict fixed Z: ZERO displacement!

        const lId = layerIds[i];
        const phase =
          lId === 1 ? pL1 : lId === 2 ? pL2 : lId === 3 ? pL3 : lId === 4 ? pSprL2 : pSprL3;

        const angle = bA + phase;

        posArray[idx] = Math.cos(angle) * r;
        posArray[idx + 1] = Math.sin(angle) * r;
        posArray[idx + 2] = z;
      }

      posAttr.needsUpdate = true;
    }

    // 5. Core Heat & Speech Level: 0 idle -> 1 thinking / speaking, eased; level = speech loudness 0-1
    const heatTarget = isThinking || isSpeaking ? 1 : 0;
    coreHeatRef.current += (heatTarget - coreHeatRef.current) * Math.min(1, delta * 6);
    const heat = coreHeatRef.current;
    const level = isSpeaking ? Math.min(1, speechEnergy / SPEECH_LEVEL_FULL) : 0;

    // 6. Dynamic Center Light Bloom: the core grows from its idle size while active and expands further with speech
    const speechGrowthMultiplier =
      (1.0 + (isSpeaking ? speechEnergy * 0.2 : 0) + shockwave * 0.25) *
      (CORE_IDLE_SCALE + (CORE_ACTIVE_SCALE - CORE_IDLE_SCALE) * heat);

    if (coreMeshRef.current) {
      coreMeshRef.current.scale.set(
        speechGrowthMultiplier,
        speechGrowthMultiplier,
        speechGrowthMultiplier,
      );
    }

    // Optical bloom billboard scale (base 1.85, energetic organic expansion when speaking or shockwave)
    if (flareSpriteRef.current) {
      const baseFlare = 1.85;
      const flareScale =
        baseFlare *
        (1.0 + (isSpeaking ? speechEnergy * 0.4 : 0) + shockwave * 0.25) *
        (1.0 + BLOOM_HEAT_GROWTH * heat) *
        (isHovered ? 1.08 : 1.0);
      flareSpriteRef.current.scale.set(flareScale, flareScale, 1);
    }

    // Modulate light intensity gently with speech
    if (centerLightRef.current) {
      centerLightRef.current.intensity =
        (isHovered ? 6.5 : 5.0) * (isSpeaking ? 1.0 + speechEnergy * 0.35 : 1.0) + shockwave * 1.5;
    }
    if (accentLightRef.current) {
      accentLightRef.current.intensity =
        8.0 * (isSpeaking ? 1.0 + speechEnergy * 0.35 : 1.0) + shockwave * 2.5;
    }

    // 7. Core look: a tiny white-hot point when idle, a white centre with a saturated corona while
    // thinking, widening and brightening with speech loudness up to the max-level look
    if (coreMatRef.current) {
      const uniforms = coreMatRef.current.uniforms;
      uniforms.uHeat.value = heat;
      uniforms.uLevel.value = level;
      uniforms.uTime.value = time;
    }
    if (flareMatRef.current) {
      flareMatRef.current.opacity = BLOOM_IDLE_OPACITY + heat * BLOOM_HEAT_OPACITY;
    }
  });

  // Interactive Core Click — triggers shockwave and toggles microphone
  const handleCoreClick = (e) => {
    e.stopPropagation();
    shockwaveRef.current = 1.0;
    if (onToggleListening) {
      onToggleListening();
    }
  };

  return (
    <group position={[0, 0, 0]}>
      {/* 1. VOLUMETRIC POINT LIGHTING (Electric Aqua-Cyan Illumination) */}
      <pointLight
        ref={centerLightRef}
        position={[0, 0, 0]}
        color="#FFFFFF"
        intensity={10}
        distance={8}
        decay={1.5}
      />
      <pointLight
        ref={accentLightRef}
        position={[0, 0, 0]}
        color={tint("#00E5FF")}
        intensity={16}
        distance={12}
        decay={1.3}
      />
      <pointLight
        ref={cyanLightRef}
        position={[0, 0, 0.4]}
        color={tint("#00F0FF")}
        intensity={6}
        distance={6}
        decay={1.5}
      />

      {/* 2. CONTINUOUS OPTICAL BLOOM SPRITE (Radiant Star Flare Aura, Electric Aqua-Cyan) */}
      {coreBloomTexture && (
        <sprite ref={flareSpriteRef} position={[0, 0, 0.04]} scale={[2.15, 2.15, 1]}>
          <spriteMaterial
            ref={flareMatRef}
            map={coreBloomTexture}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
            opacity={BLOOM_IDLE_OPACITY}
          />
        </sprite>
      )}

      {/* 3. 3D PLASMA CORE SPHERE (tiny white-hot point when idle, white centre + saturated corona when active) */}
      <group ref={coreMeshRef} position={[0, 0, 0.05]}>
        <mesh>
          <sphereGeometry args={[0.2, 64, 64]} />
          <shaderMaterial
            ref={coreMatRef}
            uniforms={coreUniforms}
            vertexShader={CORE_VERTEX_SHADER}
            fragmentShader={CORE_FRAGMENT_SHADER}
            transparent
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Interactive Hit Target Sphere for Core Click (Microphone Toggle) */}
      <mesh
        onClick={handleCoreClick}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerOver={() => setIsHovered(true)}
        onPointerOut={() => setIsHovered(false)}
        cursor="pointer"
        visible={false}>
        <sphereGeometry args={[0.45, 16, 16]} />
        <meshBasicMaterial />
      </mesh>

      {/* 4. STATOR FIN RADIAL TICKS & DIAL RINGS (Static HUD instrument - does not rotate) */}
      <group ref={statorGroupRef} position={[0, 0, 0]}>
        {/* Radial Tick Lines (Voice spectrum animated) */}
        <lineSegments ref={statorTicksRef} geometry={statorTicksGeometry}>
          <lineBasicMaterial
            vertexColors
            transparent
            opacity={1.0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>

        {/* Inner Bounding Ring (Electric Aqua accent) */}
        <lineLoop geometry={innerStatorGeom}>
          <lineBasicMaterial
            color={tint("#00E5FF")}
            transparent
            opacity={0.65}
            blending={THREE.AdditiveBlending}
          />
        </lineLoop>

        {/* Outer Bounding Ring of Stator (Electric Aqua) */}
        <lineLoop geometry={outerStatorGeom}>
          <lineBasicMaterial
            color={tint("#00E5FF")}
            transparent
            opacity={0.85}
            blending={THREE.AdditiveBlending}
          />
        </lineLoop>

        {/* Lower Border Orbiting Particle with Tail (Electric Aqua-Cyan on ring at r=0.60, clockwise) */}
        <group ref={innerOrbiterRef}>
          <line geometry={innerCometTailGeom}>
            <lineBasicMaterial
              vertexColors
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0.9}
            />
          </line>
          {/* Glowing Electric Aqua Head Particle */}
          <mesh position={[0.6, 0, 0.01]}>
            <sphereGeometry args={[0.014, 14, 14]} />
            <meshBasicMaterial
              color={tint("#00E5FF")}
              transparent
              opacity={0.9}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <mesh position={[0.6, 0, 0.012]}>
            <sphereGeometry args={[0.007, 10, 10]} />
            <meshBasicMaterial
              color="#FFFFFF"
              transparent
              opacity={0.98}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>

        {/* Upper Border Orbiting Particle with Tail (Electric Aqua-Cyan on ring at r=0.90, clockwise) */}
        <group ref={outerOrbiterRef}>
          <line geometry={outerCometTailGeom}>
            <lineBasicMaterial
              vertexColors
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0.9}
            />
          </line>
          {/* Glowing Electric Aqua Head Particle */}
          <mesh position={[0.9, 0, 0.01]}>
            <sphereGeometry args={[0.016, 14, 14]} />
            <meshBasicMaterial
              color={tint("#00E5FF")}
              transparent
              opacity={0.9}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <mesh position={[0.9, 0, 0.012]}>
            <sphereGeometry args={[0.008, 10, 10]} />
            <meshBasicMaterial
              color="#FFFFFF"
              transparent
              opacity={0.98}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>

        {/* Middle Particle Belt Orbiting Comet (Electric Aqua-Cyan on particle ring at r=1.18, matching border line style, counter-clockwise) */}
        <group ref={middleOrbiterRef}>
          <line geometry={middleCometTailGeom}>
            <lineBasicMaterial
              vertexColors
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0.95}
            />
          </line>

          {/* Glowing Electric Aqua-Cyan Head Particle */}
          <mesh position={[1.18, 0, 0.018]}>
            <sphereGeometry args={[0.016, 14, 14]} />
            <meshBasicMaterial
              color={tint("#00E5FF")}
              transparent
              opacity={0.9}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
          <mesh position={[1.18, 0, 0.02]}>
            <sphereGeometry args={[0.008, 10, 10]} />
            <meshBasicMaterial
              color="#FFFFFF"
              transparent
              opacity={0.98}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>

        {/* Dedicated Outer Speech-Reactive Spectrum Layer (Radiates outside r=0.86 strictly when speaking) */}
        <lineSegments ref={outerSpectrumRef} geometry={outerSpectrumGeometry}>
          <lineBasicMaterial
            ref={outerSpectrumMatRef}
            vertexColors
            transparent
            opacity={0.0}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </lineSegments>
      </group>

      {/* 5. HOLOGRAPHIC ROTATING RADAR SWEEP BEAM (Electric Blue Laser Scanner) */}
      {radarSweepTexture && (
        <mesh ref={radarSweepRef} position={[0, 0, -0.02]}>
          <planeGeometry args={[2.8, 2.8]} />
          <meshBasicMaterial
            map={radarSweepTexture}
            transparent
            opacity={status === "THINKING" ? 0.38 : status === "SPEAKING" ? 0.32 : 0.25}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* 6. FLOATING PARTICLES LAYER (Exclusively outside radial dial and line segments) */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={particleCount}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 4]}
            count={particleCount}
            itemSize={4}
          />
          <bufferAttribute
            attach="attributes-size"
            args={[scales, 1]}
            count={particleCount}
            itemSize={1}
          />
        </bufferGeometry>
        <pointsMaterial
          map={circleParticleTexture}
          size={0.038}
          vertexColors
          transparent
          opacity={1.0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

export default ArcReactorOrb;

