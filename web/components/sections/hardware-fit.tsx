"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { motion, useInView, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { Reveal } from "@/components/ui/reveal";

type Quant = {
  id: string;
  label: string;
  size: number;
  blurb: string;
};

const QUANTS: Quant[] = [
  { id: "Q3_K_M", label: "Q3_K_M", size: 7.18, blurb: "Smallest fit — 8 GB VRAM laptops" },
  { id: "Q4_K_M", label: "Q4_K_M", size: 8.81, blurb: "Default · best size/quality trade" },
  { id: "Q5_K_M", label: "Q5_K_M", size: 9.94, blurb: "Tighter rounding · ~12 GB VRAM" },
  { id: "Q6_K", label: "Q6_K", size: 11.46, blurb: "Near-lossless · 12–16 GB VRAM" },
  { id: "Q8_0", label: "Q8_0", size: 14.03, blurb: "Reference quant · 16 GB VRAM" },
];

const PAPER_RGB: [number, number, number] = [244, 234, 211];
const VERMILION_RGB: [number, number, number] = [232, 80, 58];
const MIN_SIZE = QUANTS[0].size;
const MAX_SIZE = QUANTS[QUANTS.length - 1].size;
const Q4_BASELINE = QUANTS[1].size;
const ROW_STAGGER_MS = 90;
const SPRING_CONFIG = { stiffness: 120, damping: 18, mass: 1 } as const;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpColor(t: number): string {
  const r = Math.round(lerp(PAPER_RGB[0], VERMILION_RGB[0], t));
  const g = Math.round(lerp(PAPER_RGB[1], VERMILION_RGB[1], t));
  const b = Math.round(lerp(PAPER_RGB[2], VERMILION_RGB[2], t));
  return `rgb(${r}, ${g}, ${b})`;
}

function sizeToPct(size: number): number {
  return (size / MAX_SIZE) * 100;
}

function colorTone(size: number): number {
  return (size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE);
}

type QuantBarProps = {
  quant: Quant;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  inView: boolean;
  prefersReducedMotion: boolean;
};

function QuantBar({
  quant,
  index,
  isOpen,
  onToggle,
  inView,
  prefersReducedMotion,
}: QuantBarProps) {
  const targetPct = sizeToPct(quant.size);
  const tone = colorTone(quant.size);
  const fillColor = lerpColor(tone);
  const [mounted, setMounted] = useState(false);
  const widthSpring = useSpring(0, SPRING_CONFIG);
  const widthCss = useTransform(widthSpring, (v) => `${v}%`);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (prefersReducedMotion) {
      widthSpring.jump(targetPct);
      return;
    }
    if (!inView) return;
    const timer = window.setTimeout(() => {
      widthSpring.set(targetPct);
    }, index * ROW_STAGGER_MS);
    return () => window.clearTimeout(timer);
  }, [mounted, inView, prefersReducedMotion, targetPct, index, widthSpring]);

  const fillWidth = mounted ? widthCss : "0%";

  const baselineDelta = ((quant.size - Q4_BASELINE) / Q4_BASELINE) * 100;
  const deltaSign = baselineDelta > 0 ? "+" : baselineDelta < 0 ? "−" : "±";
  const deltaText =
    quant.id === "Q4_K_M"
      ? "baseline"
      : `${deltaSign}${Math.abs(baselineDelta).toFixed(1)}% vs Q4_K_M`;

  const rowStyle: CSSProperties = {
    "--tone": tone.toFixed(3),
  } as CSSProperties;

  return (
    <div className="hw-row hw-quant" data-tone={tone.toFixed(2)} style={rowStyle}>
      <div className="hw-name">
        <b>{quant.label}</b>
      </div>
      <button
        type="button"
        className={`hw-bar hw-bar-button has-cap${isOpen ? " is-open" : ""}`}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={`hw-detail-${quant.id}`}
        aria-label={`${quant.label} · ${quant.size.toFixed(2)} GiB · ${
          isOpen ? "hide" : "show"
        } detail`}
      >
        <motion.div
          className="hw-fill"
          style={{
            width: fillWidth,
            background: `linear-gradient(90deg, ${lerpColor(Math.max(0, tone - 0.18))}, ${fillColor})`,
            color: tone > 0.45 ? "var(--paper-warm)" : "var(--ink-deep)",
          }}
        >
          <span className="hw-fill-num">{quant.size.toFixed(2)} GiB</span>
        </motion.div>
        <span className="hw-cap">{quant.id}</span>
      </button>
      <div />
      <div
        id={`hw-detail-${quant.id}`}
        className={`hw-detail${isOpen ? " is-open" : ""}`}
        role="region"
        aria-hidden={!isOpen}
      >
        <motion.div
          className="hw-detail-inner"
          initial={false}
          animate={{
            height: isOpen ? "auto" : 0,
            opacity: isOpen ? 1 : 0,
          }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          style={{ overflow: "hidden" }}
        >
          <div className="hw-detail-grid">
            <div>
              <span className="hw-detail-key">size</span>
              <span className="hw-detail-val">{quant.size.toFixed(2)} GiB</span>
            </div>
            <div>
              <span className="hw-detail-key">vs Q4_K_M</span>
              <span className="hw-detail-val">{deltaText}</span>
            </div>
            <div className="hw-detail-blurb">{quant.blurb}</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export function HardwareFit() {
  const barsRef = useRef<HTMLDivElement>(null);
  const inView = useInView(barsRef, { once: true, amount: 0.4 });
  const prefersReducedMotion = useReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section
      className="hw-section is-paper-anchor-left"
      id="hardware"
      data-paper-stage="hardware"
      data-paper-hide
    >
      <Reveal>
        <div className="section-tag">
          <span className="num">02·6 / 04</span>
          <span>Hardware fit</span>
          <span className="ja">適合</span>
          <span className="rule" />
        </div>
      </Reveal>

      <div className="hw-grid">
        <Reveal>
          <div>
            <h2 className="section-title">
              One laptop GPU <span className="accent">runs it.</span>
            </h2>
            <p className="section-lede">
              Five GGUF quantizations ship with the model — from a 7.18 GiB Q3_K_M that fits an
              8 GB-VRAM laptop to a 14.03 GiB Q8_0 reference quant. Click a bar for size delta
              against the Q4_K_M baseline.
            </p>
            <p className="hw-throughput" aria-label="Throughput on consumer hardware">
              <span className="hw-throughput-num">10.06 tok/s</span>
              <span className="hw-throughput-rest">
                {" on RTX 4070 Laptop (Q3_K_M)"}
              </span>
            </p>
          </div>
        </Reveal>

        <div className="hw-bars" ref={barsRef}>
          {QUANTS.map((q, i) => (
            <QuantBar
              key={q.id}
              quant={q}
              index={i}
              isOpen={openId === q.id}
              onToggle={() => setOpenId((cur) => (cur === q.id ? null : q.id))}
              inView={inView}
              prefersReducedMotion={!!prefersReducedMotion}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
