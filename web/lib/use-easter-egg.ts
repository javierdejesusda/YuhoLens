"use client";
import { createElement, useEffect, useState } from "react";
import supKanjiMap from "@/data/sup-kanji-map.generated.json";
import { lookupAccentKanji } from "@/lib/accent-kanji";

const TRIGGER = "yuho";
const WINDOW_MS = 1500;
const SUP_KANJI_MAP = supKanjiMap as Record<string, string>;

/**
 * Returns true when the keystroke event originated inside an editable
 * surface and we should not consume the key for the easter-egg sequence.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Stamp `data-xray-kanji` onto every accent span and citation superscript
 * so the CSS rule in `_xray.css` can render the kanji overlay above each.
 * The stamps are removed when the egg deactivates so the DOM stays inert.
 */
function applyXrayOverlays(): void {
  const accents = document.querySelectorAll<HTMLElement>(".accent");
  accents.forEach((el) => {
    const glyph = lookupAccentKanji(el.textContent ?? "");
    if (glyph) el.setAttribute("data-xray-kanji", glyph);
  });

  const sups = document.querySelectorAll<HTMLElement>("sup");
  sups.forEach((sup) => {
    const direct = sup.getAttribute("data-cite") ?? sup.getAttribute("data-pair");
    let glyph: string | undefined;
    if (direct) {
      glyph = SUP_KANJI_MAP[`pair:${direct}`] ?? SUP_KANJI_MAP[direct];
    }
    if (!glyph) {
      const parentPair = sup.closest<HTMLElement>("[data-pair]");
      const parentPairValue = parentPair?.getAttribute("data-pair");
      if (parentPairValue) {
        glyph = SUP_KANJI_MAP[`pair:${parentPairValue}`];
      }
    }
    if (glyph) sup.setAttribute("data-xray-kanji", glyph);
  });
}

function clearXrayOverlays(): void {
  const stamped = document.querySelectorAll<HTMLElement>("[data-xray-kanji]");
  stamped.forEach((el) => el.removeAttribute("data-xray-kanji"));
}

/**
 * Layer 2.5 easter-egg controller. Listens for the `y-u-h-o` keystroke
 * sequence (when no editable surface holds focus) and toggles a global
 * `html.is-xray` class plus `data-xray-kanji` overlays. Esc always exits.
 *
 * Returns `{ xrayActive }` so a sibling provider component can render
 * the on-screen indicator. The DOM scan runs on activation only;
 * sections render normally when the egg is dormant.
 */
export function useEasterEgg(): { xrayActive: boolean } {
  const [xrayActive, setXrayActive] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let buffer: Array<{ key: string; t: number }> = [];

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setXrayActive(false);
        buffer = [];
        return;
      }
      if (isEditableTarget(e.target)) return;
      // Ignore modifier-augmented keys so chord shortcuts (e.g. ⌘Y on
      // Linux Chrome's history) don't accidentally count toward the
      // sequence.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key.length !== 1) return;
      const now = Date.now();
      buffer.push({ key, t: now });
      if (buffer.length > TRIGGER.length) {
        buffer = buffer.slice(-TRIGGER.length);
      }
      if (buffer.length === TRIGGER.length) {
        const sequence = buffer.map((b) => b.key).join("");
        const elapsed = buffer[buffer.length - 1].t - buffer[0].t;
        if (sequence === TRIGGER && elapsed <= WINDOW_MS) {
          setXrayActive((prev) => !prev);
          buffer = [];
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (xrayActive) {
      root.classList.add("is-xray");
      applyXrayOverlays();
    } else {
      root.classList.remove("is-xray");
      clearXrayOverlays();
    }
    return () => {
      root.classList.remove("is-xray");
      clearXrayOverlays();
    };
  }, [xrayActive]);

  return { xrayActive };
}

/**
 * Tiny client component that owns the easter-egg lifecycle and renders
 * the X-RAY indicator chip when the egg is active. Mounted from
 * `app/layout.tsx` next to the other providers. Defined with
 * `createElement` so this hook module stays a `.ts` file.
 */
export function EasterEggProvider() {
  const { xrayActive } = useEasterEgg();
  if (!xrayActive) return null;
  return createElement(
    "div",
    {
      className: "xray-indicator",
      role: "status",
      "aria-live": "polite",
    },
    "X-RAY · ESC TO EXIT",
  );
}
