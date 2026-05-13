"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import filersData from "@/data/filers.generated.json";
import type { Citation, Filer } from "@/lib/types";
import { Reveal } from "@/components/ui/reveal";
import { MorphTarget } from "@/components/ui/morph-target";
import { useInkPressure } from "@/lib/use-ink-pressure";
import { useCiteDrawer } from "@/components/ui/cite-drawer";

const REFUSED_PAIR = ["Refused", "拒"] as const;
const MAX_PAIRS = 6;

/** One displayed JA-span ↔ EN-sentence pair, plus the data the cite drawer
 *  and the cursor preview need to resolve it. `globalCiteIdx` is the index of
 *  this citation across the whole memo, which is the key both
 *  `data-cursor-preview="cite:<id>:<n>"` and the drawer's `#cite=` hash use. */
interface ReadAlongPair {
  globalCiteIdx: number;
  en: string;
  citation: Citation;
}

function buildPairs(filer: Filer): ReadAlongPair[] {
  const out: ReadAlongPair[] = [];
  let citeCursor = 0;
  for (const line of filer.memo) {
    if (line.citations.length > 0 && out.length < MAX_PAIRS) {
      out.push({
        globalCiteIdx: citeCursor,
        en: line.displayText || line.text,
        citation: line.citations[0],
      });
    }
    citeCursor += line.citations.length;
  }
  return out;
}

/** Compact tab label: drop the corporate suffix from the romanised name so
 *  "Kintetsu Group Holdings" reads as "Kintetsu" in the tab strip. Falls
 *  back to the EDINET id when no verified English name exists (REFUSE.X). */
function tabLabel(filer: Filer): string {
  if (!filer.enName) return filer.customId;
  const trimmed = filer.enName
    .replace(/\s+(Group\s+Holdings|Holdings|Corporation|Company|Co\.?,?\s*Ltd\.?|Inc\.?|Ltd\.?)\b.*$/i, "")
    .trim();
  return trimmed || filer.enName;
}

function subsetLabel(subset: string): string {
  return subset.replace(/_/g, " ");
}

function glossLabel(section: string | undefined, page: string | undefined): string {
  const sec = (section || "").trim();
  const pg = (page || "").trim();
  if (sec && pg && pg !== "??") return sec.toUpperCase() + " · P" + pg;
  if (sec) return sec.toUpperCase();
  if (pg && pg !== "??") return "PAGE " + pg;
  return "EN MEMO";
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function ReadAlong() {
  // Named filers first (stronger first impression than the code-named
  // REFUSE.X row, which keeps its slot at the end for the curious).
  const filers = useMemo(() => {
    const all = filersData as Filer[];
    return [...all].sort((a, b) => Number(!a.enName) - Number(!b.enName));
  }, []);
  const pressure = useInkPressure();
  const openCite = useCiteDrawer();

  const [activeIdx, setActiveIdx] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const axisRef = useRef<HTMLDivElement>(null);
  const [activeYs, setActiveYs] = useState<{ y1: number; y2: number } | null>(null);
  const [axisHeight, setAxisHeight] = useState(600);

  const filer = filers[activeIdx] ?? filers[0];
  const pairs = useMemo(() => (filer ? buildPairs(filer) : []), [filer]);

  const selectFiler = (idx: number) => {
    setActiveIdx(idx);
    setHovered(null);
  };

  const onTabKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    let next = activeIdx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (activeIdx + 1) % filers.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (activeIdx - 1 + filers.length) % filers.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = filers.length - 1;
    else return;
    e.preventDefault();
    selectFiler(next);
    const buttons = tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]");
    buttons?.[next]?.focus();
  };

  const openPair = (p: ReadAlongPair) => {
    openCite({
      citation: p.citation,
      customId: filer.enName || filer.customId,
      globalIdx: p.globalCiteIdx,
    });
  };

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
      const matches = grid.querySelectorAll<HTMLElement>(`[data-pair="${hovered}"]`);
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
  }, [hovered, activeIdx]);

  if (!filer || pairs.length === 0) {
    return (
      <section className="readalong-section is-paper-anchor-left" id="readalong" data-paper-stage="readalong" data-paper-hide>
        <p className="section-lede">No memos available. Run pnpm content with eval data.</p>
      </section>
    );
  }

  const panelId = "ra-panel";

  return (
    <section className="readalong-section is-paper-anchor-left" id="readalong" data-paper-stage="readalong" data-paper-hide>
      <Reveal>
        <div className="section-tag">
          <span className="num">§ 02 · 5</span>
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
          Pick a filing. Every English sentence carries a footnote to the verbatim Japanese span it
          came from. Hover to see the pair, click to open the source. When the source doesn&rsquo;t
          support a claim the pipeline writes{" "}
          <MorphTarget pairs={REFUSED_PAIR} pressure={pressure} className="accent" />{" "}
          instead of asserting it.
        </p>
      </Reveal>

      <Reveal delay={1}>
        <div className="ra-tabs" role="tablist" aria-label="Choose a filing" ref={tabsRef}>
          {filers.map((f, i) => (
            <button
              key={f.customId}
              type="button"
              role="tab"
              id={`ra-tab-${f.customId}`}
              aria-selected={i === activeIdx}
              aria-controls={panelId}
              tabIndex={i === activeIdx ? 0 : -1}
              className={"ra-tab" + (i === activeIdx ? " is-active" : "")}
              onClick={() => selectFiler(i)}
              onKeyDown={onTabKey}
            >
              <span className="ra-tab__name">{tabLabel(f)}</span>
              <span className="ra-tab__sub mono">{subsetLabel(f.subset)}</span>
            </button>
          ))}
        </div>
        <div className="ra-grid" id={panelId} role="tabpanel" aria-labelledby={`ra-tab-${filer.customId}`}>
          <div className="ra-pane ja-pane">
            <div className="ra-head">
              <span>SOURCE · {filer.customId}</span>
              <span>{subsetLabel(filer.subset)}</span>
            </div>
            <div className="ra-text jp">
              {pairs.map((p) => (
                <span
                  key={p.globalCiteIdx}
                  className={"ra-span" + (hovered === p.globalCiteIdx ? " is-on" : "")}
                  role="button"
                  tabIndex={0}
                  aria-haspopup="dialog"
                  data-pair={p.globalCiteIdx}
                  data-gloss-label={glossLabel(p.citation.section, p.citation.pageRef)}
                  data-gloss-aux={truncate(p.en, 96)}
                  data-cursor-preview={`cite:${filer.customId}:${p.globalCiteIdx}`}
                  onMouseEnter={() => setHovered(p.globalCiteIdx)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => openPair(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPair(p);
                    }
                  }}
                >
                  {p.citation.span}{" "}
                </span>
              ))}
            </div>
          </div>

          <div className="ra-axis" aria-hidden="true" ref={axisRef}>
            <svg width="100%" height="100%" viewBox={`0 0 80 ${axisHeight}`} preserveAspectRatio="none">
              {hovered !== null && activeYs ? (
                <path
                  className="ra-conn is-on"
                  d={`M 0,${activeYs.y1} C 30,${activeYs.y1} 50,${activeYs.y2} 80,${activeYs.y2}`}
                />
              ) : (
                pairs.map((p, i) => {
                  const y = ((i + 0.5) / pairs.length) * axisHeight;
                  return <line key={p.globalCiteIdx} className="ra-guide" x1={0} x2={80} y1={y} y2={y} />;
                })
              )}
            </svg>
          </div>

          <div className="ra-pane en-pane">
            <div className="ra-head">
              <span>EN MEMO{filer.enName ? ` · ${filer.enName}` : ""}</span>
              <span>cohere {filer.coherence.toFixed(2)}</span>
            </div>
            <div className="ra-text">
              {pairs.map((p, i) => (
                <span
                  key={p.globalCiteIdx}
                  className={"ra-span" + (hovered === p.globalCiteIdx ? " is-on" : "")}
                  role="button"
                  tabIndex={0}
                  aria-haspopup="dialog"
                  data-pair={p.globalCiteIdx}
                  data-gloss-label={glossLabel(p.citation.section, p.citation.pageRef)}
                  data-gloss-aux={truncate(p.citation.span, 60)}
                  data-cursor-preview={`cite:${filer.customId}:${p.globalCiteIdx}`}
                  onMouseEnter={() => setHovered(p.globalCiteIdx)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => openPair(p)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openPair(p);
                    }
                  }}
                >
                  {p.en}
                  <sup>{i + 1}</sup>{" "}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
