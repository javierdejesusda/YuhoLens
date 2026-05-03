"use client";
import { useEffect, type ReactNode } from "react";
import { initLenis, destroyLenis } from "@/lib/lenis";
import { useInkPressure } from "@/lib/use-ink-pressure";

export function LenisProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initLenis();
    return () => destroyLenis();
  }, []);
  useInkPressure();
  return <>{children}</>;
}
