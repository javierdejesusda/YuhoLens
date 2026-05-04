"use client";
import { useEffect, useRef } from "react";

const LINK_SELECTOR = "a, button, input, [role=button], .ld-chip, .ldd-btn";
const CARD_SELECTOR = ".report-card, .step-card, .doc-card, .arc-pt";
const MAGNET_SELECTOR = '[data-magnet="hanko"]';
// Pull radius (px) added on top of the element's half-bounds: the
// cursor begins to snap when its centre is within this many px of
// the element's edge.  18 px is the smallest distance that reads as
// "the cursor noticed" without yanking the user's pointer.
const MAGNET_PULL_PX = 18;

export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!matchMedia("(pointer: fine)").matches) return;
    const ring = ringRef.current;
    const dot = dotRef.current;
    const label = labelRef.current;
    if (!ring || !dot || !label) return;

    let mx = window.innerWidth / 2;
    let my = window.innerHeight / 2;
    let cx = mx;
    let cy = my;
    let raf = 0;
    // Magnets are queried once on mount and refreshed on click (the
    // routes are anchor-only so the DOM is stable across navigations).
    let magnets: HTMLElement[] = [];
    const refreshMagnets = () => {
      magnets = Array.from(
        document.querySelectorAll<HTMLElement>(MAGNET_SELECTOR),
      );
    };
    refreshMagnets();

    const onMove = (e: MouseEvent) => {
      // Magnetic snap: when the pointer crosses inside an element's
      // pull-radius, override mx/my with the element's centre.  The
      // 0.18 lerp in tick() is what gives the cursor its inertia, so
      // the snap reads as "the cursor was drawn in" rather than a
      // teleport — precisely the editorial register the brand wants.
      let targetX = e.clientX;
      let targetY = e.clientY;
      let snapped = false;
      for (const el of magnets) {
        const r = el.getBoundingClientRect();
        const ecx = r.left + r.width / 2;
        const ecy = r.top + r.height / 2;
        const dx = e.clientX - ecx;
        const dy = e.clientY - ecy;
        const pullR =
          Math.min(r.width, r.height) / 2 + MAGNET_PULL_PX;
        if (dx * dx + dy * dy < pullR * pullR) {
          targetX = ecx;
          targetY = ecy;
          snapped = true;
          break;
        }
      }
      mx = targetX;
      my = targetY;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
      ring.classList.toggle("is-magnet", snapped);
    };

    const tick = () => {
      cx += (mx - cx) * 0.18;
      cy += (my - cy) * 0.18;
      ring.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      raf = requestAnimationFrame(tick);
    };

    const setCard = () => {
      ring.classList.add("is-card");
      ring.classList.remove("is-link");
      label.textContent = "READ";
    };
    const setLink = () => {
      ring.classList.add("is-link");
      ring.classList.remove("is-card");
      label.textContent = "→";
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target || !target.closest) return;
      const cardEl = target.closest(CARD_SELECTOR);
      const linkEl = target.closest(LINK_SELECTOR);
      if (cardEl && linkEl) {
        if (cardEl.contains(linkEl)) {
          setCard();
        } else {
          setLink();
        }
        return;
      }
      if (cardEl) {
        setCard();
        return;
      }
      if (linkEl) {
        setLink();
        return;
      }
      ring.classList.remove("is-link", "is-card");
    };

    const onOut = (e: MouseEvent) => {
      const related = e.relatedTarget as Element | null;
      if (related && related.closest && (related.closest(LINK_SELECTOR) || related.closest(CARD_SELECTOR))) {
        return;
      }
      ring.classList.remove("is-link", "is-card");
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        document.body.classList.add("use-system-cursor");
      }
    };
    const onSystemMove = () => {
      if (document.body.classList.contains("use-system-cursor")) {
        document.body.classList.remove("use-system-cursor");
      }
    };

    const onClick = () => refreshMagnets();
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mousemove", onSystemMove);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick);
    raf = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousemove", onSystemMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      <div id="cursor" ref={ringRef} aria-hidden="true">
        <span className="label" ref={labelRef} />
      </div>
      <div id="cursor-dot" ref={dotRef} aria-hidden="true" />
    </>
  );
}
