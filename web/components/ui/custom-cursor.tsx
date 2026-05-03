"use client";
import { useEffect, useRef } from "react";

const LINK_SELECTOR = "a, button, input, [role=button], .ld-chip, .ldd-btn";
const CARD_SELECTOR = ".report-card, .step-card, .doc-card, .arc-pt";

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

    const onMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%, -50%)`;
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

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mousemove", onSystemMove);
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("keydown", onKeyDown);
    raf = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mousemove", onSystemMove);
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("keydown", onKeyDown);
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
