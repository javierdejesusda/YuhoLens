"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import memos from "@/data/memos.generated.json";
import type { Filer } from "@/lib/types";
import { Reveal } from "@/components/ui/reveal";
import { SealStamp } from "@/components/ui/seal-stamp";

const STAMP_SIZE = 20 / 54;

export function ReportsRail() {
  const cards = memos as Filer[];
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <section className="rail-section is-paper-anchor-right" id="reports" data-paper-stage="reports" data-paper-hide>
      <div className="container">
        <Reveal>
          <div className="section-tag">
            <span className="num">03 / 04</span>
            <span>The shelf</span>
            <span className="ja">本棚</span>
            <span className="rule" />
          </div>
        </Reveal>
        <Reveal>
          <h2 className="section-title">
            The shelf — <span className="accent">span-cited memos</span> from real EDINET rows.
          </h2>
        </Reveal>
      </div>

      <div className="rail-track" aria-label="Sample memos">
        {cards.map((m) => {
          const isHovered = hovered === m.customId;
          return (
            <article
              className="report-card"
              key={m.customId}
              onMouseEnter={() => setHovered(m.customId)}
              onMouseLeave={() => setHovered((h) => (h === m.customId ? null : h))}
              onFocus={() => setHovered(m.customId)}
              onBlur={() => setHovered((h) => (h === m.customId ? null : h))}
            >
              <div className="head">
                <span>EDINET · {m.subset}</span>
                <span className="badge">SHIPPED</span>
              </div>
              <h4 className="ja-name jp">{m.jpName}</h4>
              <div className="romaji">{m.customId}</div>
              <p className="excerpt">
                {m.memo[0]?.text.slice(0, 220) ?? ""}
                {(m.memo[0]?.text.length ?? 0) > 220 ? "…" : ""}
              </p>
              <p className="excerpt">
                {m.memo[1]?.text.slice(0, 160) ?? ""}
                {(m.memo[1]?.text.length ?? 0) > 160 ? "…" : ""}
              </p>
              <div className="ja-source jp">
                {m.jpSourceExcerpt?.slice(0, 80) ?? "—"}…
              </div>
              <div className="read-more">
                <span>Read full memo</span>
                <span className="arr">→</span>
              </div>
              <span className="report-card__stamp" aria-hidden="true">
                <AnimatePresence>
                  {isHovered ? (
                    <motion.span
                      key="stamp"
                      className="report-card__stamp-inner"
                      initial={
                        reduced
                          ? { scale: STAMP_SIZE, rotate: 8, opacity: 1 }
                          : { scale: 0, rotate: 0, opacity: 0 }
                      }
                      animate={{ scale: STAMP_SIZE, rotate: 8, opacity: 1 }}
                      exit={reduced ? { opacity: 0 } : { scale: 0, rotate: 0, opacity: 0 }}
                      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <SealStamp
                        state="verified"
                        label={`${m.enName || m.jpName} verified`}
                      />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>
            </article>
          );
        })}
      </div>

      <div className="rail-foot">
        <span>EDINET · TSE · JFSA</span>
        <span>Drag · scroll · hover</span>
      </div>
    </section>
  );
}
