"use client";

import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useEffect, useState, type ReactNode } from "react";
import { WashiShader } from "@/components/canvas/washi-shader";

type Props = { children?: ReactNode };

export default function WebGLStage({ children }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [maxDpr, setMaxDpr] = useState(1.5);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if ((navigator.hardwareConcurrency ?? 8) < 6) setMaxDpr(1.25);
  }, []);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    >
      <Canvas
        gl={{ antialias: false, powerPreference: "high-performance" }}
        dpr={[1, maxDpr]}
        frameloop="always"
      >
        <WashiShader />
        {children}
        <EffectComposer multisampling={0}>
          <Bloom
            intensity={0.16}
            luminanceThreshold={0.6}
            luminanceSmoothing={0.18}
            mipmapBlur
          />
          <Noise opacity={0.025} blendFunction={BlendFunction.OVERLAY} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
