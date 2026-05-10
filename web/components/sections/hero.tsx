"use client";
import { useEffect, useState } from "react";

import { HeroTypeset } from "../hero/hero-typeset";

// Paper drifts to its phase-2 left-anchored pose at the same beat the
// typeset moment resolves into its resting state (~3.2 s). The paper
// rAF reads `data-hero-phase` directly, so flipping the attribute is
// what triggers the slide.
const PHASE_DELAY_MS = 3200;

export function Hero() {
  const [phase, setPhase] = useState<1 | 2>(1);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPhase(2);
      return;
    }
    const t = window.setTimeout(() => setPhase(2), PHASE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <section
      className="hero is-paper-anchor-center"
      id="hero"
      aria-label="Hero"
      data-paper-stage="hero"
      data-hero-phase={phase}
    >
      <div className="corner c-tl">
        朱 / SHU · A LENS ON JAPANESE FILINGS
      </div>
      <div className="corner c-tr">N° 047 / TOKYO · NEW YORK</div>
      <div className="corner c-bl">VOL. II · MMXXVI</div>
      <div className="corner c-br">
        <span>EDINET FEED · LIVE</span>
        <span style={{ color: "var(--vermilion)" }}>●</span>
      </div>

      {/* Hero typeset moment: the kanji-to-roman crossfade, ink-bleed
          glyphs, sumi-stroke under "span-cited", and CTA reveal all
          live in HeroTypeset. The outer .hero-stage grid still owns
          page-level positioning so the paper-rail anchor math stays
          intact. */}
      <div className="hero-stage hero-stage--typeset">
        <div className="hero-stage__copy">
          <HeroTypeset />
        </div>
      </div>

      <div className="scroll-hint" aria-hidden="true">
        <span>Scroll</span>
        <span className="line" />
      </div>
    </section>
  );
}
