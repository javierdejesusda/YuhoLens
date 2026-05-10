"use client";
import { motion, type Transition } from "framer-motion";
import { useEffect, useRef, useState, type CSSProperties } from "react";

export type SealState = "pending" | "verified" | "refused";

type SealStampProps = {
  state?: SealState;
  label: string;
  className?: string;
};

const PUNCH_TRANSITION: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 14,
  mass: 0.6,
};

const SIZE = 54;
const RADIUS = 24;
const STROKE = 1.5;

// Triple-click hanko reveal — three clicks within this many ms surface
// the build-stamp. Anything slower is treated as a normal click.
const TRIPLE_CLICK_WINDOW_MS = 500;
const REVEAL_DURATION_MS = 4000;

function readBuildCommit(): string {
  // `process.env.NEXT_PUBLIC_BUILD_COMMIT` is inlined by Next.js at build
  // time via `next.config.ts`. The fallback covers tests and hot-reload
  // edge cases where the env var hasn't been threaded through.
  const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT;
  return commit && commit.length > 0 ? commit : "local";
}

export function SealStamp({ state = "verified", label, className }: SealStampProps) {
  const initial =
    state === "verified"
      ? { scale: 1.4, rotate: -8, opacity: 0 }
      : state === "refused"
      ? { scale: 1.18, rotate: -14, opacity: 0 }
      : { scale: 1, rotate: 0, opacity: 0 };
  const animate =
    state === "verified"
      ? { scale: 1, rotate: 8, opacity: 1 }
      : state === "refused"
      ? { scale: 1, rotate: -8, opacity: 1 }
      : { scale: 1, rotate: 0, opacity: 0.85 };

  const fill =
    state === "verified"
      ? "var(--vermilion)"
      : state === "refused"
      ? "var(--ink-deep)"
      : "transparent";
  const strokeColor =
    state === "verified"
      ? "var(--vermilion)"
      : state === "refused"
      ? "var(--ink-deep)"
      : "var(--vermilion)";
  const glyphColor =
    state === "verified" || state === "refused"
      ? "var(--paper-warm)"
      : "var(--vermilion)";

  const wrapStyle: CSSProperties = {
    display: "inline-flex",
    width: SIZE,
    height: SIZE,
    filter:
      state === "verified" ? "drop-shadow(0 0 16px var(--vermilion-soft))" : "none",
    opacity: state === "pending" ? 0.55 : 1,
  };

  const glyphFamily =
    "var(--f-jp), 'Noto Serif JP', 'Yu Mincho', 'Hiragino Mincho ProN', serif";

  const ariaLabel = `${state}: ${label}`;

  const clickTimesRef = useRef<number[]>([]);
  const resetTimerRef = useRef<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleClick = () => {
    const now = Date.now();
    const recent = clickTimesRef.current.filter(
      (t) => now - t <= TRIPLE_CLICK_WINDOW_MS,
    );
    recent.push(now);
    clickTimesRef.current = recent;
    if (recent.length >= 3) {
      clickTimesRef.current = [];
      setRevealed(true);
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        setRevealed(false);
        resetTimerRef.current = null;
      }, REVEAL_DURATION_MS);
    }
  };

  const buildCommit = readBuildCommit();

  return (
    <span
      className={"hanko-wrap" + (revealed ? " is-hanko-revealed" : "")}
      onClick={handleClick}
    >
      <motion.span
        role="img"
        aria-label={ariaLabel}
        data-state={state}
        data-magnet="hanko"
        className={
          "seal-stamp" +
          (state === "verified" ? " seal-glow" : "") +
          (state === "pending" ? " seal-stamp--pending" : "") +
          (className ? ` ${className}` : "")
        }
        style={wrapStyle}
        initial={initial}
        animate={animate}
        transition={PUNCH_TRANSITION}
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          aria-hidden="true"
          focusable="false"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill={fill}
            stroke={strokeColor}
            strokeWidth={STROKE}
          />
          <text
            x={SIZE / 2}
            y={SIZE / 2}
            dy="0.04em"
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily={glyphFamily}
            fontSize={state === "refused" ? 20 : 22}
            fontWeight={700}
            fill={glyphColor}
          >
            {state === "refused" ? "拒" : "信"}
          </text>
          {state === "refused" ? (
            <line
              x1={SIZE / 2 - RADIUS + STROKE}
              y1={SIZE / 2 + RADIUS - STROKE}
              x2={SIZE / 2 + RADIUS - STROKE}
              y2={SIZE / 2 - RADIUS + STROKE}
              stroke="var(--vermilion)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          ) : null}
        </svg>
      </motion.span>
      <span className="hanko-build-stamp" aria-hidden="true">
        BUILT · 2026-05-10 · COMMIT {buildCommit}
      </span>
    </span>
  );
}
