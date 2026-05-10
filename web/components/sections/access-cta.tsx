"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/ui/reveal";
import { SealStamp } from "@/components/ui/seal-stamp";

const PULSE_SCALE = 70 / 54;

type UseCard = {
  num: string;
  audience: string;
  action: string;
  href: string;
  artifact: string;
  previewKey: string;
};

const USE_CARDS: UseCard[] = [
  {
    num: "01",
    audience: "Read a memo",
    action: "BF16 weights for the lab",
    href: "https://huggingface.co/javierdejesusda/yuholens-14b",
    artifact: "HUGGINGFACE · BF16 →",
    previewKey: "hf:yuholens-14b",
  },
  {
    num: "02",
    audience: "Run it locally",
    action: "GGUF Q4_K_M for the laptop",
    href: "https://huggingface.co/javierdejesusda/yuholens-14b-GGUF",
    artifact: "HUGGINGFACE · GGUF →",
    previewKey: "hf:yuholens-14b-GGUF",
  },
  {
    num: "03",
    audience: "Reproduce the eval",
    action: "Full pipeline for the auditor",
    href: "https://github.com/javierdejesusda/YuhoLens",
    artifact: "GITHUB →",
    previewKey: "gh:YuhoLens",
  },
];

export function AccessCta() {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState(false);

  return (
    <section
      className="footer-cta is-paper-anchor-center"
      id="access"
      data-paper-stage="access"
      data-paper-hide
    >
      <div className="inner">
        <Reveal>
          <div className="section-tag access-tag">
            <span className="num">§ 05</span>
            <span>Get it</span>
            <span className="ja">開示</span>
            <span className="rule" />
          </div>
        </Reveal>

        <Reveal>
          <h2>
            Open weights.<br />
            Open eval. <span className="accent">Open ledger.</span>
          </h2>
        </Reveal>

        <Reveal delay={1}>
          <p className="sub">
            BF16 weights for the lab, GGUF Q4–Q8 for the laptop, and the full eval pipeline for
            the auditor. <span className="accent">MIT-licensed today.</span>
          </p>
        </Reveal>

        <Reveal delay={2}>
          <div className="access-grid" role="list" aria-label="How to use YuhoLens">
            {USE_CARDS.map((card) => (
              <a
                key={card.num}
                className="access-card"
                role="listitem"
                href={card.href}
                target="_blank"
                rel="noopener noreferrer"
                data-cursor-preview={card.previewKey}
              >
                <span className="mono access-card-num">{card.num}</span>
                <span className="access-card-audience">{card.audience}</span>
                <span className="access-card-action">{card.action}</span>
                <span className="mono access-card-link">{card.artifact}</span>
              </a>
            ))}
          </div>
        </Reveal>

        <Reveal delay={3}>
          <div
            style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}
          >
            <span
              className="cta-pulse-wrap"
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              onFocus={() => setHover(true)}
              onBlur={() => setHover(false)}
            >
              <AnimatePresence>
                {hover && !reduced ? (
                  <motion.span
                    key="pulse"
                    className="cta-pulse-seal"
                    aria-hidden="true"
                    initial={{ opacity: 0, scale: PULSE_SCALE * 0.92 }}
                    animate={{ opacity: 0.85, scale: PULSE_SCALE * 1.05 }}
                    exit={{ opacity: 0, scale: PULSE_SCALE * 0.92 }}
                    transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <SealStamp state="verified" label="entry stamp" />
                  </motion.span>
                ) : null}
              </AnimatePresence>
              <a
                className="btn-primary cta-pulse-button"
                href="https://huggingface.co/javierdejesusda/yuholens-14b"
                target="_blank"
                rel="noopener noreferrer"
                data-cursor-preview="hf:yuholens-14b"
              >
                Read a sample memo <span className="arr">→</span>
              </a>
            </span>
          </div>
        </Reveal>

        <p className="small mono access-colophon">
          YuhoLens v2.5 · MIT (code) · pfnet/nekomata-14b-pfn-qfin (base · Qwen 1) · 1,910
          EDINET-Bench rows · Built for the AMD Developer Hackathon
        </p>
      </div>
    </section>
  );
}
