"use client";
import { useEffect, useState } from "react";

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
        <span className="dash">—</span> 朱 / SHU · A LENS ON JAPANESE FILINGS
      </div>
      <div className="corner c-tr">N° 047 / TOKYO · NEW YORK</div>
      <div className="corner c-bl">VOL. II · MMXXVI</div>
      <div className="corner c-br">
        <span>EDINET FEED · LIVE</span>
        <span style={{ color: "var(--vermilion)" }}>●</span>
      </div>

      {/* Phase 1: paper carries the entire title — brand + tagline are
          printed on the document texture itself (see buildHero in
          paper-rail). No HTML overlay needed; the four corners frame
          the cover like masthead chrome. */}

      <div className="hero-stage" aria-hidden={phase === 1}>
        <div className="hero-stage__copy">
          <p className="hero-stage__eyebrow">
            <span className="sq" />
            <span>Vol. II — Edition 047</span>
            <span className="hero-stage__sep">·</span>
            <span className="jp" lang="ja">有価証券報告書、英訳</span>
          </p>
          <h2 className="hero-stage__title">
            <span className="line">Translated with</span>
            <span className="line"><em>span-cited</em> receipts.</span>
          </h2>
          <p className="hero-stage__sub">
            Every claim — currency, margin, segment — links back to a page and span in the original <span className="jp-loan">yūhō</span>. Open weights, GGUF on AMD silicon.
          </p>
          <div className="hero-stage__cta">
            <a href="#problem" className="hero-stage__btn">Read the case</a>
            <a href="#access" className="hero-stage__btn is-ghost">Try the model</a>
          </div>
        </div>
      </div>

      <div className="scroll-hint" aria-hidden="true">
        <span>Scroll</span>
        <span className="line" />
      </div>
    </section>
  );
}
