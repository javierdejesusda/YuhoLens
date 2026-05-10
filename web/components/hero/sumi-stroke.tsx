"use client";
import { useEffect, useRef, useState } from "react";

type Props = {
  active: boolean;
};

/**
 * Vermilion sumi-ink underline that draws horizontally beneath the
 * parent span. Uses `stroke-dasharray` / `stroke-dashoffset` to animate
 * a hand-drawn brushstroke when `active` flips true. The stroke has a
 * faint calligraphic taper (slightly thicker mid-section) by overlaying
 * a second slimmer pass with a different easing. Position is absolute
 * relative to the parent — the parent must be `position: relative`.
 */
export function SumiStroke({ active }: Props) {
  const pathRef = useRef<SVGPathElement>(null);
  const [length, setLength] = useState(0);

  useEffect(() => {
    const p = pathRef.current;
    if (!p) return;
    try {
      setLength(p.getTotalLength());
    } catch {
      // jsdom or other non-SVG environments — treat as no animation.
      setLength(0);
    }
  }, []);

  const dash = length || 200;
  const offset = active ? 0 : dash;

  return (
    <svg
      className="sumi-stroke"
      viewBox="0 0 200 12"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Calligraphic body — slightly wavy, full width. */}
      <path
        ref={pathRef}
        d="M2 7 C 30 5, 70 9, 100 6 S 170 8, 198 6"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        style={{
          strokeDasharray: dash,
          strokeDashoffset: offset,
          transition: "stroke-dashoffset 540ms cubic-bezier(0.65, 0, 0.35, 1)",
        }}
      />
      {/* Mid-section taper — a thinner overlay pass that lands a beat
          later, giving the brushstroke its calligraphic weight curve. */}
      <path
        d="M40 7 C 80 5, 120 9, 160 6"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
        style={{
          strokeDasharray: dash,
          strokeDashoffset: offset,
          transition:
            "stroke-dashoffset 480ms cubic-bezier(0.65, 0, 0.35, 1) 80ms",
        }}
      />
    </svg>
  );
}
