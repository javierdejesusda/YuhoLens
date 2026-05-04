"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface TipState {
  x: number;
  y: number;
  side: "above" | "below";
  label: string;
  aux?: string;
}

const TARGET_ATTR = "data-gloss-label";
const AUX_ATTR = "data-gloss-aux";

// Lightweight hover preview for cited Japanese phrases. Triggers on any
// element carrying `data-gloss-label` (and optionally `data-gloss-aux`),
// not by component subscription — this keeps section code free of any
// imperative ref wiring. Bails on coarse-pointer / touch input so the
// drawer remains the only entry-point on those devices.
export function CiteGlossLayer() {
  const [tip, setTip] = useState<TipState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    const place = (target: HTMLElement) => {
      const r = target.getBoundingClientRect();
      const wantAbove = r.top > 80;
      setTip({
        x: r.left + r.width / 2,
        y: wantAbove ? r.top - 10 : r.bottom + 10,
        side: wantAbove ? "above" : "below",
        label: target.getAttribute(TARGET_ATTR) || "",
        aux: target.getAttribute(AUX_ATTR) || undefined,
      });
    };

    const onOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        `[${TARGET_ATTR}]`,
      );
      if (!target) return;
      place(target);
    };

    const onOut = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        `[${TARGET_ATTR}]`,
      );
      if (!target) return;
      const next = e.relatedTarget as Node | null;
      if (next && target.contains(next)) return;
      setTip(null);
    };

    const onFocus = (e: FocusEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(
        `[${TARGET_ATTR}]`,
      );
      if (!target) return;
      place(target);
    };

    const onBlur = () => setTip(null);
    const dismiss = () => setTip(null);

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    window.addEventListener("scroll", dismiss, { passive: true });
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      window.removeEventListener("scroll", dismiss);
      window.removeEventListener("resize", dismiss);
    };
  }, []);

  if (!mounted || !tip) return null;

  return createPortal(
    <div
      className={`cite-gloss-tip cite-gloss-tip--${tip.side}`}
      role="tooltip"
      aria-hidden="true"
      style={{ left: tip.x, top: tip.y }}
    >
      <span className="cite-gloss-tip__label">{tip.label}</span>
      {tip.aux ? <span className="cite-gloss-tip__aux">{tip.aux}</span> : null}
    </div>,
    document.body,
  );
}
