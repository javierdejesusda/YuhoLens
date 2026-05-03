"use client";
import { useLayoutEffect, useRef, useState } from "react";
import filersData from "@/data/filers.generated.json";
import type { Filer } from "@/lib/types";
import { Reveal } from "@/components/ui/reveal";
import { MorphTarget } from "@/components/ui/morph-target";
import { useInkPressure } from "@/lib/use-ink-pressure";

const REFUSED_PAIR = ["Refused", "拒"] as const;

export function ReadAlong() {
  const filers = filersData as Filer[];
  const filer = filers.find((f) => f.customId === "REFUSE.X") ?? filers[0];
  const pressure = useInkPressure();
  const [hovered, setHovered] = useState<number | null>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const [activeYs, setActiveYs] = useState<{ y1: number; y2: number } | null>(
    null,
  );
  const [axisHeight, setAxisHeight] = useState(600);

  const pairs = filer
    ? filer.memo
        .flatMap((line, i) =>
          line.citations.map((c, j) => ({
            pair: i * 10 + j,
            en: line.text,
            jp: c.span,
            page: c.pageRef,
            refused: line.refused,
          })),
        )
        .slice(0, 5)
    : [];

  useLayoutEffect(() => {
    const axisEl = axisRef.current;
    if (!axisEl) return;
    const recompute = () => {
      const axisRect = axisEl.getBoundingClientRect();
      setAxisHeight(axisRect.height || 600);
      if (hovered === null) {
        setActiveYs(null);
        return;
      }
      const grid = axisEl.parentElement;
      if (!grid) return;
      const matches = grid.querySelectorAll<HTMLElement>(
        `[data-pair="${hovered}"]`,
      );
      let leftEl: HTMLElement | null = null;
      let rightEl: HTMLElement | null = null;
      matches.forEach((el) => {
        if (el.closest(".ja-pane")) leftEl = el;
        else if (el.closest(".en-pane")) rightEl = el;
      });
      if (!leftEl || !rightEl) {
        setActiveYs(null);
        return;
      }
      const leftRect = (leftEl as HTMLElement).getBoundingClientRect();
      const rightRect = (rightEl as HTMLElement).getBoundingClientRect();
      const y1 = leftRect.top + leftRect.height / 2 - axisRect.top;
      const y2 = rightRect.top + rightRect.height / 2 - axisRect.top;
      setActiveYs({ y1, y2 });
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(axisEl);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [hovered]);

  if (!filer) {
    return (
      <section className="readalong-section is-paper-anchor-left" id="readalong" data-paper-stage="readalong" data-paper-hide>
        <p className="section-lede">
          No memos available. Run pnpm content with eval data.
        </p>
      </section>
    );
  }

  return (
    <section className="readalong-section is-paper-anchor-left" id="readalong" data-paper-stage="readalong" data-paper-hide>
      <Reveal>
        <div className="section-tag">
          <span className="num">02·8 / 04</span>
          <span>Read along</span>
          <span className="ja">対訳</span>
          <span className="rule" />
        </div>
      </Reveal>
      <Reveal>
        <h2 className="section-title">
          Verbatim Japanese · <span className="accent">cited English.</span>
        </h2>
      </Reveal>
      <Reveal>
        <p className="section-lede">
          Hover any span to see its mate.{" "}
          <MorphTarget pairs={REFUSED_PAIR} pressure={pressure} className="accent" />{" "}
          claims show inline — the source didn&rsquo;t support them, so we don&rsquo;t.
        </p>
      </Reveal>

      <Reveal delay={1}>
        <div className="ra-grid">
          <div className="ra-pane ja-pane">
            <div className="ra-head">
              <span>SOURCE · {filer.customId}</span>
              <span>{filer.subset}</span>
            </div>
            <div className="ra-text jp">
              {pairs.map((p) => (
                <span
                  key={p.pair}
                  className={"ra-span" + (hovered === p.pair ? " is-on" : "")}
                  data-pair={p.pair}
                  onMouseEnter={() => setHovered(p.pair)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {p.jp}
                  {" "}
                </span>
              ))}
            </div>
          </div>

          <div className="ra-axis" aria-hidden="true" ref={axisRef}>
            <svg
              width="100%"
              height="100%"
              viewBox={`0 0 80 ${axisHeight}`}
              preserveAspectRatio="none"
            >
              {hovered !== null && activeYs ? (
                <path
                  className="ra-conn is-on"
                  d={`M 0,${activeYs.y1} C 30,${activeYs.y1} 50,${activeYs.y2} 80,${activeYs.y2}`}
                />
              ) : (
                pairs.map((p, i) => {
                  const y =
                    ((i + 0.5) / pairs.length) * axisHeight;
                  return (
                    <line
                      key={p.pair}
                      className="ra-guide"
                      x1={0}
                      x2={80}
                      y1={y}
                      y2={y}
                    />
                  );
                })
              )}
            </svg>
          </div>

          <div className="ra-pane en-pane">
            <div className="ra-head">
              <span>EN MEMO</span>
              <span>cohere {filer.coherence.toFixed(2)}</span>
            </div>
            <div className="ra-text">
              {pairs.map((p, i) => (
                <span
                  key={p.pair}
                  className={"ra-span" + (hovered === p.pair ? " is-on" : "")}
                  data-pair={p.pair}
                  onMouseEnter={() => setHovered(p.pair)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {p.refused ? (
                    <span className="mono" style={{ color: "var(--vermilion)", marginRight: 8 }}>
                      [evidence insufficient]
                    </span>
                  ) : null}
                  {p.en}
                  <sup>{i + 1}</sup>
                  {" "}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
