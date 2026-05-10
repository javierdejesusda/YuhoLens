"use client";
import { useEffect, useRef } from "react";
import { useScrollState } from "@/lib/use-scroll-state";
import { SECTIONS } from "@/lib/sections";

export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const { progress } = useScrollState();

  useEffect(() => {
    if (ref.current) {
      ref.current.style.setProperty("--p", progress * 100 + "%");
    }
    if (railRef.current) {
      const op = Math.min(1, 0.18 + progress * 0.82);
      railRef.current.style.setProperty("--rail-opacity", op.toFixed(3));
      railRef.current.style.setProperty("--rail-progress", progress.toFixed(4));
    }
  }, [progress]);

  return (
    <>
      <div id="progress" ref={ref} aria-hidden="true" />
      <div className="ledger-binding-rail" ref={railRef} aria-hidden="true">
        {SECTIONS.map((stage, i) => (
          <span
            key={stage.id}
            className="ledger-binding-rail__tick"
            style={{ top: `${(i / (SECTIONS.length - 1)) * 100}%` }}
            data-stage={stage.id}
          />
        ))}
      </div>
    </>
  );
}
