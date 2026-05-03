"use client";
import { useEffect, useRef, useState } from "react";

type RevealProps = {
  children: React.ReactNode;
  delay?: 0 | 1 | 2 | 3;
  className?: string;
};

export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [instant, setInstant] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // If the element is already in the viewport on first paint (above
    // the fold), reveal it instantly with no transition. This prevents
    // the 0 -> 1 flash for hero/first-section content and keeps the
    // paper-rail's scroll-driven transitions in sync from frame zero.
    if (typeof window !== "undefined") {
      const r = el.getBoundingClientRect();
      const inView = r.top < window.innerHeight && r.bottom > 0;
      if (inView) {
        setInstant(true);
        setVisible(true);
        return;
      }
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      // Trigger earlier: fire when the element is still 10% below the
      // viewport bottom so the fade completes by the time the user has
      // actually scrolled the section into reading position. Keeps the
      // `is-in` flag in sync with what the paper-rail observer sees.
      { threshold: 0, rootMargin: "0px 0px -10% 0px" },
    );
    obs.observe(el);
    // Fallback: if intersection observer hasn't fired after 2.5s (e.g. element
    // is below the fold and the user is testing programmatically, or
    // prefers-reduced-motion + a dropped frame), reveal the content anyway
    // so it can never be permanently hidden by the observer not firing.
    const fallback = window.setTimeout(() => {
      setInstant(true);
      setVisible(true);
    }, 2500);
    return () => {
      obs.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  const cls =
    "reveal" +
    (visible ? " is-in" : "") +
    (instant ? " no-anim" : "") +
    (delay ? ` delay-${delay}` : "") +
    (className ? ` ${className}` : "");

  return (
    <div ref={ref} className={cls}>
      {children}
    </div>
  );
}
