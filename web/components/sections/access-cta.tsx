"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/ui/reveal";
import { SealStamp } from "@/components/ui/seal-stamp";

const PULSE_SCALE = 70 / 54;

export function AccessCta() {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState(false);

  return (
    <section className="footer-cta is-paper-anchor-center" id="access" data-paper-stage="access" data-paper-hide>
      <div className="inner">
        <Reveal>
          <h2>
            Open weights.<br />
            Open eval. <span className="accent">Open ledger.</span>
          </h2>
        </Reveal>
        <Reveal delay={1}>
          <p className="sub">
            BF16 weights, GGUF quants, the whole eval pipeline, and every script that produced the receipt — all public, MIT, today.
          </p>
        </Reveal>
        <Reveal delay={2}>
          <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap" }}>
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
              >
                Read a sample memo <span className="arr">→</span>
              </a>
            </span>
          </div>
        </Reveal>
        <Reveal delay={3}>
          <div
            style={{
              marginTop: 32,
              display: "flex",
              justifyContent: "center",
              gap: 28,
              flexWrap: "wrap",
            }}
          >
            <a
              className="mono"
              href="https://huggingface.co/javierdejesusda/yuholens-14b"
              target="_blank"
              rel="noopener noreferrer"
            >
              HUGGINGFACE · BF16 →
            </a>
            <a
              className="mono"
              href="https://huggingface.co/javierdejesusda/yuholens-14b-GGUF"
              target="_blank"
              rel="noopener noreferrer"
            >
              HUGGINGFACE · GGUF →
            </a>
            <a
              className="mono"
              href="https://github.com/javierdejesusda/YuhoLens"
              target="_blank"
              rel="noopener noreferrer"
            >
              GITHUB →
            </a>
          </div>
        </Reveal>
        <p className="small">YuhoLens v2.5 · MIT (code) · pfnet/nekomata-14b-pfn-qfin (base · Qwen 1)</p>
      </div>
    </section>
  );
}
