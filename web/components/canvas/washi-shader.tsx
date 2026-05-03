"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { WASHI_FRAG } from "./washi.frag.glsl";

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export function WashiShader() {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { size, mouse } = useThree();
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPressure: { value: 0 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
    }),
    [size.width, size.height],
  );

  useFrame((_, dt) => {
    if (!matRef.current) return;
    matRef.current.uniforms.uTime.value += dt;
    const cssVar =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--ink-pressure"),
      ) || 0;
    matRef.current.uniforms.uPressure.value +=
      (cssVar - matRef.current.uniforms.uPressure.value) * 0.08;
    matRef.current.uniforms.uMouse.value.set(
      (mouse.x * 0.5 + 0.5) * size.width,
      (1 - (mouse.y * 0.5 + 0.5)) * size.height,
    );
    matRef.current.uniforms.uResolution.value.set(size.width, size.height);
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={matRef}
        fragmentShader={WASHI_FRAG}
        vertexShader={VERT}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
      />
    </mesh>
  );
}
