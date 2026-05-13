"use client";
import { useEffect, useRef, useState } from "react";
import { useScrollState } from "@/lib/use-scroll-state";
import { TOPBAR_LINKS } from "@/lib/sections";

export function TopBar() {
  const { y } = useScrollState();
  const [innerH, setInnerH] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

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

  // While the drawer is open it behaves like a modal dialog: focus moves
  // inside, Escape closes it and returns focus to the burger, and Tab is
  // trapped between the first and last focusable child. When closed the
  // drawer is `inert` (below) so its links never appear in the tab order.
  useEffect(() => {
    if (!menuOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const getFocusable = () =>
      Array.from(
        drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
      ).filter((el) => el.offsetParent !== null);

    getFocusable()[0]?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
        burgerRef.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !drawer.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

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
        ref={burgerRef}
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
        ref={drawerRef}
        id="topbar-mobile-menu"
        className="topbar__drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!menuOpen}
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
