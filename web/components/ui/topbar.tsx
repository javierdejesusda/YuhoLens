"use client";
import { useEffect, useState } from "react";
import { useScrollState } from "@/lib/use-scroll-state";

const LINKS = [
  { href: "#problem", label: "Problem" },
  { href: "#how", label: "How it works" },
  { href: "#reports", label: "Reports" },
  { href: "#manifest", label: "Manifest" },
];

export function TopBar() {
  const { y } = useScrollState();
  const [innerH, setInnerH] = useState(
    typeof window !== "undefined" ? window.innerHeight : 0,
  );
  const [preloaderTick, setPreloaderTick] = useState(0);

  useEffect(() => {
    const onResize = () => setInnerH(window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    const onPreloaderDone = () => setPreloaderTick((t) => t + 1);
    document.body.addEventListener("yuho:preloader-done", onPreloaderDone);
    return () => {
      window.removeEventListener("resize", onResize);
      document.body.removeEventListener("yuho:preloader-done", onPreloaderDone);
    };
  }, []);

  // preloaderTick is read so the listener-driven re-render counts as used.
  void preloaderTick;
  const visible = innerH > 0 ? y > innerH * 0.7 : false;

  return (
    <nav
      className={"topbar" + (visible ? " is-visible" : "")}
      aria-label="Primary"
    >
      <a href="#hero" className="brand">
        YUHO<span className="dot">·</span>LENS
      </a>
      <ul>
        {LINKS.map((l) => (
          <li key={l.href}>
            <a href={l.href}>{l.label}</a>
          </li>
        ))}
      </ul>
      <a href="#access" className="cta" data-magnet="hanko">
        Request access
      </a>
    </nav>
  );
}
