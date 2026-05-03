"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const WebGLStage = dynamic(() => import("@/components/canvas/webgl-stage"), {
  ssr: false,
});

export default function WebGLStageMount({ children }: { children?: ReactNode }) {
  return <WebGLStage>{children}</WebGLStage>;
}
