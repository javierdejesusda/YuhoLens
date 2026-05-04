"use client";
import { useEffect, useState } from "react";

type SectionMeta = { id: string; num: string; ja: string };

// Section ids and § labels mirror the in-section `.section-tag` `.num` and
// `.ja` text. Keep these in sync with the corresponding section component.
// Hero / Access intentionally omitted — they bookend the document and don't
// carry a §-numbered chapter label, so the ribbon hides over those zones.
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
// it never competes with the hero. Reads which section the reader is in
// by picking the chapter whose vertical centre is closest to the
// viewport's centre — `intersectionRatio` favours shorter sections (their
// area-fraction inside any band is higher), so we recompute on each
// observer fire from `getBoundingClientRect`. The ribbon stays null when
// no observed section straddles the viewport centre — i.e. while the
// user is reading the hero or the access bookends, the ribbon hides.
export function MarginaliaRibbon() {
  const [active, setActive] = useState<SectionMeta | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const recompute = () => {
      const viewportCenter = window.innerHeight / 2;
      let best: { meta: SectionMeta; dist: number } | null = null;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        // Section must straddle the centre line — its top above and its
        // bottom below the viewport midpoint. Otherwise we're between
        // chapters or outside them entirely (hero / access).
        if (r.top > viewportCenter || r.bottom < viewportCenter) continue;
        const sectionCenter = r.top + r.height / 2;
        const dist = Math.abs(sectionCenter - viewportCenter);
        if (!best || dist < best.dist) best = { meta: s, dist };
      }
      setActive(best ? best.meta : null);
    };

    const obs = new IntersectionObserver(recompute, {
      // A thin centre band — only fires when sections cross the viewport
      // midpoint. Combined with the recompute walk above, this gives one
      // active section at a time without favouring shorter ones.
      rootMargin: "-50% 0px -49.99% 0px",
      threshold: 0,
    });
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    // Run once on mount so first paint isn't blank if the observer's
    // first fire is delayed.
    recompute();
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
