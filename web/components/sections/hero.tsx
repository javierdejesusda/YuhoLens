"use client";
import { useEffect, useRef, useState } from "react";

const PHASE_DELAY_MS = 3200;

const JST_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tokyo",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const TICKER_LABELS = [
  "EDINET FEED · LIVE",
  "1,910 ROWS INDEXED",
  "KG-2 · 3.88 PASS",
] as const;

const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function JstClock() {
  const [stamp, setStamp] = useState<string | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    setStamp(JST_FORMATTER.format(new Date()));
    const id = window.setInterval(() => {
      setStamp(JST_FORMATTER.format(new Date()));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!stamp) return <>N° 047 / TOKYO · NEW YORK</>;
  return (
    <>
      <span>N° 047 / TOKYO </span>
      <span style={TABULAR}>{stamp}</span>
      <span> JST</span>
    </>
  );
}

function EdinetTicker() {
  const [idx, setIdx] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setReduced(true);
      return;
    }
    const id = window.setInterval(() => {
      setIdx((prev) => (prev + 1) % TICKER_LABELS.length);
    }, 4000);
    return () => window.clearInterval(id);
  }, []);

  const dotStyle: React.CSSProperties = reduced
    ? { color: "var(--vermilion)", opacity: 1, animation: "none" }
    : {
        color: "var(--vermilion)",
        animation: "hero-corner__pulse 1s steps(2) infinite",
      };

  return (
    <>
      <style>{`@keyframes hero-corner__pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }`}</style>
      <span>{TICKER_LABELS[idx]}</span>
      <span style={dotStyle}>●</span>
    </>
  );
}

function CursorCoords() {
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const [revealed, setRevealed] = useState(false);
  const lastUpdateRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    const armIdleTimer = () => {
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = window.setTimeout(() => {
        setRevealed(true);
      }, 2000);
    };

    const onMove = (event: MouseEvent) => {
      const now = performance.now();
      if (now - lastUpdateRef.current >= 100) {
        lastUpdateRef.current = now;
        setCoords({ x: event.clientX, y: event.clientY });
      }
      armIdleTimer();
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (idleTimerRef.current !== null) {
        window.clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  const base = "朱 / SHU · A LENS ON JAPANESE FILINGS";
  if (!revealed || !coords) return <>{base}</>;
  const x = String(Math.max(0, Math.min(9999, Math.round(coords.x)))).padStart(4, "0");
  const y = String(Math.max(0, Math.min(9999, Math.round(coords.y)))).padStart(4, "0");
  return (
    <>
      <span>朱 / SHU · </span>
      <span style={TABULAR}>X {x} Y {y}</span>
    </>
  );
}

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
        <CursorCoords />
      </div>
      <div
        className="corner c-tr"
        style={{ fontVariantNumeric: "tabular-nums", fontFeatureSettings: '"ss01", "tnum"' }}
      >
        <JstClock />
      </div>
      <div className="corner c-bl">VOL. II · MMXXVI</div>
      <div className="corner c-br">
        <EdinetTicker />
      </div>

      <div className="hero-stage" aria-hidden={phase === 1}>
        <div className="hero-stage__copy">
          <p className="hero-stage__eyebrow">
            <span className="sq" />
            <span>Vol. II, Edition 047</span>
            <span className="hero-stage__sep">·</span>
            <span className="jp" lang="ja">有価証券報告書、英訳</span>
          </p>
          <h2 className="hero-stage__title">
            <span className="line">Translated with</span>
            <span className="line"><em>span-cited</em> receipts.</span>
          </h2>
          <p className="hero-stage__sub">
            <span className="jp-loan">Yūhō</span> are Japan&rsquo;s annual securities reports: the equivalent of US 10-Ks, ~88,000 pages filed each year by listed companies. <strong>YuhoLens</strong> reads them in English with every claim, currency, margin, and segment linked back to a page and span in the source. Open weights, GGUF on AMD silicon.
          </p>
          <div className="hero-stage__cta">
            <a href="#problem" className="hero-stage__btn">Read the case</a>
            <a href="#access" className="hero-stage__btn is-ghost" data-cursor-preview="hf:yuholens-14b">Try the model</a>
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
