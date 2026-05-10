"use client";
import { useEffect, useState } from "react";
import { useScrollState } from "@/lib/use-scroll-state";

const LINKS = [
  { href: "#problem", label: "Problem" },
  { href: "#how", label: "How it works" },
  { href: "#readalong", label: "Read along" },
  { href: "#hardware", label: "Hardware" },
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
  // Earlier fade-in: the previous 0.7vh threshold felt like a delay —
  // by the time the topbar appeared the user had already scrolled past
  // the hero. 0.18vh corresponds to ~160 px on a 900-tall viewport, so
  // the topbar materialises just as the user has committed to scrolling.
  const visible = innerH > 0 ? y > innerH * 0.18 : false;

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
        Get the weights
      </a>
    </nav>
  );
}
