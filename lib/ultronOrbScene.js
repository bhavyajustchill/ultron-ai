import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const HOME_POSITION = new THREE.Vector3(0, 0.725, 7.975);
const MIN_DISTANCE = 0.6;
const MAX_DISTANCE = 40;

/**
 * Creates and initializes the holographic Ultron Orb Three.js scene
 * faithfully matching the visual architecture of docs/ultron_ref.png:
 * - Radiant golden sun core (radius 0.35) with warm fiery flare and corona
 * - 72 3D radial laser needle rays (starburst spikes) radiating in all directions
 * - Dual-concentric glowing triangulated geodesic wireframe cages
 * - Glowing warm amber curved ribbon arcs sweeping across orbital planes
 * - Thin elliptical trajectory rings
 * - Sparkling cosmic stardust particle belt
 * - Tuned bloom radiance providing warm holographic energy without blowout
 * - Full multi-state animation & real-time voice acoustic expansion
 * - Zero heap object allocations in the animate() render loop
 *
 * @param {HTMLElement} container The DOM element mounting the WebGL canvas.
 * @param {Object} [options]
 * @param {() => number} [options.getAudioEnergy] Callback returning normalized audio energy [0..1].
 * @param {() => string} [options.getStatus] Callback returning active system status.
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
  renderer.setClearColor(0x000000, 1.0); // Pitch black — pure void
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // ——— POST PROCESSING ———
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  // Balanced UnrealBloomPass: warm, radiant sci-fi glow matching ultron_ref.png
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.45, // strength — reduced so idle is dim, speaking is more vivid
    0.35, // radius
    0.55  // threshold — higher threshold keeps the core subtle and dim at rest
  );
  composer.addPass(bloom);

  // Stark Gold chromatic aberration & micro-flicker pass
  const chromaticShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uIntensity: { value: 0.0020 },
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
        float flicker = 1.0 + 0.012 * sin(uTime * 24.0) * sin(uTime * 8.3);
        vec4 col = texture2D(tDiffuse, vUv);
        gl_FragColor = vec4(col.rgb * flicker, 1.0);
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

  // ——— COLOR PALETTE (Stark Gold Theme #FFB800, Zero Red) ———
  const C_SOLAR_CORE = 0xffff33;   // blinding lemon yellow
  const C_CORONA_HOT = 0xffaa00;   // Warm golden flare
  const C_CORONA_OUTER = 0xff9900; // Deep golden amber corona
  const C_GEO_OUTER = 0xffb800;    // Glowing Stark Gold outer cage
  const C_GEO_INNER = 0xffaa00;    // Glowing Stark Gold inner cage
  const C_RIBBON = 0xffb800;       // Stark Gold (#FFB800) matching main theme color
  const C_ORBIT_LINE = 0xffaa00;   // Bright golden trajectory rings

  // Root group
  const orbGroup = new THREE.Group();
  scene.add(orbGroup);

  // ═══════════════════════════════════════════════════════════════
  // 1. CENTRAL RADIANT SOLAR CORE & EMISSIVE CORONA (Solid Sphere + Dynamic Speech Emission)
  // ═══════════════════════════════════════════════════════════════
  // Solid, spherical center core (radius = 0.36, completely opaque, sharp spherical outline)
  const coreGeo = new THREE.SphereGeometry(0.36, 64, 64);
  const coreMat = new THREE.MeshBasicMaterial({
    color: C_SOLAR_CORE,
    transparent: false, // Solid and opaque matching ultron_ref.png
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.renderOrder = 2;
  orbGroup.add(coreMesh);

  // Warm radiant flare (radius = 0.26) - Emits light only when speaking
  const flareGeo = new THREE.SphereGeometry(0.26, 32, 32);
  const flareMat = new THREE.MeshBasicMaterial({
    color: C_CORONA_HOT,
    transparent: true,
    opacity: 0.0, // 0.0 when IDLE - does not emit light unless speaking!
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flareMesh = new THREE.Mesh(flareGeo, flareMat);
  flareMesh.renderOrder = 1;
  orbGroup.add(flareMesh);

  // Atmospheric outer corona (radius = 0.38) - Emits light only when speaking
  const coronaGeo = new THREE.SphereGeometry(0.38, 32, 32);
  const coronaMat = new THREE.MeshBasicMaterial({
    color: C_CORONA_OUTER,
    transparent: true,
    opacity: 0.0, // 0.0 when IDLE - does not emit light unless speaking!
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const coronaMesh = new THREE.Mesh(coronaGeo, coronaMat);
  coronaMesh.renderOrder = 1;
  orbGroup.add(coronaMesh);

  // ═══════════════════════════════════════════════════════════════
  // 2. 72 RADIAL 3D LASER NEEDLE RAYS (STARBURST SPIKES)
  // ═══════════════════════════════════════════════════════════════
  const rayCount = 72;
  const rayPositions = [];
  const rayColors = [];

  for (let i = 0; i < rayCount; i++) {
    // Fibonacci sphere distribution for quasi-uniform 3D distribution
    const y = 1 - (i / (rayCount - 1)) * 2;
    const radiusAtY = Math.sqrt(Math.max(0, 1 - y * y));
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const theta = goldenAngle * i;

    // Subtle organic jitter
    const jitterX = Math.sin(i * 3.7) * 0.06;
    const jitterZ = Math.cos(i * 2.3) * 0.06;

    let dx = radiusAtY * Math.cos(theta) + jitterX;
    let dy = y;
    let dz = radiusAtY * Math.sin(theta) + jitterZ;
    const norm = Math.hypot(dx, dy, dz) || 1;
    dx /= norm;
    dy /= norm;
    dz /= norm;

    // Varied lengths: prominent long spikes extending past the outer cage, medium, and short
    let rayLen;
    if (i % 4 === 0) {
      rayLen = 3.0 + (Math.sin(i * 5.1) * 0.5 + 0.5) * 0.65; // ~3.0 to 3.65 (very long spikes)
    } else if (i % 2 === 0) {
      rayLen = 2.25 + (Math.cos(i * 4.3) * 0.5 + 0.5) * 0.55; // ~2.25 to 2.80
    } else {
      rayLen = 1.75 + (Math.sin(i * 1.9) * 0.5 + 0.5) * 0.40; // ~1.75 to 2.15
    }

    // Origin vertex starts cleanly on the outer surface of the solid sphere
    rayPositions.push(dx * 0.245, dy * 0.245, dz * 0.245);
    rayColors.push(1.0, 0.88, 0.22); // Warm bright gold at sphere surface

    // Outer tip vertex
    rayPositions.push(dx * rayLen, dy * rayLen, dz * rayLen);
    rayColors.push(1.0, 0.72, 0.0);  // Pure Stark Gold #FFB800 tip (zero red)
  }

  const rayGeo = new THREE.BufferGeometry();
  rayGeo.setAttribute("position", new THREE.Float32BufferAttribute(rayPositions, 3));
  rayGeo.setAttribute("color", new THREE.Float32BufferAttribute(rayColors, 3));

  const rayMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const rayLines = new THREE.LineSegments(rayGeo, rayMat);
  const rayGroup = new THREE.Group();
  rayGroup.add(rayLines);
  orbGroup.add(rayGroup);

  // Pre-allocate ray animation data (zero-GC inside animate loop)
  // Each ray stores: direction (dx,dy,dz), base tip length, random phase & frequency
  const rayDirs = new Float32Array(rayCount * 3);      // unit direction per ray
  const rayBaseLens = new Float32Array(rayCount);      // base tip distance per ray
  const rayPhases = new Float32Array(rayCount);        // random phase offset per ray
  const rayFreqs = new Float32Array(rayCount);         // random oscillation freq per ray
  const rayPosAttr = rayGeo.attributes.position;       // direct buffer reference

  for (let i = 0; i < rayCount; i++) {
    // Reconstruct direction from origin vertex (vertex 2i, floats at i*6)
    const ox = rayPosAttr.getX(i * 2);
    const oy = rayPosAttr.getY(i * 2);
    const oz = rayPosAttr.getZ(i * 2);
    const originLen = Math.hypot(ox, oy, oz) || 1;
    rayDirs[i * 3] = ox / originLen;
    rayDirs[i * 3 + 1] = oy / originLen;
    rayDirs[i * 3 + 2] = oz / originLen;
    // Base tip length from tip vertex (vertex 2i+1)
    const tx = rayPosAttr.getX(i * 2 + 1);
    const ty = rayPosAttr.getY(i * 2 + 1);
    const tz = rayPosAttr.getZ(i * 2 + 1);
    rayBaseLens[i] = Math.hypot(tx, ty, tz);
    // Randomized oscillation parameters per ray
    rayPhases[i] = Math.random() * Math.PI * 2;
    rayFreqs[i] = 4.0 + Math.random() * 10.0; // 4-14 Hz pulse rate per spike
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. DUAL-CONCENTRIC TRIANGULATED GEODESIC WIREFRAME CAGES
  // ═══════════════════════════════════════════════════════════════
  // Outer Geodesic Sphere (Radius = 1.92, Detail = 3)
  const outerIcoGeo = new THREE.IcosahedronGeometry(1.92, 3);
  const outerIcoEdges = new THREE.EdgesGeometry(outerIcoGeo);
  const outerIcoMat = new THREE.LineBasicMaterial({
    color: C_GEO_OUTER,
    transparent: true,
    opacity: 0.80,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const outerGeodesic = new THREE.LineSegments(outerIcoEdges, outerIcoMat);
  orbGroup.add(outerGeodesic);

  // Inner Concentric Geodesic Sphere (Radius = 1.38, Detail = 2)
  const innerIcoGeo = new THREE.IcosahedronGeometry(1.38, 2);
  const innerIcoEdges = new THREE.EdgesGeometry(innerIcoGeo);
  const innerIcoMat = new THREE.LineBasicMaterial({
    color: C_GEO_INNER,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const innerGeodesic = new THREE.LineSegments(innerIcoEdges, innerIcoMat);
  orbGroup.add(innerGeodesic);

  // ═══════════════════════════════════════════════════════════════
  // 4. TRANSLUCENT GLOWING CURVED RIBBON ARCS (As seen in ultron_ref.png)
  // ═══════════════════════════════════════════════════════════════
  const ribbonGroup = new THREE.Group();
  orbGroup.add(ribbonGroup);

  // Luminous warm amber ribbon material matching ultron_ref.png
  const ribbonMat = new THREE.MeshBasicMaterial({
    color: C_RIBBON,
    transparent: true,
    opacity: 0.46,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // Ribbon Arc 1: Top-Left Prominent Sweep
  const arcGeo1 = new THREE.RingGeometry(2.05, 2.28, 64, 1, 0.5, 2.1);
  const ribbon1 = new THREE.Mesh(arcGeo1, ribbonMat);
  ribbon1.rotation.set(-0.45, 0.35, 0.72);
  ribbonGroup.add(ribbon1);

  // Ribbon Arc 2: Lower-Right Sweep (prominently seen curling in ultron_ref.png)
  const arcGeo2 = new THREE.RingGeometry(1.98, 2.22, 64, 1, 3.2, 2.0);
  const ribbon2 = new THREE.Mesh(arcGeo2, ribbonMat);
  ribbon2.rotation.set(0.62, -0.42, -0.28);
  ribbonGroup.add(ribbon2);

  // Ribbon Arc 3: Inclined Lateral Shield Arc
  const arcGeo3 = new THREE.RingGeometry(2.12, 2.34, 64, 1, 1.7, 1.8);
  const ribbon3 = new THREE.Mesh(arcGeo3, ribbonMat);
  ribbon3.rotation.set(0.25, 0.85, -0.45);
  ribbonGroup.add(ribbon3);

  // Ribbon Arc 4: Subtle Lower Accent Arc
  const arcGeo4 = new THREE.RingGeometry(1.92, 2.14, 64, 1, 4.7, 1.5);
  const ribbon4 = new THREE.Mesh(arcGeo4, ribbonMat);
  ribbon4.rotation.set(-0.15, -0.65, 0.38);
  ribbonGroup.add(ribbon4);

  // ═══════════════════════════════════════════════════════════════
  // 5. THIN TILTED ELLIPTICAL TRAJECTORY RINGS WITH FLOATING PARTICLES
  // ═══════════════════════════════════════════════════════════════
  const orbitRingsGroup = new THREE.Group();
  orbGroup.add(orbitRingsGroup);

  // High-resolution circular radial canvas sprite texture with bright golden core
  const pCanvas = document.createElement("canvas");
  pCanvas.width = pCanvas.height = 64;
  const pCtx = pCanvas.getContext("2d");
  if (pCtx) {
    const grad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255, 240, 160, 1.0)");
    grad.addColorStop(0.25, "rgba(255, 184, 0, 0.88)"); // Stark Gold #FFB800
    grad.addColorStop(0.65, "rgba(204, 136, 0, 0.35)"); // Deep Gold #CC8800
    grad.addColorStop(1.0, "rgba(80, 50, 0, 0.0)");     // Transparent gold (zero red)
    pCtx.fillStyle = grad;
    pCtx.fillRect(0, 0, 64, 64);
  }
  const pTexture = new THREE.CanvasTexture(pCanvas);

  function createOrbitRing(radius, tiltEuler, opacity = 0.6, particleCount = 350) {
    const ringContainer = new THREE.Group();

    // 1. Thin wireframe trajectory line
    const pts = [];
    const segs = 140;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(new THREE.Vector3(radius * Math.cos(a), 0, radius * Math.sin(a)));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: C_ORBIT_LINE,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ringContainer.add(line);

    // 2. Floating golden stardust particles surrounding and tracing the ring line (matching stardust palette & size)
    const ringPPositions = new Float32Array(particleCount * 3);
    const ringPColors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Clustered around ring line: tight core halo with soft outer float
      const isCore = Math.random() < 0.70;
      const rOffset = isCore
        ? (Math.random() - 0.5) * 0.12
        : (Math.random() - 0.5) * 0.28;
      const r = radius + rOffset;
      const yOffset = isCore
        ? (Math.random() - 0.5) * 0.10
        : (Math.random() - 0.5) * 0.22;

      ringPPositions[i * 3] = r * Math.cos(angle);
      ringPPositions[i * 3 + 1] = yOffset;
      ringPPositions[i * 3 + 2] = r * Math.sin(angle);

      // Same warm golden stardust palette as main cosmic belts (no bright white glare)
      const tC = Math.random();
      ringPColors[i * 3] = 1.0;
      ringPColors[i * 3 + 1] = 0.78 + tC * 0.22;
      ringPColors[i * 3 + 2] = 0.08 + tC * 0.25;
    }

    const ringPGeo = new THREE.BufferGeometry();
    ringPGeo.setAttribute("position", new THREE.Float32BufferAttribute(ringPPositions, 3));
    ringPGeo.setAttribute("color", new THREE.Float32BufferAttribute(ringPColors, 3));

    const ringPMat = new THREE.PointsMaterial({
      map: pTexture,
      size: 0.055, // Identical size to main stardust motes (no oversized glare)
      vertexColors: true,
      transparent: true,
      opacity: 0.85, // Same gentle opacity as main stardust
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const ringParticles = new THREE.Points(ringPGeo, ringPMat);
    ringParticles.frustumCulled = false;
    ringContainer.add(ringParticles);

    ringContainer.rotation.set(tiltEuler.x, tiltEuler.y, tiltEuler.z);
    ringContainer.ringParticles = ringParticles;
    ringContainer.line = line;
    return ringContainer;
  }

  const ring1 = createOrbitRing(2.45, new THREE.Euler(0.72, 0.25, 0.48), 0.62, 350);
  const ring2 = createOrbitRing(2.28, new THREE.Euler(-0.55, 0.65, -0.38), 0.52, 320);
  const ring3 = createOrbitRing(2.62, new THREE.Euler(0.18, -0.78, 0.92), 0.45, 380);
  orbitRingsGroup.add(ring1, ring2, ring3);

  // ═══════════════════════════════════════════════════════════════
  // 6. COSMIC STARDUST PARTICLE BELTS (Dense Glowing Orbital Stream, +20% All Around: 3,840 Total)
  // ═══════════════════════════════════════════════════════════════
  const particleGroup = new THREE.Group();
  orbGroup.add(particleGroup);

  const totalParticles = 3840; // Scaled by +20% from 3,200
  const pPositions = new Float32Array(totalParticles * 3);
  const pColors = new Float32Array(totalParticles * 3);

  // Primary dense glowing crescent/belt cluster (2,400 particles, +20% from 2,000)
  for (let i = 0; i < 2400; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 1.48 + Math.pow(Math.random(), 1.2) * 1.15; // 1.48 to 2.63
    const bandSpread = (Math.random() - 0.5) * 0.30;

    const u = dist * Math.cos(angle);
    const v = bandSpread;
    const w = dist * Math.sin(angle);

    // Apply 3D orbital inclination tilt (-35 deg X, 25 deg Z) matching ultron_ref.png
    const cosX = 0.819;
    const sinX = -0.573;
    const cosZ = 0.906;
    const sinZ = 0.422;

    const y1 = v * cosX - w * sinX;
    const z1 = v * sinX + w * cosX;
    const x2 = u * cosZ - y1 * sinZ;
    const y2 = u * sinZ + y1 * cosZ;

    pPositions[i * 3] = x2;
    pPositions[i * 3 + 1] = y2;
    pPositions[i * 3 + 2] = z1;

    // Glowing golden stardust gradient
    const tC = Math.random();
    pColors[i * 3] = 1.0;
    pColors[i * 3 + 1] = 0.78 + tC * 0.22;
    pColors[i * 3 + 2] = 0.08 + tC * 0.25;
  }

  // Secondary counter-tilted belt cluster (960 particles, +20% from 800)
  for (let i = 2400; i < 3360; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 1.25 + Math.pow(Math.random(), 1.3) * 1.35;
    const bandSpread = (Math.random() - 0.5) * 0.35;

    const u = dist * Math.cos(angle);
    const v = bandSpread;
    const w = dist * Math.sin(angle);

    // 45 deg X, -40 deg Z
    const cosX = 0.707;
    const sinX = 0.707;
    const cosZ = 0.766;
    const sinZ = -0.642;

    const y1 = v * cosX - w * sinX;
    const z1 = v * sinX + w * cosX;
    const x2 = u * cosZ - y1 * sinZ;
    const y2 = u * sinZ + y1 * cosZ;

    pPositions[i * 3] = x2;
    pPositions[i * 3 + 1] = y2;
    pPositions[i * 3 + 2] = z1;

    const tC = Math.random();
    pColors[i * 3] = 1.0;
    pColors[i * 3 + 1] = 0.75 + tC * 0.25; // Warm Stark Gold (zero red)
    pColors[i * 3 + 2] = 0.05 + tC * 0.20;
  }

  // Ambient perimeter motes (480 particles, +20% from 400)
  for (let i = 3360; i < totalParticles; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 0.9 + Math.pow(Math.random(), 0.7) * 3.2;

    pPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pPositions[i * 3 + 1] = r * Math.cos(phi);
    pPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    pColors[i * 3] = 1.0;
    pColors[i * 3 + 1] = 0.7 + Math.random() * 0.3;
    pColors[i * 3 + 2] = 0.1 + Math.random() * 0.2;
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.Float32BufferAttribute(pPositions, 3));
  particleGeo.setAttribute("color", new THREE.Float32BufferAttribute(pColors, 3));



  const particleMat = new THREE.PointsMaterial({
    map: pTexture,
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.90,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

  const particlePoints = new THREE.Points(particleGeo, particleMat);
  particleGroup.add(particlePoints);

  // ═══════════════════════════════════════════════════════════════
  // 7. PROGRAMMATIC CAMERA CONTROLS
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  // 8. MULTI-STATE DYNAMIC INTERPOLATION ENGINE & AUDIO LOOP
  // ═══════════════════════════════════════════════════════════════
  const clock = new THREE.Clock();
  let rafId = 0;
  let disposed = false;

  let stateIdleWeight = 1.0;
  let stateThinkingWeight = 0.0;
  let stateSpeakingWeight = 0.0;

  let currentRotMult = 1.0;

  function animate() {
    if (disposed) return;
    rafId = requestAnimationFrame(animate);

    const delta = Math.min(0.08, clock.getDelta());
    const t = clock.getElapsedTime();

    // Sample real-time audio energy and active cognitive status
    const audioEnergy = Math.min(1.0, Math.max(0, getAudioEnergy() || 0));
    const audioBoost = audioEnergy * 1.6;
    const rawStatus = (typeof getStatus === "function" ? getStatus() : internalStatus) || "IDLE";

    // Target state arbitration
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

    // Dynamic speech and thinking movement boost
    // In idle: ultra-slow, calm, graceful planetary drift (0.16x baseline)
    // When talking/thinking: accelerates dynamically in opposing 3D vector directions
    const idleBaseSpin = 0.16;
    const speechSpin = stateSpeakingWeight * (2.8 + audioBoost * 4.5);
    const thinkSpin = stateThinkingWeight * 1.8;
    const activeSpin = idleBaseSpin + speechSpin + thinkSpin;

    // 1. Radial Laser Needle Rays: tumble along 3D vector (+X, -Y, +Z)
    rayGroup.rotation.x += delta * 0.18 * activeSpin;
    rayGroup.rotation.y -= delta * 0.32 * activeSpin;
    rayGroup.rotation.z += delta * 0.22 * activeSpin;

    // 2. Orbital Ribbon Arcs: rotate along opposing 3D vector (-X, +Y, -Z)
    ribbonGroup.rotation.x -= delta * 0.24 * activeSpin;
    ribbonGroup.rotation.y += delta * 0.28 * activeSpin;
    ribbonGroup.rotation.z -= delta * 0.35 * activeSpin;

    // Individual ribbon arcs rotate along their local planes in alternating directions
    ribbon1.rotation.z += delta * 0.40 * activeSpin;
    ribbon2.rotation.z -= delta * 0.45 * activeSpin;
    ribbon3.rotation.z += delta * 0.35 * activeSpin;
    ribbon4.rotation.z -= delta * 0.40 * activeSpin;

    // 3. Orbital Trajectory Rings: rotate along independent 3D vector (+X, +Y, -Z)
    orbitRingsGroup.rotation.x += delta * 0.20 * activeSpin;
    orbitRingsGroup.rotation.y += delta * 0.25 * activeSpin;
    orbitRingsGroup.rotation.z -= delta * 0.18 * activeSpin;

    // Individual trajectory rings tumble along their tilted orbital planes
    ring1.rotation.z += delta * 0.30 * activeSpin;
    ring2.rotation.z -= delta * 0.35 * activeSpin;
    ring3.rotation.z += delta * 0.28 * activeSpin;

    // Floating particles drift organically around each ring as they follow them
    if (ring1.ringParticles) ring1.ringParticles.rotation.y += delta * 0.12 * activeSpin;
    if (ring2.ringParticles) ring2.ringParticles.rotation.y -= delta * 0.14 * activeSpin;
    if (ring3.ringParticles) ring3.ringParticles.rotation.y += delta * 0.10 * activeSpin;

    // 4. Cosmic Stardust Particle Belts: rotate along distinct 3D vector (-X, -Y, +Z)
    particleGroup.rotation.x -= delta * 0.16 * activeSpin;
    particleGroup.rotation.y -= delta * 0.22 * activeSpin;
    particleGroup.rotation.z += delta * 0.28 * activeSpin;

    // 5. Geodesic Cages: counter-rotate on independent 3D axes
    outerGeodesic.rotation.y += delta * 0.15 * activeSpin;
    outerGeodesic.rotation.x += delta * 0.08 * activeSpin;
    innerGeodesic.rotation.y -= delta * 0.20 * activeSpin;
    innerGeodesic.rotation.z -= delta * 0.12 * activeSpin;

    // 6. Central Solid Sun Core: delicate breathing when idle, radiant shine ONLY when talking
    const idleBreath = Math.sin(t * 1.6) * 0.02;
    const thinkingVibe = Math.sin(t * 14.0) * 0.03;
    const coreScale = 1.0 + stateIdleWeight * idleBreath + stateThinkingWeight * thinkingVibe;

    // Central core speech shine: ONLY the central core shines when talking
    const speechShine = stateSpeakingWeight * (0.85 + audioBoost * 0.45);
    flareMat.opacity = Math.min(0.95, Math.max(0, speechShine));
    coronaMat.opacity = Math.min(0.70, Math.max(0, speechShine * 0.65));

    // Dynamic acoustic pulse strictly focused on the central core flare & corona
    const corePulse = 1.0 + stateSpeakingWeight * (0.04 + audioBoost * 0.12);
    coreMesh.scale.setScalar(Math.max(0.90, coreScale * corePulse));
    flareMesh.scale.setScalar(1.0 + stateSpeakingWeight * (0.06 + audioBoost * 0.22));
    coronaMesh.scale.setScalar(1.0 + stateSpeakingWeight * (0.08 + audioBoost * 0.30));

    // Outer elements stay crisp, steady, and do NOT flare/shine when talking
    rayGroup.scale.setScalar(1.0);
    rayMat.opacity = 0.90;
    ribbonMat.opacity = 0.46;
    outerIcoMat.opacity = 0.80;
    innerIcoMat.opacity = 0.55;

    // ── PER-RAY NEEDLE GROW / SHRINK (Speaking mode, zero GC) ──────────
    // Each of the 72 spikes pulses independently at its own random frequency
    // and phase, driven by stateSpeakingWeight * audioBoost.
    // At idle the buffer stays at base lengths (scale = 1.0 → no mutation needed).
    if (stateSpeakingWeight > 0.01) {
      for (let i = 0; i < rayCount; i++) {
        // Per-ray oscillation: amplitude ramps with voice energy
        const amp = stateSpeakingWeight * (0.35 + audioBoost * 0.55);
        const osc = Math.sin(t * rayFreqs[i] + rayPhases[i]);
        const scale = 1.0 + amp * osc;           // 0.65 … 1.9 range at full amp
        const tipLen = rayBaseLens[i] * scale;
        const ix = i * 3;
        // Write tip vertex (vertex 2i+1) directly into the position buffer
        rayPosAttr.setXYZ(
          i * 2 + 1,
          rayDirs[ix] * tipLen,
          rayDirs[ix + 1] * tipLen,
          rayDirs[ix + 2] * tipLen
        );
      }
      rayPosAttr.needsUpdate = true;
    }

    // Bloom: dim at idle (ball-like), more vivid only when speaking
    const idleBloom = 0.2 + Math.sin(t * 0.8) * 0.02;  // Very subtle dim glow at rest
    const thinkingBloom = 0.3 + Math.sin(t * 6.0) * 0.05;
    const speakingBloom = 0.4 + audioBoost * 0.28; // Core-focused radiant shine when talking

    bloom.strength =
      stateIdleWeight * idleBloom +
      stateThinkingWeight * thinkingBloom +
      stateSpeakingWeight * speakingBloom;

    // Chromatic pass update
    chromaticPass.uniforms.uTime.value = t;
    chromaticPass.uniforms.uIntensity.value =
      0.0020 + stateThinkingWeight * 0.0015;

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
    renderer.dispose();
    composer.dispose();

    coreGeo.dispose();
    coreMat.dispose();
    flareGeo.dispose();
    flareMat.dispose();
    coronaGeo.dispose();
    coronaMat.dispose();

    rayGeo.dispose();
    rayMat.dispose();

    outerIcoGeo.dispose();
    outerIcoEdges.dispose();
    outerIcoMat.dispose();

    innerIcoGeo.dispose();
    innerIcoEdges.dispose();
    innerIcoMat.dispose();

    arcGeo1.dispose();
    arcGeo2.dispose();
    arcGeo3.dispose();
    arcGeo4.dispose();
    ribbonMat.dispose();

    particleGeo.dispose();
    particleMat.dispose();
    pTexture.dispose();

    if (container.contains(renderer.domElement)) {
      container.removeChild(renderer.domElement);
    }
  }

  return {
    rotateBy,
    zoomBy,
    zoomIn: () => zoomBy(0.8),
    zoomOut: () => zoomBy(1.25),
    resetView,
    setStatus: (s) => {
      internalStatus = s;
    },
    dispose,
    setAudioEnergyGetter: (fn) => {
      getAudioEnergy = fn;
    },
  };
}
