import Lenis from "lenis";

let lenisInstance: Lenis | null = null;

export function getLenis(): Lenis | null {
  return lenisInstance;
}

export function initLenis(): Lenis | null {
  if (typeof window === "undefined") return null;
  if (lenisInstance) return lenisInstance;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
  lenisInstance = new Lenis({
    duration: 1.1,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    syncTouch: false,
  });
  let raf = 0;
  const tick = (time: number) => {
    lenisInstance?.raf(time);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  (lenisInstance as Lenis & { _raf?: number })._raf = raf;
  return lenisInstance;
}

export function destroyLenis(): void {
  if (!lenisInstance) return;
  const inst = lenisInstance as Lenis & { _raf?: number };
  if (inst._raf) cancelAnimationFrame(inst._raf);
  lenisInstance.destroy();
  lenisInstance = null;
}
