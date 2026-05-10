"use client";
import { useEffect } from "react";

/**
 * Layer 2.3 Ink-bleed accent on hover.
 *
 * Scans for `.accent`, `.btn-primary`, `.access-card-link` and attaches a
 * hover handler that reads pointer entry coordinates and writes them as
 * `--ink-x` / `--ink-y` CSS variables on the element. The matching CSS in
 * `_ink-bleed.css` paints a vermilion radial-gradient ::after that scales
 * out from the entry point on hover and fades on leave.
 *
 * Mirrors the magnet-refresh pattern in `custom-cursor.tsx`: the DOM is
 * scanned on mount and re-scanned on click (covers React-mounted nodes
 * after route-internal toggles). Pointer-fine + reduced-motion gates
 * make this a no-op on touch devices and for users who opt out.
 *
 * The hero `<h1>` and manifest section title both already own a
 * `.accent::after` pseudo (the inking underline). We exclude them from
 * the scan so we never overwrite their pseudo-element.
 */
const SELECTOR = ".accent, .btn-primary, .access-card-link";
const EXCLUDE_PARENT_SELECTORS = ["h1.hero-title", ".manifest .section-title"];
const ACTIVE_CLASS = "is-ink-bleeding";
const DATA_ATTR = "data-ink-bleed";

type InkBleedElement = HTMLElement & {
  __inkBleedAttached?: boolean;
  __inkBleedHandlers?: {
    enter: (e: MouseEvent) => void;
    leave: () => void;
  };
};

function shouldSkip(el: HTMLElement): boolean {
  for (const sel of EXCLUDE_PARENT_SELECTORS) {
    if (el.closest(sel)) return true;
  }
  return false;
}

function attach(el: InkBleedElement) {
  if (el.__inkBleedAttached) return;
  if (shouldSkip(el)) return;
  el.__inkBleedAttached = true;
  el.setAttribute(DATA_ATTR, "");

  const enter = (e: MouseEvent) => {
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty("--ink-x", `${x}px`);
    el.style.setProperty("--ink-y", `${y}px`);
    el.classList.add(ACTIVE_CLASS);
  };
  const leave = () => {
    el.classList.remove(ACTIVE_CLASS);
  };

  el.addEventListener("mouseenter", enter);
  el.addEventListener("mouseleave", leave);
  el.__inkBleedHandlers = { enter, leave };
}

export function useInkBleed(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!matchMedia("(pointer: fine)").matches) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const tracked = new Set<InkBleedElement>();
    const refresh = () => {
      const nodes = document.querySelectorAll<InkBleedElement>(SELECTOR);
      nodes.forEach((node) => {
        if (!tracked.has(node)) {
          attach(node);
          tracked.add(node);
        }
      });
    };
    refresh();

    const onClick = () => refresh();
    document.addEventListener("click", onClick);

    return () => {
      document.removeEventListener("click", onClick);
      tracked.forEach((el) => {
        const handlers = el.__inkBleedHandlers;
        if (handlers) {
          el.removeEventListener("mouseenter", handlers.enter);
          el.removeEventListener("mouseleave", handlers.leave);
        }
        el.classList.remove(ACTIVE_CLASS);
        el.removeAttribute(DATA_ATTR);
        el.style.removeProperty("--ink-x");
        el.style.removeProperty("--ink-y");
        delete el.__inkBleedAttached;
        delete el.__inkBleedHandlers;
      });
      tracked.clear();
    };
  }, []);
}

export function InkBleedProvider(): null {
  useInkBleed();
  return null;
}
