"use client";
import { useRef, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import failures from "@/data/failures.generated.json";
import type { FailureCase } from "@/lib/types";
import { EmphasisText } from "@/components/ui/emphasis-text";
import { Reveal } from "@/components/ui/reveal";
import { SealStamp } from "@/components/ui/seal-stamp";

function FcOut({ block }: { block: string }) {
  // Highlight inline `OK` / `[evidence …]` markers as .ok / .lab spans.
  const parts = block.split(/(\bOK\b|\[evidence insufficient\])/);
  return (
    <pre className="fc-out">
      {parts.map((p, i) => {
        if (p === "OK") return <span key={i} className="ok">OK</span>;
        if (p === "[evidence insufficient]") return <span key={i} className="ok">[evidence insufficient]</span>;
        return <span key={i}>{p}</span>;
      })}
    </pre>
  );
}

function refusalReasonFor(c: FailureCase): string {
  const t = c.type.toLowerCase();
  if (t.includes("hallucinat")) return "no span";
  if (t.includes("ambiguous")) return "span clash";
  if (t.includes("contradict")) return "kept honest";
  return "refused";
}

type FailureCardProps = {
  card: FailureCase;
  reduced: boolean;
};

function FailureCard({ card, reduced }: FailureCardProps) {
  const reason = refusalReasonFor(card);
  return (
    <motion.article
      className="failure-card"
      tabIndex={0}
      role="article"
      aria-label={`${card.num}: ${card.type}. ${card.caughtBy}.`}
      whileHover="hover"
      whileFocus="hover"
      initial="rest"
      animate="rest"
    >
      <div className="fc-num">{card.num} / {card.type}</div>
      <span className="fc-tag">{card.caughtBy}</span>
      <h3>
        <EmphasisText
          segments={card.headline}
          emColor="var(--vermilion)"
        />
      </h3>
      <p className="fc-claim">{card.claim}</p>
      <FcOut block={card.outputBlock} />
      <div className="mono failure-card__source">
        SOURCE · {card.customId}
      </div>

      <motion.span
        className="failure-card__refused-stamp"
        aria-hidden="true"
        variants={
          reduced
            ? {
                rest: { opacity: 0 },
                hover: { opacity: 1 },
              }
            : {
                rest: { opacity: 0, rotate: -8, scale: 0.9 },
                hover: { opacity: 1, rotate: -22, scale: 1 },
              }
        }
        transition={
          reduced
            ? { duration: 0.08, ease: "linear" }
            : { type: "spring", stiffness: 300, damping: 16, mass: 0.6 }
        }
      >
        <SealStamp state="refused" label={reason} />
      </motion.span>
    </motion.article>
  );
}

export function FailureGallery() {
  const cases = failures as FailureCase[];
  const reducedMotion = useReducedMotion() ?? false;
  const trackRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>(".failure-card");
    const step = card ? card.getBoundingClientRect().width + 32 : 320;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      track.scrollBy({ left: step, behavior: reducedMotion ? "auto" : "smooth" });
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      track.scrollBy({ left: -step, behavior: reducedMotion ? "auto" : "smooth" });
    } else if (e.key === "Home") {
      e.preventDefault();
      track.scrollTo({ left: 0, behavior: reducedMotion ? "auto" : "smooth" });
    } else if (e.key === "End") {
      e.preventDefault();
      track.scrollTo({ left: track.scrollWidth, behavior: reducedMotion ? "auto" : "smooth" });
    }
  }

  return (
    <section className="fail-section is-paper-anchor-left" id="failures" data-paper-stage="failures">
      <Reveal>
        <div className="section-tag">
          <span className="num">03·5 / 04</span>
          <span>Where it refuses</span>
          <span className="ja">節度</span>
          <span className="rule" />
        </div>
      </Reveal>
      <Reveal>
        <h2 className="section-title">
          Three honest <span className="accent">failures.</span>
        </h2>
      </Reveal>
      <Reveal>
        <p className="section-lede">
          Every memo that ships goes through the grounder. These are the cases the grounder caught — kept honest, not hidden.
        </p>
      </Reveal>

      <div
        ref={trackRef}
        className="failure-deck"
        role="region"
        aria-label="Failure cases — use arrow keys to navigate"
        onKeyDown={onKeyDown}
      >
        {cases.map((c) => (
          <FailureCard key={c.num} card={c} reduced={reducedMotion} />
        ))}
      </div>
    </section>
  );
}
