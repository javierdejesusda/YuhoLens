"use client";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import arcData from "@/data/kg2-arc.generated.json";
import type { ArcPoint } from "@/lib/types";
import { Reveal } from "@/components/ui/reveal";

const HISTOGRAM = [
  { score: 1, count: 0, peak: false },
  { score: 2, count: 2, peak: false },
  { score: 3, count: 7, peak: false },
  { score: 4, count: 36, peak: true },
  { score: 5, count: 5, peak: false },
];

const VIEW_W = 700;
const VIEW_H = 380;
const PLOT_LEFT = 60;
const PLOT_RIGHT = VIEW_W - 60;
const PLOT_STEP = (PLOT_RIGHT - PLOT_LEFT) / 3;
const Y_TOP = 40;
const Y_BOTTOM = 320;
const Y_MIN = 3.4;
const Y_MAX = 4.1;
const PASS_GATE = 3.8;

const LOCKED_STAGES = ["v5", "bestof_v4v5", "bo3_picked", "bo5_picked"] as const;
type LockedStage = (typeof LOCKED_STAGES)[number];

const STAGE_TAG: Record<LockedStage, "SOFT" | "PASS"> = {
  v5: "SOFT",
  bestof_v4v5: "SOFT",
  bo3_picked: "SOFT",
  bo5_picked: "PASS",
};

const STAGE_TICKER: Record<LockedStage, string> = {
  v5: "v5 single-shot",
  bestof_v4v5: "bo-2",
  bo3_picked: "bo-3",
  bo5_picked: "bo-5 SHIP",
};

export function Kg2Arc() {
  const arcAll = arcData as ArcPoint[];
  const arc = LOCKED_STAGES.map(
    (stage) => arcAll.find((p) => p.stage === stage)!,
  );

  const sectionRef = useRef<HTMLElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);
  const [hovered, setHovered] = useState<{ stage: string; left: number; top: number } | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const yScale = (c: number) =>
    Y_BOTTOM - ((c - Y_MIN) / (Y_MAX - Y_MIN)) * (Y_BOTTOM - Y_TOP);
  const xScale = (i: number) => PLOT_LEFT + i * PLOT_STEP;

  const points = arc.map((p, i) => ({
    x: xScale(i),
    y: yScale(p.coherence),
    p,
  }));

  const pathD = points
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
    .join(" ");

  // Score crosses the 3.80 PASS gate between bo3 (3.64) and bo5 (3.88).
  // Map that crossing to a horizontal fraction so the linearGradient
  // shifts colour right where the stroke crests the gate line.
  const crossT = (PASS_GATE - arc[2].coherence) / (arc[3].coherence - arc[2].coherence);
  const crossX = xScale(2) + crossT * PLOT_STEP;
  const crossFraction = (crossX - PLOT_LEFT) / (PLOT_RIGHT - PLOT_LEFT);
  const gradientStop = Math.max(0, Math.min(1, crossFraction));

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.classList.add("is-in");
            obs.disconnect();
          }
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const node = pathRef.current;
    if (!node) return;
    setPathLength(node.getTotalLength());
  }, [pathD]);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });
  // Stroke fully hidden at scroll 0, fully drawn around the centre, held
  // drawn on the way out. The 0.15 → 0.55 window keeps the reveal inside
  // the comfortable reading band rather than racing against the section
  // entry/exit. Function form so the transform always reads the latest
  // pathLength after the post-mount measurement.
  const dashOffset = useTransform(scrollYProgress, (v) => {
    if (pathLength === 0 || prefersReducedMotion) return 0;
    if (v <= 0.15) return pathLength;
    if (v >= 0.55) return 0;
    const t = (v - 0.15) / 0.4;
    return pathLength * (1 - t);
  });

  const onEnter = (i: number, stage: string) => () => {
    const wrap = chartRef.current;
    if (!wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const left = (xScale(i) / VIEW_W) * w;
    const top = (yScale(arc[i].coherence) / VIEW_H) * h;
    setHovered({ stage, left, top });
  };

  const hoveredPoint = hovered ? arc.find((p) => p.stage === hovered.stage) : null;

  return (
    <section className="kg2-section is-paper-anchor-right" id="kg2" ref={sectionRef} data-paper-stage="kg2" data-paper-hide>
      <div className="kg-left">
        <Reveal>
          <div className="section-tag">
            <span className="num">02·9 / 04</span>
            <span>The arc</span>
            <span className="ja">実証</span>
            <span className="rule" />
          </div>
        </Reveal>
        <Reveal>
          <h2 className="section-title">
            3.56 → 3.88 <span className="accent">PASS.</span>
          </h2>
        </Reveal>
        <Reveal>
          <p className="section-lede">
            Five decoder profiles, one SFT checkpoint, gpt-5-mini judges per prompt. The lift is
            entirely inference-time.
          </p>
        </Reveal>

        <Reveal delay={1}>
          <div className="kg-stats">
            {[
              { v: "1.000", k: "Citation rate", em: true },
              { v: "0.994", k: "Coverage", em: false },
              { v: "3.88", k: "Coherence", em: true },
              { v: "MI300X", k: "Hardware", em: false, small: true },
            ].map((s) => (
              <div className="kg-stat" key={s.k}>
                <div className="k">{s.k}</div>
                <div className="v">{s.em ? <strong className="accent">{s.v}</strong> : s.v}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={2}>
          <div className="kg-histo">
            <div className="lab">SCORE DISTRIBUTION · n=50</div>
            <div className="bars">
              <div className="bcol"><span /></div>
              {HISTOGRAM.map((h) => (
                <div key={h.score} className={"bcol" + (h.peak ? " peak" : "")}>
                  <div className="n">{h.count}</div>
                  <div className="b" style={{ height: `${(h.count / 36) * 100}%` }} />
                  <div className="x">{h.score}</div>
                </div>
              ))}
            </div>
            <div className="leg">
              <span>likert 1–5</span>
              <span>peak @ 4</span>
            </div>
          </div>
        </Reveal>
      </div>

      <Reveal delay={1}>
        <div className="kg2-chart" ref={chartRef}>
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-labelledby="arc-title">
            <title id="arc-title">
              KG-2 coherence arc, v5 single-shot 3.56 to bo-5 SHIP 3.88, crossing the 3.80 PASS gate.
            </title>
            <defs>
              <linearGradient id="kg2-arc-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset={`${gradientStop * 100}%`} stopColor="var(--vermilion)" />
                <stop offset={`${gradientStop * 100}%`} stopColor="var(--type-primary)" />
              </linearGradient>
            </defs>
            {[3.5, 3.7, 3.9, 4.1].map((y) => (
              <g key={y}>
                <line className="grid-line" x1={40} y1={yScale(y)} x2={VIEW_W - 20} y2={yScale(y)} />
                <text className="axis-label" x={6} y={yScale(y) + 4}>{y.toFixed(1)}</text>
              </g>
            ))}
            <line
              className="target-line"
              x1={40}
              y1={yScale(PASS_GATE)}
              x2={VIEW_W - 20}
              y2={yScale(PASS_GATE)}
            />
            <text
              className="pass-label"
              x={VIEW_W - 24}
              y={yScale(PASS_GATE) - 8}
              textAnchor="end"
            >
              3.80 PASS GATE
            </text>

            <motion.path
              ref={pathRef}
              className="arc-stroke"
              d={pathD}
              fill="none"
              stroke="url(#kg2-arc-stroke)"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={pathLength || undefined}
              style={{ strokeDashoffset: dashOffset }}
            />

            {points.map(({ x, y, p }, i) => {
              const stage = p.stage as LockedStage;
              const tag = STAGE_TAG[stage];
              const ticker = STAGE_TICKER[stage];
              const isShip = p.isShip;
              const isHover = hovered?.stage === p.stage;
              return (
                <g key={p.stage}>
                  <circle
                    className={"arc-pt" + (isHover ? " is-hover" : "") + (isShip ? " is-ship" : "")}
                    cx={x}
                    cy={y}
                    r={isShip ? 11 : 6}
                    tabIndex={0}
                    role="button"
                    aria-label={`${ticker}, coherence ${p.coherence.toFixed(2)}, ${tag}`}
                    onMouseEnter={onEnter(i, p.stage)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={onEnter(i, p.stage)}
                    onBlur={() => setHovered(null)}
                    style={{ outline: "none" }}
                  />
                  <text className="arc-pt-ticker" x={x} y={y - 18} textAnchor="middle">
                    {ticker}
                  </text>
                  <text
                    className={"arc-pt-score" + (tag === "PASS" ? " is-pass" : "")}
                    x={x}
                    y={y + 26}
                    textAnchor="middle"
                  >
                    {p.coherence.toFixed(2)}
                  </text>
                  <text
                    className={"arc-pt-tag" + (tag === "PASS" ? " is-pass" : "")}
                    x={x}
                    y={y + 40}
                    textAnchor="middle"
                  >
                    {tag}
                  </text>
                </g>
              );
            })}
          </svg>
          {hoveredPoint && hovered && (
            <div
              className="kg2-tip is-on"
              style={{ left: hovered.left, top: hovered.top }}
              role="tooltip"
            >
              <div className="h">{hoveredPoint.label}</div>
              <div className="row">
                <span>coherence</span>
                <span className="v">{hoveredPoint.coherence.toFixed(2)}</span>
              </div>
              <div className="row">
                <span>citation</span>
                <span className="v">{hoveredPoint.citationRate.toFixed(3)}</span>
              </div>
              <div className="row">
                <span>config</span>
                <span className="v" style={{ fontSize: 9 }}>{hoveredPoint.config}</span>
              </div>
              {hoveredPoint.preview && <div className="sample">{hoveredPoint.preview}</div>}
            </div>
          )}
        </div>
      </Reveal>
    </section>
  );
}
