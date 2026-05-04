"use client";
import { useEffect, type ReactNode } from "react";
import { initLenis, destroyLenis } from "@/lib/lenis";
import { useInkPressure } from "@/lib/use-ink-pressure";

export function LenisProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Lenis hijacks scroll with rAF interpolation. It's a chrome-layer
    // nicety — native scroll is already fluent — so we defer the init
    // past LCP. On mobile (<=1100px) we skip it entirely; native
    // touch-scrolling is what users expect, and Lenis's listeners
    // contributed ~70 ms to the simulated mobile TBT.
    if (typeof window === "undefined") return;
    if (!matchMedia("(min-width: 1101px)").matches) return;

    let cancelled = false;
    let cancelHandle: number | null = null;
    type IdleCb = (cb: () => void, opts?: { timeout?: number }) => number;
    const ric = (window as unknown as { requestIdleCallback?: IdleCb })
      .requestIdleCallback;
    const start = () => {
      if (!cancelled) initLenis();
    };
    if (typeof ric === "function") {
      cancelHandle = ric(start, { timeout: 1500 });
    } else {
      cancelHandle = window.setTimeout(start, 250);
    }
    return () => {
      cancelled = true;
      if (cancelHandle != null) {
        const cancel = (window as unknown as {
          cancelIdleCallback?: (id: number) => void;
        }).cancelIdleCallback;
        if (typeof cancel === "function") {
          cancel(cancelHandle);
        } else {
          clearTimeout(cancelHandle);
        }
      }
      destroyLenis();
    };
  }, []);
  useInkPressure();
  return <>{children}</>;
}
