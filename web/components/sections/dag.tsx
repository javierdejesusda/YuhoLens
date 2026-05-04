"use client";
import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Reveal } from "@/components/ui/reveal";
import { STAGE_DURATIONS_MS } from "@/components/demo/demo-state-machine";
import { useInkPressure } from "@/lib/use-ink-pressure";

const REPO_BLOB = "https://github.com/javierdejesusda/YuhoLens/blob/main/";

const NODES = [
  { x: 40, label: "EDINET row", sub: "data/sample/sample_yuho.txt", role: "INPUT" },
  { x: 280, label: "Ingestor", sub: "src/yuholens/ingestor.py", role: "PARSE" },
  { x: 540, label: "Pass-1 detect", sub: "src/yuholens/agents/graph.py", role: "STRUCTURE" },
  { x: 800, label: "MemoCriticAgent", sub: "src/yuholens/agents/memo_critic.py", featured: true, role: "BEST-OF-5" },
  { x: 1080, label: "Grounder", sub: "src/yuholens/agents/citation_grounder.py", role: "VERIFY" },
];

const EDGE_DURATIONS = [
  STAGE_DURATIONS_MS.ingest,
  STAGE_DURATIONS_MS.pass1,
  STAGE_DURATIONS_MS.critic,
  STAGE_DURATIONS_MS.ground,
];

const LEGEND = [
  { k: "Latency", v: "~28s", note: "End-to-end · single MI300X" },
  { k: "Decoder profiles", v: "5", note: "Conservative → bold · best-of-5" },
  { k: "Critic judge", v: "gpt-5-mini", note: "Per-prompt cheap-gate selector" },
  { k: "Refusal trigger", v: "no-span", note: "Drops sentence · keeps rest" },
];

const EASE = (t: number) => 1 - Math.pow(1 - t, 3);

export function Dag() {
  const pressure = useInkPressure();
  const [edge, setEdge] = useState(0);
  const [t, setT] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const fracRef = useRef(0);
  const edgeRef = useRef(0);
  const lastRef = useRef<number | null>(null);
  const pressureRef = useRef(0);

  pressureRef.current = reducedMotion ? 0 : pressure;

  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      const last = lastRef.current ?? now;
      const dt = Math.min(now - last, 64);
      lastRef.current = now;

      const dur = EDGE_DURATIONS[edgeRef.current] || 800;
      const speedMul = 0.6 + pressureRef.current * 1.8;
      fracRef.current += (speedMul * dt) / dur;

      while (fracRef.current >= 1) {
        fracRef.current -= 1;
        edgeRef.current = (edgeRef.current + 1) % EDGE_DURATIONS.length;
      }

      setEdge(edgeRef.current);
      setT(fracRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fromNode = NODES[edge];
  const toNode = NODES[edge + 1] ?? NODES[edge];
  const eased = EASE(t);
  const x1 = fromNode.x + 200;
  const x2 = toNode.x;
  const packetX = x1 + (x2 - x1) * eased;

  const trailLen = reducedMotion ? 12 : 12 + pressure * 24;
  const trailOpacity = reducedMotion ? 0.7 : 0.55 + pressure * 0.4;
  const chromaOpacity = reducedMotion ? 0.7 : 0.45 + pressure * 0.5;

  return (
    <section className="dag-section is-paper-anchor-right" id="dag" data-paper-stage="dag" data-paper-hide>
      <Reveal>
        <div className="section-tag">
          <span className="num">02·7 / 04</span>
          <span>Architecture</span>
          <span className="ja">骨格</span>
          <span className="rule" />
        </div>
      </Reveal>
      <Reveal>
        <h2 className="section-title">
          Four agents, <span className="accent">one DAG.</span>
        </h2>
      </Reveal>
      <Reveal>
        <p className="section-lede">
          The Critic is the cheapest gate-clear move available — same SFT checkpoint, five decoder
          profiles, let the gpt-5-mini judge pick per-prompt.
        </p>
      </Reveal>

      <Reveal delay={1}>
        <div className="dag-wrap">
          <svg viewBox="0 0 1300 240" role="img" aria-labelledby="dag-title">
            <title id="dag-title">
              YuhoLens 4-agent LangGraph: EDINET row → Ingestor → Pass-1 → MemoCritic → Grounder
            </title>
            <defs>
              <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" className="edge-arrow" />
              </marker>
            </defs>
            {NODES.map((n) => (
              <text
                key={`${n.label}-role`}
                className="agent-role"
                x={n.x + 100}
                y={62}
                textAnchor="middle"
              >
                {n.role}
              </text>
            ))}
            {NODES.slice(0, -1).map((n, i) => (
              <line
                key={i}
                className="edge"
                x1={n.x + 200}
                y1={110}
                x2={NODES[i + 1].x}
                y2={110}
                markerEnd="url(#arrow)"
              />
            ))}
            {/* Active-edge flow: dashes drift along the live edge in
                the same direction as the packet, so the eye sees not
                just *where* the packet is but *which way* it's
                travelling. Reduced-motion freezes the offset. */}
            {edge < NODES.length - 1 && (
              <line
                className="dag-edge-flow"
                x1={NODES[edge].x + 200}
                y1={110}
                x2={NODES[edge + 1].x}
                y2={110}
                stroke="var(--vermilion-soft)"
                strokeWidth={1}
                strokeDasharray="3 5"
                strokeDashoffset={reducedMotion ? 0 : -t * 16}
                opacity={reducedMotion ? 0.4 : 0.55}
                strokeLinecap="round"
              />
            )}
            {NODES.map((n, i) => (
              <DagNode
                key={n.label}
                node={n}
                index={i}
                hovered={hoveredIdx === i}
                onHoverStart={() => setHoveredIdx(i)}
                onHoverEnd={() => setHoveredIdx((h) => (h === i ? null : h))}
              />
            ))}
            <line
              className="dag-trail"
              x1={packetX - trailLen}
              y1={110}
              x2={packetX}
              y2={110}
              stroke="var(--vermilion-soft)"
              strokeWidth={1.5}
              strokeDasharray="2 2"
              strokeLinecap="round"
              opacity={trailOpacity}
            />
            <g className="dag-chroma" opacity={chromaOpacity}>
              <circle cx={packetX - 2} cy={110} r="5" fill="var(--vermilion-glow)" opacity={0.55} />
              <circle cx={packetX} cy={110} r="5" fill="var(--vermilion)" />
              <circle cx={packetX + 2} cy={110} r="5" fill="var(--ink-deep)" opacity={0.7} />
            </g>
            <circle className="packet" cx={packetX} cy={110} r="5" />
            {NODES.map((n) => (
              <line
                key={`tick-${n.label}`}
                className="edge"
                x1={n.x + 100}
                y1={158}
                x2={n.x + 100}
                y2={172}
                strokeDasharray="2 3"
              />
            ))}
            <line className="edge" x1={140} y1={172} x2={1180} y2={172} strokeDasharray="2 3" />
            {NODES.map((n, i) => (
              <text
                key={`stage-num-${n.label}`}
                className="agent-num"
                x={n.x + 100}
                y={196}
                textAnchor="middle"
              >
                {String(i).padStart(2, "0")} · t+{Math.round((EDGE_DURATIONS.slice(0, i).reduce((a, b) => a + b, 0)) / 1000)}s
              </text>
            ))}
          </svg>
        </div>
      </Reveal>

      <Reveal delay={2}>
        <div className="dag-legend">
          {LEGEND.map((l) => (
            <div key={l.k} className="dag-legend-cell">
              <div className="k">{l.k}</div>
              <div className="v">{l.v}</div>
              <div className="note">{l.note}</div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

type DagNodeProps = {
  node: (typeof NODES)[number];
  index: number;
  hovered: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
};

function DagNode({ node, index, hovered, onHoverStart, onHoverEnd }: DagNodeProps) {
  const tooltipId = useId();
  const tooltipX = index >= NODES.length - 1 ? -184 : 16;
  return (
    <motion.g
      transform={`translate(${node.x},80)`}
      whileHover={{ scale: 1.03 }}
      whileFocus={{ scale: 1.03 }}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      onFocus={onHoverStart}
      onBlur={onHoverEnd}
      tabIndex={0}
      role="group"
      aria-label={`${node.label} — ${node.role.toLowerCase()} stage, source ${node.sub}`}
      aria-describedby={hovered ? tooltipId : undefined}
      style={{ cursor: "pointer", outline: "none", transformOrigin: "100px 30px", transformBox: "fill-box" }}
    >
      <rect
        className="agent-rect"
        width="200"
        height="60"
        fill={node.featured ? "rgba(232,80,58,0.12)" : undefined}
        stroke={hovered ? "var(--vermilion)" : node.featured ? "var(--vermilion)" : undefined}
        strokeWidth={hovered ? 1.5 : node.featured ? 1.5 : 1}
      />
      <text className="agent-name" x="100" y="28" textAnchor="middle">
        {node.label}
        {node.featured ? " ★" : ""}
      </text>
      <text className="agent-sub" x="100" y="48" textAnchor="middle">
        {node.sub}
      </text>
      {hovered ? (
        <foreignObject x={tooltipX} y={-72} width="200" height="76" style={{ overflow: "visible", pointerEvents: "auto" }}>
          <div id={tooltipId} role="tooltip" className="dag-tooltip-card">
            <div className="dag-tooltip-path">{node.sub}</div>
            <a
              className="dag-tooltip-link"
              href={`${REPO_BLOB}${node.sub}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              view source ↗
            </a>
          </div>
        </foreignObject>
      ) : null}
    </motion.g>
  );
}
