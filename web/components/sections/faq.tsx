"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FAQ } from "@/data/manual";
import { EmphasisText } from "@/components/ui/emphasis-text";
import { Reveal } from "@/components/ui/reveal";
import { SealStamp } from "@/components/ui/seal-stamp";

const ARTEFACT_RE = /huggingface\.co\/|github\.com\/|data\/eval\//i;
const STAMP_SCALE = 22 / 54;

function answerString(segments: { text: string }[]): string {
  return segments.map((s) => s.text).join("");
}

export function Faq() {
  const reduced = useReducedMotion();
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <section className="faq-section is-paper-anchor-center" id="faq" data-paper-stage="faq" data-paper-hide>
      <Reveal>
        <div className="section-tag">
          <span className="num">§ 04 · 5</span>
          <span>Marginalia</span>
          <span className="ja">余白</span>
          <span className="rule" />
        </div>
      </Reveal>
      <Reveal>
        <h2 className="section-title">
          Marginalia.
        </h2>
      </Reveal>
      <Reveal>
        <p className="section-lede">
          The questions that come up after the demo. Answered short, with the receipts.
        </p>
      </Reveal>

      <div className="faq-grid">
        {FAQ.map((f, i) => {
          const isOpen = openId === i;
          const haystack = `${f.q} ${answerString(f.a)}`;
          const hasArtefact = ARTEFACT_RE.test(haystack);
          const showStamp = isOpen && hasArtefact;
          return (
            <Reveal key={i} delay={((i % 3) as 0 | 1 | 2)}>
              <article
                className={"faq-item" + (isOpen ? " is-open" : "")}
                data-faq-open={isOpen ? "true" : undefined}
              >
                <button
                  type="button"
                  className="faq-item__trigger"
                  data-magnet="hanko"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                  onClick={() =>
                    setOpenId((prev) => (prev === i ? null : i))
                  }
                >
                  <span className="qnum">Q · {String(i + 1).padStart(2, "0")}</span>
                  <h4>{f.q}</h4>
                  <span className="faq-item__indicator" aria-hidden="true">
                    {isOpen ? "−" : "+"}
                  </span>
                </button>
                <div
                  id={`faq-panel-${i}`}
                  className="faq-item__panel"
                  hidden={!isOpen}
                >
                  <p>
                    <EmphasisText segments={f.a} boldColor="var(--type-primary)" />
                  </p>
                  <AnimatePresence>
                    {showStamp ? (
                      <motion.span
                        key="stamp"
                        className="faq-item__stamp"
                        aria-hidden="true"
                        initial={
                          reduced
                            ? { opacity: 1, scale: STAMP_SCALE, rotate: -6 }
                            : { opacity: 0, scale: 0, rotate: 0 }
                        }
                        animate={{
                          opacity: 1,
                          scale: STAMP_SCALE,
                          rotate: -6,
                        }}
                        exit={
                          reduced
                            ? { opacity: 0 }
                            : { opacity: 0, scale: 0, rotate: 0 }
                        }
                        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <SealStamp
                          state="verified"
                          label={`${f.q} verified`}
                        />
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
