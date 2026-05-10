"use client";
import { useEffect, useState } from "react";
import { useScrollState } from "@/lib/use-scroll-state";
import { TOPBAR_LINKS } from "@/lib/sections";

export function TopBar() {
  const { y } = useScrollState();
  const [innerH, setInnerH] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onResize = () => setInnerH(window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // Close drawer on hash change so anchor jumps don't leave it open.
  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener("hashchange", close);
    return () => window.removeEventListener("hashchange", close);
  }, []);

  // Earlier fade-in: 0.18vh corresponds to ~160 px on a 900-tall viewport,
  // so the topbar materialises just as the user has committed to scrolling.
  const visible = innerH > 0 ? y > innerH * 0.18 : false;

  return (
    <nav
      className={"topbar" + (visible ? " is-visible" : "") + (menuOpen ? " is-menu-open" : "")}
      aria-label="Primary"
    >
      <a href="#hero" className="brand">
        YUHO<span className="dot">·</span>LENS
      </a>
      <ul>
        {TOPBAR_LINKS.map((l) => (
          <li key={l.href}>
            <a href={l.href}>{l.label}</a>
          </li>
        ))}
      </ul>
      <a href="#access" className="cta" data-magnet="hanko">
        Get the weights
      </a>
      <button
        type="button"
        className="topbar__burger"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        aria-controls="topbar-mobile-menu"
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>
      <div
        id="topbar-mobile-menu"
        className="topbar__drawer"
        role="dialog"
        aria-label="Menu"
        aria-hidden={!menuOpen}
      >
        <ul>
          {TOPBAR_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            </li>
          ))}
          <li>
            <a className="topbar__drawer-cta" href="#access" onClick={() => setMenuOpen(false)}>
              Get the weights
            </a>
          </li>
        </ul>
      </div>
    </nav>
  );
}
