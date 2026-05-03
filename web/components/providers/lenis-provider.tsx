"use client";
import { useEffect, type ReactNode } from "react";
import { initLenis, destroyLenis } from "@/lib/lenis";

export function LenisProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initLenis();
    return () => destroyLenis();
  }, []);
  return <>{children}</>;
}
