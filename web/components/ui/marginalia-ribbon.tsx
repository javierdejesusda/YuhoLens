"use client";
import { useEffect, useState } from "react";

type SectionMeta = { id: string; num: string; ja: string };

// Section-header data, mirrored from each section's `<div className="section-tag">`.
// Phase-4 ships these in the post-Phase-5 §-numbering format so the ribbon
// reads coherently from day one; Phase 5 brings the in-section tags into
// alignment. Hero / Access intentionally omitted — they bookend the document
// and don't carry a §-numbered chapter label.
const SECTIONS: SectionMeta[] = [
  { id: "problem", num: "§ 01", ja: "読まれない" },
  { id: "how", num: "§ 02", ja: "仕組み" },
  { id: "repro", num: "§ 02 · 3", ja: "明細" },
  { id: "demo", num: "§ 02 · 5", ja: "実演" },
  { id: "hardware", num: "§ 02 · 6", ja: "適合" },
  { id: "dag", num: "§ 02 · 7", ja: "骨格" },
  { id: "readalong", num: "§ 02 · 8", ja: "対訳" },
  { id: "kg2", num: "§ 02 · 9", ja: "実証" },
  { id: "reports", num: "§ 03", ja: "本棚" },
  { id: "failures", num: "§ 03 · 5", ja: "節度" },
  { id: "manifest", num: "§ 04", ja: "節度" },
  { id: "faq", num: "§ 04 · 5", ja: "余白" },
];

// Editorial running header. Sits in the top-right gutter just below the
// topbar, fades in 1.5 s after page-load (same delay as ProgressRail) so
// it never competes with the hero. Tracks the section currently dominant
// in the viewport via an IntersectionObserver tuned to the centre band
// (rootMargin: -30% 0px -30% 0px) so it reads what the user is reading,
// not what is just barely on screen. Hidden on tablet/mobile so the
// reduced viewport keeps the typographic spine.
export function MarginaliaRibbon() {
  const [active, setActive] = useState<SectionMeta | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const inView = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (inView[0]) {
          const id = (inView[0].target as HTMLElement).id;
          const meta = SECTIONS.find((s) => s.id === id);
          if (meta) setActive(meta);
        }
      },
      { rootMargin: "-30% 0px -30% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  if (!active) return null;

  return (
    <aside
      className={"marginalia-ribbon" + (visible ? " is-visible" : "")}
      aria-hidden="true"
    >
      <span className="marginalia-ribbon__num">{active.num}</span>
      <span className="marginalia-ribbon__sep">·</span>
      <span className="marginalia-ribbon__ja" lang="ja">{active.ja}</span>
    </aside>
  );
}
