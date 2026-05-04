"use client";
import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { MANIFESTO } from "@/data/manual";
import { Reveal } from "@/components/ui/reveal";

function Tenet({
  index,
  num,
  head,
  body,
}: {
  index: number;
  num: string;
  head: string;
  body: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const delay = (Math.min(index, 3) as 0 | 1 | 2 | 3);
  const cls = reduced
    ? "pair ink-drip-static"
    : "pair" + (inView ? " ink-drip-active" : "");

  return (
    <Reveal delay={delay}>
      <div ref={ref} className={cls}>
        <span className="num">{num}</span>
        <div>
          <h4>
            <span className="ink-drip-highlight">{head}.</span>
          </h4>
          {body ? <p>{body}</p> : null}
        </div>
      </div>
    </Reveal>
  );
}

// Hand-drawn outer ring: 8 cubic Beziers around a 32-radius circle,
// each control point slightly perturbed off the ideal so the ring
// reads as "pressed" not "vector". The numbers are tuned by eye —
// every "perfect" hanko circle on the web looks corporate; this one
// has the wobble of a stamp that bounced once.
const SEAL_RING_OUTER =
  "M 32 4 C 41 4 50 8 56 14 C 60 20 60 27 60 33 C 60 41 56 50 50 56 C 44 60 37 60 31 60 C 23 60 14 56 8 50 C 4 44 4 37 4 31 C 4 23 8 14 14 8 C 20 4 27 4 32 4 Z";
const SEAL_RING_INNER =
  "M 32 9 C 39 9 47 12 51 17 C 55 22 55 28 55 33 C 55 40 51 48 46 52 C 41 55 36 55 31 55 C 24 55 17 52 13 47 C 9 42 9 36 9 31 C 9 24 12 17 17 13 C 22 9 27 9 32 9 Z";

// 宣 — sen, "to declare". The vermilion watermark behind the manifest
// title: a hanko punched onto a declaration. Same hand-drawn ring as
// the closing 結 seal so the two read as a matched pair, opening
// statement and signing-off.
function DeclarationSeal() {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const initial = reduced
    ? { opacity: 0.18, scale: 1, rotate: -6 }
    : { opacity: 0, scale: 1.4, rotate: -8 };
  const animate = inView
    ? { opacity: 0.18, scale: 1, rotate: -6 }
    : initial;
  return (
    <span ref={ref} className="manifest-stamp" aria-hidden="true">
      <motion.span
        className="manifest-stamp__seal"
        initial={initial}
        animate={animate}
        transition={
          reduced
            ? { duration: 0.18 }
            : { type: "spring", stiffness: 240, damping: 14, mass: 0.7 }
        }
      >
        <svg
          className="manifest-stamp__svg"
          viewBox="0 0 64 64"
          aria-hidden="true"
        >
          <path className="manifest-stamp__ring" d={SEAL_RING_OUTER} />
          <path
            className="manifest-stamp__ring manifest-stamp__ring--inner"
            d={SEAL_RING_INNER}
          />
          <text
            className="manifest-stamp__glyph"
            x="32"
            y="42"
            textAnchor="middle"
            lang="ja"
          >
            宣
          </text>
        </svg>
      </motion.span>
      {!reduced && inView ? (
        <span className="manifest-stamp__ripple" aria-hidden="true" />
      ) : null}
    </span>
  );
}

function ClosingSeal() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const initial = reduced
    ? { opacity: 1, scale: 1, rotate: 6 }
    : { opacity: 0, scale: 1.45, rotate: -8 };
  const animate = inView
    ? { opacity: 1, scale: 1, rotate: 6 }
    : initial;
  return (
    <div ref={ref} className="manifest-close" aria-hidden="true">
      <span className="manifest-close__rule" />
      <motion.span
        className="manifest-close__seal"
        initial={initial}
        animate={animate}
        transition={
          reduced
            ? { duration: 0.18 }
            : { type: "spring", stiffness: 280, damping: 16, mass: 0.6 }
        }
      >
        <svg
          className="manifest-close__seal-svg"
          viewBox="0 0 64 64"
          aria-hidden="true"
        >
          <path className="manifest-close__seal-ring" d={SEAL_RING_OUTER} />
          <path
            className="manifest-close__seal-ring manifest-close__seal-ring--inner"
            d={SEAL_RING_INNER}
          />
          {/* Ink-splatter dots: small irregular bleeds around the rim,
              the kind a real hanko leaves when the ink pad isn't
              perfectly even. Fixed positions, not random — so reduced-
              motion and SSR snapshots are stable. */}
          <circle className="manifest-close__seal-dot" cx="14" cy="22" r="0.9" />
          <circle className="manifest-close__seal-dot" cx="52" cy="18" r="0.6" />
          <circle className="manifest-close__seal-dot" cx="48" cy="50" r="0.8" />
          <circle className="manifest-close__seal-dot" cx="18" cy="52" r="0.5" />
          <text
            className="manifest-close__seal-glyph"
            x="32"
            y="42"
            textAnchor="middle"
            lang="ja"
          >
            結
          </text>
        </svg>
      </motion.span>
      <span className="manifest-close__caption">
        end of document <span className="manifest-close__caption-jp" lang="ja">完</span>
      </span>
      <span className="manifest-close__rule" />
    </div>
  );
}

export function Manifest() {
  return (
    <section className="manifest is-paper-anchor-left" id="manifest" data-paper-stage="manifest">
      <div className="left">
        <DeclarationSeal />
        <Reveal>
          <div className="section-tag">
            <span className="num">§ 04</span>
            <span>The discipline</span>
            <span className="ja">節度</span>
            <span className="rule" />
          </div>
        </Reveal>
        <Reveal>
          <h2 className="section-title">
            A reading discipline,<br />
            <span className="accent">not a chatbot.</span>
          </h2>
        </Reveal>
        <Reveal delay={1}>
          <p className="section-lede">
            We didn&rsquo;t ship a chatbot. We shipped a reading discipline that refuses claims it can&rsquo;t cite — and a public ledger that proves it did.
          </p>
        </Reveal>
        <Reveal delay={2}>
          <p className="sig">
            朱 / SHU — <span className="accent">vermilion</span>, the seal of the verified spec
          </p>
        </Reveal>
      </div>

      <div className="right">
        {MANIFESTO.map((m, i) => {
          const head = m.text.split(".")[0].trim();
          const body = m.text.split(".").slice(1).join(".").trim();
          return (
            <Tenet
              key={m.i}
              index={i}
              num={m.i}
              head={head}
              body={body}
            />
          );
        })}
        <ClosingSeal />
      </div>
    </section>
  );
}
