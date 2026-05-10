"use client";
import { useEffect, useRef, useState } from "react";

const LETTERS = ["Y", "U", "H", "O", "L", "E", "N", "S"];
// Letters animate in over ~700 ms, the JA→EN crossfade fires at 1300 ms
// and takes 400 ms (ends at 1700 ms). HOLD_MS holds the loader past the
// crossfade so the user actually sees the English translation settle
// before the paper slides in.
const HOLD_MS = 2400;
const REDUCED_HOLD_MS = 400;

export function Preloader() {
  const rootRef = useRef<HTMLDivElement>(null);
  const jaRef = useRef<HTMLSpanElement>(null);
  const enRef = useRef<HTMLSpanElement>(null);
  const [hidden, setHidden] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.body.setAttribute("aria-busy", "true");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const crossfadeT = setTimeout(() => {
      if (jaRef.current) jaRef.current.style.opacity = "0.4";
      if (enRef.current) enRef.current.style.opacity = "1";
    }, 1300);

    const dismissT = setTimeout(dismiss, reduced ? REDUCED_HOLD_MS : HOLD_MS);

    return () => {
      clearTimeout(crossfadeT);
      clearTimeout(dismissT);
    };
  }, []);

  const dismiss = () => {
    setDone(true);
    document.body.dataset.preloaderDone = "1";
    document.body.dispatchEvent(new CustomEvent("yuho:preloader-done"));
    setTimeout(() => {
      setHidden(true);
      document.body.setAttribute("aria-busy", "false");
    }, 1200);
  };

  if (hidden) return null;

  return (
    <div
      id="preloader"
      ref={rootRef}
      className={done ? "is-done" : ""}
      role="status"
      aria-label="Loading YuhoLens"
    >
      <div className="pl-grid" aria-hidden="true" />
      <div className="pl-mark" aria-hidden="true">
        {LETTERS.map((c, i) => (
          <span key={c + i} style={{ animationDelay: `${(i + 1) * 40}ms` }}>
            {c}
          </span>
        ))}
      </div>
      <div className="pl-trans" aria-hidden="true">
        <span className="ja" ref={jaRef}>
          有価証券報告書
        </span>
        <span className="arrow">→</span>
        <span className="en" ref={enRef} style={{ opacity: 0 }}>
          Annual Securities Report
        </span>
      </div>
      <div className="pl-bar" aria-hidden="true">
        <span className="dot" />
        <span>Calibrating lens · v2.4</span>
      </div>
      <button
        type="button"
        className="pl-skip"
        onClick={dismiss}
        aria-label="Skip intro"
      >
        Skip intro →
      </button>
    </div>
  );
}
