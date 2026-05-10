"use client";
import { useEffect, useState } from "react";
import { SECTIONS, type SectionMeta } from "@/lib/sections";

const MARGINALIA_SECTIONS = SECTIONS.filter((s) => s.inMarginalia);

// Editorial running header. Sits in the top-right gutter just below the
// topbar, fades in 1.5 s after page-load (same delay as ProgressRail) so
// it never competes with the hero. Reads which section the reader is in
// by picking the chapter whose vertical centre is closest to the
// viewport's centre.
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
      for (const s of MARGINALIA_SECTIONS) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top > viewportCenter || r.bottom < viewportCenter) continue;
        const sectionCenter = r.top + r.height / 2;
        const dist = Math.abs(sectionCenter - viewportCenter);
        if (!best || dist < best.dist) best = { meta: s, dist };
      }
      setActive(best ? best.meta : null);
    };

    const obs = new IntersectionObserver(recompute, {
      rootMargin: "-50% 0px -49.99% 0px",
      threshold: 0,
    });
    MARGINALIA_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
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
