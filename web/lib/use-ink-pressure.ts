"use client";
import { useEffect, useState } from "react";
import type Lenis from "lenis";
import { getLenis } from "@/lib/lenis";

export function useInkPressure(): number {
  const [pressure, setPressure] = useState(0);
  useEffect(() => {
    const lenis = getLenis();
    if (!lenis) return;
    const onScroll = (l: Lenis) => {
      const next = Math.min(1, Math.abs(l.velocity) / 8);
      setPressure(next);
      document.documentElement.style.setProperty("--ink-pressure", next.toFixed(3));
    };
    lenis.on("scroll", onScroll);
    return () => lenis.off("scroll", onScroll);
  }, []);
  return pressure;
}
