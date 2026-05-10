"use client";
import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "hero", label: "Hero" },
  { id: "problem", label: "Problem" },
  { id: "how", label: "How" },
  { id: "readalong", label: "Read-along" },
  { id: "repro", label: "Repro" },
  { id: "hardware", label: "Hardware" },
  { id: "access", label: "Access" },
];

export function ProgressRail() {
  const [active, setActive] = useState("hero");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive((visible[0].target as HTMLElement).id);
      },
      {
        rootMargin: "-30% 0px -30% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <nav
      aria-label="Section progress"
      className={"progress-rail" + (visible ? " is-visible" : "")}
    >
      {SECTIONS.map((s) => {
        const isActive = active === s.id;
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-label={s.label}
            aria-current={isActive ? "true" : undefined}
            data-label={s.label}
            data-magnet="hanko"
            className={"pr-dot" + (isActive ? " is-active" : "")}
          >
            <span className="pr-glyph" aria-hidden="true" />
          </a>
        );
      })}
    </nav>
  );
}
