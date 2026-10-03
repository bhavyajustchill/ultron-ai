"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Center, Html, OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import { Box, Rotate3d } from "lucide-react";
import { useAdaStore } from "@/lib/store";
import { modelFileUrl } from "@/lib/mediaClient";
import { FloatingPanel } from "@/components/Media/FloatingPanel";

const initialPosition = () => ({
  x: Math.max(10, Math.round(window.innerWidth / 2 - 260)),
  y: 96,
});

/**
 * Catches model load / parse failures so a bad file shows an error instead of unmounting the HUD.
 */
class ModelErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center px-6">
          <span className="text-[11px] text-[#FF8095] font-semibold">MODEL FAILED TO LOAD</span>
          <span className="text-[10px] text-[#7E859E]">{String(this.state.error.message || this.state.error)}</span>
        </div>
      );
    }
    return this.props.children;
  }
}

function ModelScene({ url, onStats }) {
  const gltf = useGLTF(url);
  const groupRef = useRef(null);
  const { actions, names } = useAnimations(gltf.animations, groupRef);

  // Loop the first animation clip, if the model has any
  useEffect(() => {
    if (names[0]) actions[names[0]]?.reset().play();
  }, [actions, names]);

  useEffect(() => {
    let meshes = 0;
    let triangles = 0;
    const materials = new Set();
    gltf.scene.traverse((object) => {
      if (!object.isMesh) return;
      meshes++;
      const geometry = object.geometry;
      triangles += geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count || 0) / 3;
      (Array.isArray(object.material) ? object.material : [object.material]).forEach((m) => materials.add(m));
    });
    onStats({ meshes, triangles: Math.round(triangles), materials: materials.size, animations: gltf.animations.length });
  }, [gltf, onStats]);

  return (
    <group ref={groupRef}>
      <primitive object={gltf.scene} />
    </group>
  );
}

/**
 * Built-in glTF / GLB viewer (Phase 7.5): its own R3F canvas with auto-framing, orbit
 * controls, animation playback, and model statistics. Opened by the `view_3d_model`
 * voice tool or by uploading a .glb / .gltf file.
 */
export function ModelViewerPanel() {
  const { isOpen, path, name, nonce } = useAdaStore((state) => state.modelViewer);
  const setModelViewer = useAdaStore((state) => state.setModelViewer);
  const [stats, setStats] = useState(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const handleStats = useCallback((next) => setStats(next), []);

  useEffect(() => {
    setStats(null);
  }, [path, nonce]);

  if (!isOpen || !path) return null;

  const url = `${modelFileUrl(path)}?v=${nonce}`;

  return (
    <FloatingPanel
      title="HOLO-VIEWER // 3D MODEL"
      subtitle={name}
      icon={Box}
      widthClass="w-[520px]"
      initialPosition={initialPosition}
      onClose={() => setModelViewer({ isOpen: false })}
      headerActions={
        <button
          onClick={() => setAutoRotate((value) => !value)}
          className={`p-1.5 chamfer-btn border transition-all cursor-pointer ${autoRotate
            ? "border-[rgba(0,229,255,0.4)] bg-[rgba(0,229,255,0.12)] text-[#00E5FF]"
            : "border-transparent text-[#7E859E] hover:text-[#00E5FF]"}`}
          title={autoRotate ? "Stop auto-rotate" : "Auto-rotate"}>
          <Rotate3d className="w-3.5 h-3.5" />
        </button>
      }>
      <div className="relative w-full h-[340px] chamfer-md overflow-hidden border border-[rgba(0,229,255,0.2)] bg-[radial-gradient(ellipse_at_center,rgba(0,229,255,0.08),rgba(1,14,22,0.95))]">
        <ModelErrorBoundary resetKey={url}>
          <Canvas camera={{ position: [3, 2, 3], fov: 45 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[4, 6, 4]} intensity={1.6} />
            <directionalLight position={[-4, 2, -3]} intensity={0.9} color="#00E5FF" />
            <gridHelper args={[12, 24, "#00E5FF", "#0b3a46"]} />
            <Suspense
              fallback={
                <Html center>
                  <span className="font-mono text-[10px] tracking-widest text-[#00E5FF] whitespace-nowrap">LOADING MODEL…</span>
                </Html>
              }>
              <Bounds fit clip observe margin={1.25}>
                <Center top>
                  <ModelScene url={url} onStats={handleStats} />
                </Center>
              </Bounds>
            </Suspense>
            <OrbitControls makeDefault autoRotate={autoRotate} autoRotateSpeed={1.2} />
          </Canvas>
        </ModelErrorBoundary>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          ["MESHES", stats?.meshes],
          ["TRIANGLES", stats?.triangles?.toLocaleString()],
          ["MATERIALS", stats?.materials],
          ["ANIMATIONS", stats?.animations],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col py-1.5 chamfer-xs border border-[rgba(0,229,255,0.15)] bg-[rgba(0,229,255,0.04)]">
            <span className="text-[9px] tracking-wider text-[#7E859E]">{label}</span>
            <span className="text-xs text-[#00E5FF] font-semibold">{value ?? "—"}</span>
          </div>
        ))}
      </div>
      <span className="text-[9px] text-[#7E859E] truncate" title={path}>{path}</span>
    </FloatingPanel>
  );
}

export default ModelViewerPanel;
