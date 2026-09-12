import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const HOME_POSITION = new THREE.Vector3(0, 0.58, 6.38);
const MIN_DISTANCE = 0.6;
const MAX_DISTANCE = 40;

/**
 * Creates and initializes the holographic Ultron Orb Three.js scene.
 * Faithfully ports Sagar Tamang's Ultron Orb UI with live audio reactivity and controls.
 *
 * @param {HTMLElement} container The DOM element mounting the WebGL canvas.
 * @param {Object} [options]
 * @param {() => number} [options.getAudioEnergy] Callback returning normalized audio energy [0..1].
 * @returns {Object} OrbSceneApi
 */
export function createOrbScene(container, options = {}) {
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  let getAudioEnergy = options.getAudioEnergy || (() => 0);
  let getStatus = options.getStatus || (() => "IDLE");
  let internalStatus = "IDLE";

  // ——— SCENE & CAMERA ———
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 500);
  camera.position.copy(HOME_POSITION);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(typeof window !== "undefined" ? window.devicePixelRatio : 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  container.appendChild(renderer.domElement);

  // ——— POST PROCESSING ———
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    1.8, // strength
    0.4, // radius
    0.2  // threshold
  );
  composer.addPass(bloom);

  // Chromatic aberration + color grade shader (Warm Stark Gold/Amber tones)
  const chromaticShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uIntensity: { value: 0.003 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        vec2 dir = vUv - vec2(0.5);
        float d = length(dir);
        float offset = uIntensity * d;
        // Subtle rhythmic flicker
        float flicker = 1.0 + 0.02 * sin(uTime * 30.0) * sin(uTime * 7.3);
        vec4 cr = texture2D(tDiffuse, vUv + dir * offset);
        vec4 cg = texture2D(tDiffuse, vUv);
        vec4 cb = texture2D(tDiffuse, vUv - dir * offset * 0.5);
        gl_FragColor = vec4(cr.r, cg.g * 1.05, cb.b * 0.6, 1.0) * flicker;
        // Push towards rich gold/amber tones
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(1.18, 0.88, 0.52), 0.35);
      }
    `,
  };
  const chromaticPass = new ShaderPass(chromaticShader);
  composer.addPass(chromaticPass);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.04;
  controls.minDistance = MIN_DISTANCE;
  controls.maxDistance = MAX_DISTANCE;
  controls.zoomSpeed = 1.4;
  controls.enablePan = false;

  // ——— STARK GOLD COLOR PALETTE ———
  const C_BRIGHT = 0xffaa30;
  const C_MID = 0xdd7700;
  const C_DIM = 0x884400;
  const C_FAINT = 0x553300;
  const C_HOT = 0xffcc66;

  // ——— ORB ROOT GROUP ———
  const orbGroup = new THREE.Group();
  scene.add(orbGroup);

  // Helper: Line material with additive blending
  function lineMat(color, opacity = 1) {
    return new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  // Latitude ring generator
  function latRing(radius, lat, segs = 120) {
    const r = radius * Math.cos(lat);
    const y = radius * Math.sin(lat);
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }

  // Meridian generator
  function meridian(radius, lon, segs = 120) {
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const lat = (i / segs) * Math.PI - Math.PI / 2;
      pts.push(
        new THREE.Vector3(
          radius * Math.cos(lat) * Math.cos(lon),
          radius * Math.sin(lat),
          radius * Math.cos(lat) * Math.sin(lon)
        )
      );
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }

  // ═══════════════════════════════════════════════
  // LAYER 1: OUTER SHELL — DENSE WIREFRAME GRID
  // ═══════════════════════════════════════════════
  const outerShell = new THREE.Group();
  const R1 = 2.0;

  // Dense latitude rings (31 rings)
  for (let i = -15; i <= 15; i++) {
    const lat = (i / 15) * (Math.PI / 2) * 0.95;
    const opacity = i % 3 === 0 ? 0.5 : 0.12;
    const color = i % 3 === 0 ? C_MID : C_FAINT;
    outerShell.add(new THREE.Line(latRing(R1, lat), lineMat(color, opacity)));
  }

  // Dense meridians (24 lines)
  for (let i = 0; i < 24; i++) {
    const lon = (i / 24) * Math.PI * 2;
    const isMajor = i % 6 === 0;
    outerShell.add(
      new THREE.Line(
        meridian(R1, lon),
        lineMat(isMajor ? C_MID : C_FAINT, isMajor ? 0.6 : 0.1)
      )
    );
  }

  // 4 bright cross meridians (the "plus" shape) — wide bands
  const CROSS_LINES = 18;
  const CROSS_SPREAD = 0.25;
  for (let i = 0; i < 4; i++) {
    const lon = (i / 4) * Math.PI * 2;
    for (let j = 0; j < CROSS_LINES; j++) {
      const t = (j / (CROSS_LINES - 1)) * 2 - 1;
      const offset = (t * CROSS_SPREAD) / 2;
      const falloff = 1 - Math.abs(t) * 0.7;
      const opacity = 0.85 * falloff;
      const color = Math.abs(t) < 0.3 ? C_BRIGHT : C_MID;
      outerShell.add(
        new THREE.Line(meridian(R1, lon + offset, 200), lineMat(color, opacity))
      );
    }
  }

  // Bright equator band — wide
  const EQ_LINES = 20;
  const EQ_SPREAD = 0.35;
  for (let j = 0; j < EQ_LINES; j++) {
    const t = (j / (EQ_LINES - 1)) * 2 - 1;
    const offset = (t * EQ_SPREAD) / 2;
    const falloff = 1 - Math.abs(t) * 0.65;
    const opacity = 0.8 * falloff;
    const color = Math.abs(t) < 0.3 ? C_BRIGHT : C_MID;
    outerShell.add(
      new THREE.Line(latRing(R1, offset, 200), lineMat(color, opacity))
    );
  }

  orbGroup.add(outerShell);

  // ═══════════════════════════════════════════════
  // LAYER 2: GRID PANELS ON SPHERE SURFACE
  // ═══════════════════════════════════════════════
  const panelGroup = new THREE.Group();

  function createSpherePanel(latCenter, lonCenter, latSpan, lonSpan, radius, divisions = 4) {
    const group = new THREE.Group();
    const mat = lineMat(C_DIM, 0.25);

    // horizontal lines
    for (let i = 0; i <= divisions; i++) {
      const lat = latCenter - latSpan / 2 + (i / divisions) * latSpan;
      const pts = [];
      for (let j = 0; j <= divisions * 4; j++) {
        const lon = lonCenter - lonSpan / 2 + (j / (divisions * 4)) * lonSpan;
        pts.push(
          new THREE.Vector3(
            radius * Math.cos(lat) * Math.cos(lon),
            radius * Math.sin(lat),
            radius * Math.cos(lat) * Math.sin(lon)
          )
        );
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }

    // vertical lines
    for (let j = 0; j <= divisions; j++) {
      const lon = lonCenter - lonSpan / 2 + (j / divisions) * lonSpan;
      const pts = [];
      for (let i = 0; i <= divisions * 4; i++) {
        const lat = latCenter - latSpan / 2 + (i / (divisions * 4)) * latSpan;
        pts.push(
          new THREE.Vector3(
            radius * Math.cos(lat) * Math.cos(lon),
            radius * Math.sin(lat),
            radius * Math.cos(lat) * Math.sin(lon)
          )
        );
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }

    return group;
  }

  for (let i = 0; i < 30; i++) {
    const lat = (Math.random() - 0.5) * Math.PI * 0.8;
    const lon = Math.random() * Math.PI * 2;
    const size = 0.15 + Math.random() * 0.25;
    const panel = createSpherePanel(
      lat,
      lon,
      size,
      size,
      R1 + 0.01,
      3 + Math.floor(Math.random() * 3)
    );
    panelGroup.add(panel);
  }
  orbGroup.add(panelGroup);

  // ═══════════════════════════════════════════════
  // LAYER 3: SECONDARY SHELL — OFFSET PARTIAL ARCS
  // ═══════════════════════════════════════════════
  const shell2 = new THREE.Group();
  const R2 = 2.12;

  // Partial arcs at random latitudes
  for (let i = 0; i < 16; i++) {
    const lat = (Math.random() - 0.5) * Math.PI * 0.85;
    const startLon = Math.random() * Math.PI * 2;
    const arcLen = 0.3 + Math.random() * 1.2;
    const pts = [];
    const segs = 60;
    const r = R2 * Math.cos(lat);
    const y = R2 * Math.sin(lat);
    for (let j = 0; j <= segs; j++) {
      const a = startLon + (j / segs) * arcLen;
      pts.push(new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a)));
    }
    shell2.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        lineMat(C_MID, 0.2 + Math.random() * 0.3)
      )
    );
  }

  // Partial meridian arcs
  for (let i = 0; i < 12; i++) {
    const lon = Math.random() * Math.PI * 2;
    const startLat = (Math.random() - 0.5) * Math.PI * 0.8;
    const arcLen = 0.3 + Math.random() * 0.8;
    const pts = [];
    const segs = 40;
    for (let j = 0; j <= segs; j++) {
      const lat = startLat + (j / segs) * arcLen;
      pts.push(
        new THREE.Vector3(
          R2 * Math.cos(lat) * Math.cos(lon),
          R2 * Math.sin(lat),
          R2 * Math.cos(lat) * Math.sin(lon)
        )
      );
    }
    shell2.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        lineMat(C_DIM, 0.15 + Math.random() * 0.2)
      )
    );
  }
  orbGroup.add(shell2);

  // ═══════════════════════════════════════════════
  // LAYER 4: INNER CORE — SPIRAL GEODESIC
  // ═══════════════════════════════════════════════
  const innerCore = new THREE.Group();
  const R3 = 0.9;

  // Dense spirals
  for (let s = 0; s < 8; s++) {
    const pts = [];
    const turns = 3 + Math.random() * 2;
    const segs = 300;
    const phase = (s / 8) * Math.PI * 2;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const lat = t * Math.PI - Math.PI / 2;
      const lon = t * turns * Math.PI * 2 + phase;
      pts.push(
        new THREE.Vector3(
          R3 * Math.cos(lat) * Math.cos(lon),
          R3 * Math.sin(lat),
          R3 * Math.cos(lat) * Math.sin(lon)
        )
      );
    }
    innerCore.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        lineMat(C_BRIGHT, 0.3 + Math.random() * 0.2)
      )
    );
  }

  // Inner latitude rings
  for (let i = -6; i <= 6; i++) {
    const lat = (i / 6) * (Math.PI / 2) * 0.9;
    innerCore.add(new THREE.Line(latRing(R3, lat, 80), lineMat(C_DIM, 0.2)));
  }

  // Inner meridians
  for (let i = 0; i < 12; i++) {
    const lon = (i / 12) * Math.PI * 2;
    innerCore.add(new THREE.Line(meridian(R3, lon, 80), lineMat(C_DIM, 0.15)));
  }

  orbGroup.add(innerCore);

  // ═══════════════════════════════════════════════
  // LAYER 5: INNERMOST CORE — HOT CENTER
  // ═══════════════════════════════════════════════
  const coreR = 0.25;

  // Icosahedron wireframe core
  const icoGeo = new THREE.IcosahedronGeometry(coreR, 1);
  const icoEdges = new THREE.EdgesGeometry(icoGeo);
  const icoWireMat = lineMat(C_HOT, 0.9);
  const icoWire = new THREE.LineSegments(icoEdges, icoWireMat);
  orbGroup.add(icoWire);

  // Glowing center sphere
  const coreSphereMat = new THREE.MeshBasicMaterial({
    color: C_HOT,
    transparent: true,
    opacity: 0.15,
    blending: THREE.AdditiveBlending,
  });
  const coreSphere = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), coreSphereMat);
  orbGroup.add(coreSphere);

  // Larger faint glow
  const glowSphereMat = new THREE.MeshBasicMaterial({
    color: C_MID,
    transparent: true,
    opacity: 0.04,
    blending: THREE.AdditiveBlending,
  });
  const glowSphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), glowSphereMat);
  orbGroup.add(glowSphere);

  // ═══════════════════════════════════════════════
  // FLOATING CODE TEXT SPRITES
  // ═══════════════════════════════════════════════
  const codeSnippets = [
    "sys.init()", "0xFF3A", "malloc()", ">> SCAN", "void*", "ACK",
    "SYNC OK", "ptr_ref", "exec()", "hash256", "::bind", "core.0",
    "01101001", "10110100", ">>> RDY", "HEAP 4K", "TCP/SYN",
    "mutex.lk", "IRQ 0x7", "DMA xfer", "REG EAX", "FAULT 0",
    "kernel.d", "pipe |>", "chmod +x", "fork()", "SIGTERM",
    "eth0: UP", "AES-256", "RSA 4096", "TLS 1.3", "HTTP/2",
    "latency", "200 OK", "PATCH /", "fn main", "use std",
    "impl Orb", "async {}", "spawn()", "arc::new", ".unwrap",
    "STARK // GOLD", "J.A.R.V.I.S", "NEURAL.AI", "QUANTUM",
  ];

  function makeTextSprite(text, size = 0.08) {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 32;
    const ctx = c.getContext("2d");
    if (!ctx) return new THREE.Group();
    ctx.font = "bold 14px Courier New";
    const alpha = 0.35 + Math.random() * 0.55;
    ctx.fillStyle = `rgba(255, ${(160 + Math.random() * 60) | 0}, ${(20 + Math.random() * 30) | 0}, ${alpha})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 16);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    s.scale.set(size * 5, size * 0.7, 1);
    return s;
  }

  function scatterText(count, sizeFn, rFn, speedScale) {
    const group = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const sp = makeTextSprite(
        codeSnippets[Math.floor(Math.random() * codeSnippets.length)],
        sizeFn()
      );
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = rFn();
      sp.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      sp.userData = {
        phi,
        theta,
        r,
        speed:
          (speedScale[0] + Math.random() * speedScale[1]) *
          (Math.random() > 0.5 ? 1 : -1),
      };
      group.add(sp);
    }
    return group;
  }

  // On outer sphere (dense text coverage)
  const textOuter = scatterText(
    1000,
    () => 0.04 + Math.random() * 0.04,
    () => R1 + 0.03 + Math.random() * 0.08,
    [0.0002, 0.0008]
  );
  orbGroup.add(textOuter);

  // On inner core
  const textInner = scatterText(
    100,
    () => 0.03 + Math.random() * 0.03,
    () => R3 + 0.02,
    [0.0005, 0.001]
  );
  orbGroup.add(textInner);

  // Floating ambient text
  const textAmbient = scatterText(
    350,
    () => 0.03,
    () => R3 + 0.2 + Math.random() * (R1 - R3 - 0.3),
    [0.0003, 0.0006]
  );
  orbGroup.add(textAmbient);

  // ═══════════════════════════════════════════════
  // ORBITING DEBRIS / SPACE ROCKS
  // ═══════════════════════════════════════════════
  const debrisGeos = [
    new THREE.IcosahedronGeometry(0.012, 0),
    new THREE.IcosahedronGeometry(0.02, 0),
    new THREE.IcosahedronGeometry(0.03, 1),
    new THREE.IcosahedronGeometry(0.008, 0),
    new THREE.TetrahedronGeometry(0.015, 0),
    new THREE.OctahedronGeometry(0.018, 0),
  ];

  const debris = [];
  for (let i = 0; i < 220; i++) {
    const geo = debrisGeos[Math.floor(Math.random() * debrisGeos.length)];
    const mat = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.7 ? C_BRIGHT : C_MID,
      transparent: true,
      opacity: 0.3 + Math.random() * 0.6,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const orbitR = 1.2 + Math.random() * 4.0;
    const speed = (0.08 + Math.random() * 0.6) * (Math.random() > 0.5 ? 1 : -1);
    const tiltX = (Math.random() - 0.5) * Math.PI * 0.9;
    const tiltZ = (Math.random() - 0.5) * Math.PI * 0.5;
    const phase = Math.random() * Math.PI * 2;
    mesh.userData = { orbitR, speed, tiltX, tiltZ, phase };
    debris.push(mesh);
    orbGroup.add(mesh);

    if (Math.random() > 0.85) {
      const trailPts = [];
      for (let j = 0; j <= 15; j++) {
        const a = -(j / 15) * 0.3;
        trailPts.push(
          new THREE.Vector3(
            orbitR * Math.cos(a + phase),
            orbitR * 0.08 * Math.sin(a * 3),
            orbitR * Math.sin(a + phase)
          )
        );
      }
      const trail = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(trailPts),
        lineMat(C_FAINT, 0.08)
      );
      mesh.add(trail);
    }
  }

  // ═══════════════════════════════════════════════
  // DUST PARTICLES
  // ═══════════════════════════════════════════════
  const dustCount = 1800;
  const dustPos = new Float32Array(dustCount * 3);

  for (let i = 0; i < dustCount; i++) {
    const rr = 0.5 + Math.pow(Math.random(), 0.6) * 7;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dustPos[i * 3] = rr * Math.sin(phi) * Math.cos(theta);
    dustPos[i * 3 + 1] = rr * Math.cos(phi);
    dustPos[i * 3 + 2] = rr * Math.sin(phi) * Math.sin(theta);
  }

  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(dustPos, 3));

  const dotC = document.createElement("canvas");
  dotC.width = dotC.height = 64;
  const dCtx = dotC.getContext("2d");
  if (dCtx) {
    const g = dCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,184,0,1)");
    g.addColorStop(0.2, "rgba(255,140,20,0.6)");
    g.addColorStop(0.5, "rgba(200,80,0,0.15)");
    g.addColorStop(1, "rgba(100,40,0,0)");
    dCtx.fillStyle = g;
    dCtx.fillRect(0, 0, 64, 64);
  }

  const dustMat = new THREE.PointsMaterial({
    map: new THREE.CanvasTexture(dotC),
    size: 0.04,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    color: C_BRIGHT,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  orbGroup.add(dustPoints);

  // ═══════════════════════════════════════════════
  // SCANNING RINGS
  // ═══════════════════════════════════════════════
  function makeScanRing(radius, thickness = 0.015) {
    const geo = new THREE.RingGeometry(radius - thickness, radius + thickness, 120);
    const mat = new THREE.MeshBasicMaterial({
      color: C_BRIGHT,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }

  const scanRing1 = makeScanRing(R1, 0.01);
  const scanRing2 = makeScanRing(R1 * 0.7, 0.008);
  orbGroup.add(scanRing1, scanRing2);

  // ═══════════════════════════════════════════════
  // HEXAGONAL NODES
  // ═══════════════════════════════════════════════
  for (let i = 0; i < 15; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = R1 + 0.02;
    const hexGeo = new THREE.CircleGeometry(0.03 + Math.random() * 0.02, 6);
    const hexEdges = new THREE.EdgesGeometry(hexGeo);
    const hex = new THREE.LineSegments(hexEdges, lineMat(C_MID, 0.5));
    hex.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    );
    hex.lookAt(0, 0, 0);
    outerShell.add(hex);
  }

  // ═══════════════════════════════════════════════
  // PROGRAMMATIC CAMERA CONTROL
  // ═══════════════════════════════════════════════
  const sphericalScratch = new THREE.Spherical();
  const offsetScratch = new THREE.Vector3();

  function rotateBy(deltaTheta, deltaPhi) {
    offsetScratch.copy(camera.position).sub(controls.target);
    sphericalScratch.setFromVector3(offsetScratch);
    sphericalScratch.theta -= deltaTheta;
    sphericalScratch.phi = THREE.MathUtils.clamp(
      sphericalScratch.phi - deltaPhi,
      0.05,
      Math.PI - 0.05
    );
    sphericalScratch.makeSafe();
    offsetScratch.setFromSpherical(sphericalScratch);
    camera.position.copy(controls.target).add(offsetScratch);
    camera.lookAt(controls.target);
  }

  function zoomBy(factor) {
    offsetScratch.copy(camera.position).sub(controls.target);
    const dist = THREE.MathUtils.clamp(
      offsetScratch.length() * factor,
      MIN_DISTANCE,
      MAX_DISTANCE
    );
    offsetScratch.setLength(dist);
    camera.position.copy(controls.target).add(offsetScratch);
  }

  function resetView() {
    camera.position.copy(HOME_POSITION);
    controls.target.set(0, 0, 0);
    camera.lookAt(controls.target);
    controls.update();
  }

  // ═══════════════════════════════════════════════
  // ANIMATION & AUDIO REACTIVE LOOP
  // ═══════════════════════════════════════════════
  const clock = new THREE.Clock();
  let flickerTimer = 0;
  let rafId = 0;
  let disposed = false;

  // ═══════════════════════════════════════════════
  // MULTI-STATE DYNAMIC INTERPOLATION ENGINE
  // ═══════════════════════════════════════════════
  let stateIdleWeight = 1.0;
  let stateThinkingWeight = 0.0;
  let stateSpeakingWeight = 0.0;

  let currentRotMult = 1.0;
  let currentScanSpeed = 0.6;
  let currentTextSpeedMult = 1.0;

  function animate() {
    if (disposed) return;
    rafId = requestAnimationFrame(animate);

    const delta = Math.min(0.08, clock.getDelta());
    const t = clock.getElapsedTime();

    // Sample real-time audio energy and active cognitive status
    const audioEnergy = Math.min(1.0, Math.max(0, getAudioEnergy() || 0));
    const audioBoost = audioEnergy * 1.8;
    const rawStatus = (typeof getStatus === "function" ? getStatus() : internalStatus) || "IDLE";

    // Target state arbitration:
    // SPEAKING: explicit status or active audio energy detected
    // THINKING: awaiting LLM/tool response
    // IDLE: listening/connected/disconnected resting
    let targetIdle = 0;
    let targetThinking = 0;
    let targetSpeaking = 0;

    if (rawStatus === "SPEAKING" || audioEnergy > 0.07) {
      targetSpeaking = 1.0;
    } else if (rawStatus === "THINKING") {
      targetThinking = 1.0;
    } else {
      targetIdle = 1.0;
    }

    // Exponential smoothing for weights (~250ms transition half-life, zero pop)
    const lerpSpeed = 1.0 - Math.exp(-delta * 7.5);
    stateIdleWeight += (targetIdle - stateIdleWeight) * lerpSpeed;
    stateThinkingWeight += (targetThinking - stateThinkingWeight) * lerpSpeed;
    stateSpeakingWeight += (targetSpeaking - stateSpeakingWeight) * lerpSpeed;

    // Harmonized target multipliers
    const targetRotMult =
      stateIdleWeight * 1.0 +
      stateThinkingWeight * 2.7 +
      stateSpeakingWeight * (1.25 + audioBoost * 2.4);
    currentRotMult += (targetRotMult - currentRotMult) * lerpSpeed;

    const targetTextMult =
      stateIdleWeight * 1.0 +
      stateThinkingWeight * 3.6 +
      stateSpeakingWeight * (1.2 + audioBoost * 1.6);
    currentTextSpeedMult += (targetTextMult - currentTextSpeedMult) * lerpSpeed;

    const targetScanFreq =
      stateIdleWeight * 0.6 +
      stateThinkingWeight * 2.8 +
      stateSpeakingWeight * (0.9 + audioBoost * 1.3);
    currentScanSpeed += (targetScanFreq - currentScanSpeed) * lerpSpeed;

    // Shell rotations
    outerShell.rotation.y += 0.0015 * currentRotMult;
    outerShell.rotation.x = Math.sin(t * (0.08 + stateThinkingWeight * 0.15)) * (0.05 + stateThinkingWeight * 0.04);

    panelGroup.rotation.y += 0.0018 * currentRotMult;
    panelGroup.rotation.x = Math.sin(t * (0.08 + stateThinkingWeight * 0.15) + 0.5) * (0.04 + stateThinkingWeight * 0.03);

    shell2.rotation.y -= 0.001 * currentRotMult;
    shell2.rotation.z = Math.sin(t * (0.12 + stateThinkingWeight * 0.18)) * 0.03;

    // Core dynamics (Breathing in IDLE, High-Freq Pulse in THINKING, Dramatic Growth in SPEAKING)
    const idleBreath = Math.sin(t * 1.5) * 0.08;
    const thinkingVibe = Math.sin(t * 14.0) * 0.14 + Math.sin(t * 22.0) * 0.07;
    // Dramatic speaking expansion: sustained baseline enlargement (1.85x) + dynamic audio surge (up to +3.8x)
    const speakingExpansion = 1.85 + audioBoost * 3.8 + Math.sin(t * 6.0) * 0.15;

    innerCore.rotation.y -= 0.005 * currentRotMult;
    innerCore.rotation.z += 0.002 * (1.0 + stateThinkingWeight * 1.6);
    innerCore.rotation.x = Math.cos(t * 0.1) * 0.08;
    const innerCoreScale =
      1.0 +
      stateIdleWeight * idleBreath * 0.3 +
      stateThinkingWeight * 0.04 +
      stateSpeakingWeight * (0.35 + audioBoost * 0.5);
    innerCore.scale.setScalar(innerCoreScale);

    icoWire.rotation.x += 0.008 * currentRotMult;
    icoWire.rotation.y += 0.012 * currentRotMult;

    const coreScale = 1.0 +
      stateIdleWeight * idleBreath +
      stateThinkingWeight * thinkingVibe +
      stateSpeakingWeight * speakingExpansion;
    coreSphere.scale.setScalar(Math.max(0.65, coreScale));

    const coreOpacity =
      stateIdleWeight * (0.16 + Math.sin(t * 1.5) * 0.04) +
      stateThinkingWeight * (0.42 + Math.sin(t * 10.0) * 0.14) +
      stateSpeakingWeight * Math.min(0.95, 0.48 + audioBoost * 0.5);
    coreSphereMat.opacity = Math.max(0.05, Math.min(0.95, coreOpacity));

    // Outer glow aura expands dramatically outward when speaking (r = 0.5 -> up to 1.85)
    const glowExpansion = 1.65 + audioBoost * 2.8 + Math.sin(t * 5.0) * 0.12;
    const glowScale =
      stateIdleWeight * (1.0 + idleBreath * 0.5) +
      stateThinkingWeight * (0.75 + Math.sin(t * 12.0) * 0.12) +
      stateSpeakingWeight * (1.0 + glowExpansion);
    glowSphere.scale.setScalar(Math.max(0.4, glowScale));

    const glowOpacity =
      stateIdleWeight * (0.04 + Math.sin(t * 1.5) * 0.015) +
      stateThinkingWeight * 0.09 +
      stateSpeakingWeight * Math.min(0.45, 0.16 + audioBoost * 0.28);
    glowSphereMat.opacity = Math.max(0.01, Math.min(0.45, glowOpacity));

    // Icosahedron geometric lattice expands outward framing the growing core (r = 0.25 -> up to 1.1)
    const icoExpansion = 1.5 + audioBoost * 2.6 + Math.sin(t * 6.0) * 0.12;
    const icoScale =
      stateIdleWeight * 1.0 +
      stateThinkingWeight * (1.06 + thinkingVibe * 0.8) +
      stateSpeakingWeight * (1.0 + icoExpansion);
    icoWire.scale.setScalar(Math.max(0.6, icoScale));

    const icoOpacity =
      stateIdleWeight * 0.65 +
      stateThinkingWeight * (0.85 + Math.sin(t * 16.0) * 0.12) +
      stateSpeakingWeight * Math.min(1.0, 0.85 + audioBoost * 0.25);
    icoWireMat.opacity = Math.max(0.2, Math.min(1.0, icoOpacity));

    // Debris orbits
    debris.forEach((d) => {
      const u = d.userData;
      const a = t * u.speed * currentRotMult + u.phase;
      d.position.set(
        u.orbitR * Math.cos(a) * Math.cos(u.tiltX),
        u.orbitR * Math.sin(u.tiltX) * Math.sin(a * 0.8) + Math.sin(a * 0.3 + u.tiltZ) * 0.2,
        u.orbitR * Math.sin(a) * Math.cos(u.tiltZ)
      );
      d.rotation.x += 0.015 * currentRotMult;
      d.rotation.z += 0.01 * currentRotMult;
    });

    // Text drift with radial breathing in SPEAKING and acceleration in THINKING
    const driftGroups = [
      [textOuter, 1],
      [textInner, 2],
      [textAmbient, 1.2],
    ];
    const textRadiusExpansion = 1.0 + stateSpeakingWeight * audioBoost * 0.12;

    for (const [group, mult] of driftGroups) {
      group.children.forEach((sp) => {
        const u = sp.userData;
        if (!u) return;
        u.theta += u.speed * mult * currentTextSpeedMult;
        const currentR = u.r * textRadiusExpansion;
        sp.position.set(
          currentR * Math.sin(u.phi) * Math.cos(u.theta),
          currentR * Math.cos(u.phi),
          currentR * Math.sin(u.phi) * Math.sin(u.theta)
        );
      });
    }

    // Scan rings sweeping
    const scanPhase1 = t * currentScanSpeed;
    const scanY1 = Math.sin(scanPhase1) * R1 * 0.88;
    scanRing1.position.y = scanY1;
    const scanS1 = (Math.sqrt(Math.max(0, R1 * R1 - scanY1 * scanY1)) / R1) *
      (1.0 + stateSpeakingWeight * audioBoost * 0.25);
    scanRing1.scale.set(scanS1, scanS1, 1);
    const ring1Opacity =
      (stateIdleWeight * 0.22 +
       stateThinkingWeight * 0.75 +
       stateSpeakingWeight * (0.28 + audioBoost * 0.55)) *
      Math.abs(Math.cos(scanPhase1));
    scanRing1.material.opacity = Math.min(0.9, ring1Opacity);

    const scanPhase2 = t * (currentScanSpeed * 1.25) + 1.8;
    const scanY2 = Math.sin(scanPhase2) * R3 * 0.92;
    scanRing2.position.y = scanY2;
    const scanS2 = (Math.sqrt(Math.max(0, R3 * R3 - scanY2 * scanY2)) / R3) *
      (1.0 + stateSpeakingWeight * audioBoost * 0.2);
    scanRing2.scale.set(scanS2, scanS2, 1);
    scanRing2.rotation.z = stateThinkingWeight * Math.sin(t * 3.5) * 0.45;
    const ring2Opacity =
      (stateIdleWeight * 0.18 +
       stateThinkingWeight * 0.68 +
       stateSpeakingWeight * (0.22 + audioBoost * 0.5)) *
      Math.abs(Math.cos(scanPhase2));
    scanRing2.material.opacity = Math.min(0.85, ring2Opacity);

    // Dust rotation
    dustPoints.rotation.y += 0.0002 * currentRotMult;

    // Random panel flicker
    flickerTimer += delta;
    const flickerInterval = stateThinkingWeight > 0.5 ? 0.04 : 0.09;
    if (flickerTimer > flickerInterval) {
      flickerTimer = 0;
      const toggleProb = stateThinkingWeight > 0.5 ? 0.25 : (stateSpeakingWeight > 0.5 ? 0.15 : 0.05);
      panelGroup.children.forEach((p) => {
        if (Math.random() < toggleProb) {
          p.visible = !p.visible;
          if (p.children[0]?.material) {
            p.children[0].material.opacity =
              stateThinkingWeight > 0.5
                ? 0.35 + Math.random() * 0.45
                : 0.1 + Math.random() * 0.35;
          }
        }
      });
    }

    // Dynamic bloom pulse
    const idleBloom = 1.5 + Math.sin(t * 0.8) * 0.2;
    const thinkingBloom = 2.0 + Math.sin(t * 6.0) * 0.35;
    const speakingBloom = 1.6 + audioBoost * 1.5;

    bloom.strength =
      stateIdleWeight * idleBloom +
      stateThinkingWeight * thinkingBloom +
      stateSpeakingWeight * speakingBloom;

    // Chromatic aberration pass
    chromaticPass.uniforms.uTime.value = t;
    chromaticPass.uniforms.uIntensity.value =
      0.003 + stateThinkingWeight * 0.0025 + stateSpeakingWeight * audioBoost * 0.003;

    controls.update();
    composer.render();
  }

  animate();

  // Resize handler
  function onResize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener("resize", onResize);

  // Cleanup
  function dispose() {
    disposed = true;
    cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    controls.dispose();
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      }
    });
    composer.dispose();
    renderer.dispose();
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  }

  return {
    rotateBy,
    zoomBy,
    zoomIn: () => zoomBy(0.65),
    zoomOut: () => zoomBy(1.55),
    resetView,
    setStatus: (status) => {
      internalStatus = status || "IDLE";
    },
    dispose,
    setAudioEnergyGetter: (fn) => {
      getAudioEnergy = fn || (() => 0);
    },
  };
}
