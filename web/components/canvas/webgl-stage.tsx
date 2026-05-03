"use client";

import { Canvas } from "@react-three/fiber";
import { useEffect, useState, type ReactNode } from "react";

type Props = { children?: ReactNode };

export default function WebGLStage({ children }: Props) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
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
        dpr={[1, 1.5]}
        frameloop="demand"
      >
        {children}
      </Canvas>
    </div>
  );
}
