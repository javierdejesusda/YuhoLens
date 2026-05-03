"use client";

import dynamic from "next/dynamic";

const WebGLStage = dynamic(() => import("@/components/canvas/webgl-stage"), {
  ssr: false,
});

export function WebGLStageMount() {
  return <WebGLStage />;
}
