"use client";
import { useEffect, useRef, useState } from "react";
import { DUR_BASE_MS } from "@/lib/motion";

type NumberRollProps = {
  to: number;
  decimals?: number;
  durationMs?: number;
  className?: string;
};

// Cheap RAF easing that mirrors `EASE_OUT` ([0.16,1,0.3,1]) closely
// enough for a number roll-up — the visual difference at ~800ms is
// imperceptible against the bezier curve.
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const fmt = (n: number, decimals: number) =>
  decimals > 0 ? n.toFixed(decimals) : Math.round(n).toString();

export function NumberRoll({
  to,
  decimals = 0,
  durationMs = DUR_BASE_MS + 200,
  className,
}: NumberRollProps) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === "undefined") {
      setValue(to);
      return;
    }
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(to);
      ranRef.current = true;
      return;
    }

    let raf = 0;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !ranRef.current) {
            ranRef.current = true;
            const start = performance.now();
            const tick = (now: number) => {
              const t = Math.min(1, (now - start) / durationMs);
              setValue(easeOutCubic(t) * to);
              if (t < 1) raf = requestAnimationFrame(tick);
              else setValue(to);
            };
            raf = requestAnimationFrame(tick);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, durationMs]);

  return (
    <span ref={ref} className={className}>
      {fmt(value, decimals)}
    </span>
  );
}
