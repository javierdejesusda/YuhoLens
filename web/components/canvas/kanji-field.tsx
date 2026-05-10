"use client";
import { useEffect, useRef, useState } from "react";

const KANJI = ["朱", "報", "告", "書", "事", "業", "経", "営", "資", "産", "負", "債", "益", "損", "率"];
// Eight specific kanji that brighten + rotate-upright when the hero
// typeset moment fires `yuho:freeze-kanji`. They cross-reference the
// title slots in HeroTypeset (Y U H O · L E N S → 拾 朱 報 告 書 視 鏡 訳).
const BRIGHT_KANJI = ["拾", "朱", "報", "告", "書", "視", "鏡", "訳"];
const FREEZE_ROTATE_MS = 600;

export function KanjiField() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [reduced, setReduced] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const motionMedia = matchMedia("(prefers-reduced-motion: reduce)");
    if (motionMedia.matches) {
      setReduced(true);
      canvas.style.display = "none";
      return;
    }

    // Mobile gate: the kanji field is atmosphere — falling-sumi-ink
    // particles behind the editorial column. On a 4× slowed mobile CPU
    // its rAF loop competes with LCP paint and adds ~120 ms of TBT
    // for no perceptible UX win (the hero reads dense without it).
    // Match the paper-rail's `(min-width: 1101px)` threshold so the
    // mobile/tablet experience is uniformly "no chrome layer."
    const desktopMQ = matchMedia("(min-width: 1101px)");
    if (!desktopMQ.matches) {
      canvas.style.display = "none";
      return;
    }

    let active = true;
    let raf = 0;
    let dpr = window.devicePixelRatio || 1;

    type Particle = {
      x: number;
      y: number;
      vy: number;
      ch: string;
      size: number;
      op: number;
      rot: number;
      bright: boolean;
      // Original rotation captured at freeze so release can restore the
      // particle to normal drift without a visible snap.
      rotFrozen: number;
    };
    let particles: Particle[] = [];
    let frozen = false;
    let freezeStart = 0;

    const GRID = 80;
    let gridCanvas: HTMLCanvasElement | null = null;

    const buildGridCanvas = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.floor(w * dpr));
      off.height = Math.max(1, Math.floor(h * dpr));
      const g = off.getContext("2d");
      if (!g) return null;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      g.strokeStyle = "rgba(240,236,227,0.04)";
      g.lineWidth = 1;
      // Pixel-snap to 0.5 so 1px strokes render crisp instead of
      // anti-aliasing into 2px smudges that look like a "broken grid".
      const snap = (v: number) => Math.floor(v) + 0.5;
      for (let x = 0; x <= w; x += GRID) {
        const sx = snap(x);
        g.beginPath();
        g.moveTo(sx, 0);
        g.lineTo(sx, h);
        g.stroke();
      }
      for (let y = 0; y <= h; y += GRID) {
        const sy = snap(y);
        g.beginPath();
        g.moveTo(0, sy);
        g.lineTo(w, sy);
        g.stroke();
      }
      return off;
    };

    const seedParticles = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      // Halved density and capped opacity so the hero title reads as the
      // hero and the kanji field reads as atmosphere, not pattern. Sizes
      // are also tightened — a single 74-px kanji in a corner used to
      // visually compete with the headline.
      const count = Math.min(56, Math.round((w * h) / 32000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vy: 0.05 + Math.random() * 0.18,
        ch: KANJI[Math.floor(Math.random() * KANJI.length)],
        size: 16 + Math.random() * 38,
        op: 0.05 + Math.random() * 0.08,
        rot: (Math.random() - 0.5) * 0.05,
        bright: false,
        rotFrozen: 0,
      }));
    };

    let lastW = 0;
    let lastH = 0;
    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      // Skip if nothing actually changed (ResizeObserver fires on layout
      // shifts that don't affect the canvas dimensions).
      if (w === lastW && h === lastH && canvas.width === Math.floor(w * dpr)) {
        return;
      }
      lastW = w;
      lastH = h;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gridCanvas = buildGridCanvas();
      seedParticles();
    };
    resize();
    window.addEventListener("resize", resize);
    // ResizeObserver catches container-driven size changes (font swaps,
    // viewport-unit recalcs on mobile address-bar collapse, etc.) that
    // never trigger a window resize event. Without this, the cached grid
    // and particle bounds drift out of sync with the visible canvas and
    // produce the streak/smear at the bottom edge.
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    // Scroll-driven intensification: above the fold the field reads as
    // calm atmosphere (~60 % of base opacity); past the hero (1 vh +)
    // it ramps to 100 %, so the editorial sections feel denser as the
    // user commits to reading. Re-computed once per frame from a
    // cached scrollY rather than wired to a scroll listener — cheaper
    // and avoids over-firing on Lenis-driven scrolls.
    let intensity = 0;
    const computeIntensity = () => {
      const heroEnd = window.innerHeight;
      const sy = window.scrollY;
      const t = (sy - heroEnd * 0.5) / (heroEnd * 0.5);
      intensity = t < 0 ? 0 : t > 1 ? 1 : t;
    };

    const tick = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (gridCanvas) {
        ctx.drawImage(gridCanvas, 0, 0);
      }
      ctx.restore();

      computeIntensity();
      const opMul = 0.55 + 0.45 * intensity;

      // Freeze ramp: 0 → 1 over FREEZE_ROTATE_MS once the freeze event
      // arrives. Used to interpolate bright-particle rotation back to
      // upright and to fade the rest of the field down to 30 % opacity.
      let freezeRamp = 0;
      if (frozen) {
        const elapsed = performance.now() - freezeStart;
        freezeRamp = Math.min(1, Math.max(0, elapsed / FREEZE_ROTATE_MS));
      }

      ctx.textBaseline = "alphabetic";
      for (const p of particles) {
        if (!frozen) {
          p.y -= p.vy;
          if (p.y < -p.size) {
            p.y = h + p.size;
            p.x = Math.random() * w;
            p.ch = KANJI[Math.floor(Math.random() * KANJI.length)];
          }
        }
        // Rotation: bright particles ease toward 0; everything else
        // holds its rotFrozen value while frozen, normal rot otherwise.
        let drawRot = p.rot;
        let drawOp = p.op * opMul;
        if (frozen) {
          if (p.bright) {
            drawRot = p.rotFrozen * (1 - freezeRamp);
            // 100 % opacity for the eight focus glyphs.
            drawOp = 1.0;
          } else {
            drawRot = p.rotFrozen;
            // Other particles fade to 30 % of normal.
            drawOp = p.op * opMul * 0.30;
          }
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(drawRot);
        ctx.font = `${p.bright && frozen ? 600 : 400} ${p.size}px 'Noto Serif JP', serif`;
        ctx.fillStyle = p.bright && frozen
          ? `rgba(232,80,58,${drawOp})`
          : `rgba(244,234,211,${drawOp})`;
        ctx.fillText(p.ch, 0, 0);
        ctx.restore();
      }
      if (active) raf = requestAnimationFrame(tick);
    };

    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !active) {
        active = true;
        raf = requestAnimationFrame(tick);
      } else if (!e.isIntersecting && active) {
        active = false;
        cancelAnimationFrame(raf);
      }
    });
    obs.observe(canvas);
    raf = requestAnimationFrame(tick);

    // Hero typeset hooks: Layer 1's intro orchestrator dispatches
    // `yuho:freeze-kanji` at first paint and `yuho:release-kanji`
    // ~3.4 s later when the typeset moment resolves. While frozen we
    // pick 8 random particle indices (one per BRIGHT_KANJI glyph),
    // overwrite their `ch`, brighten them to 100 % vermilion, and dim
    // the rest of the field to 30 % opacity.
    const onFreeze = () => {
      if (frozen || particles.length === 0) return;
      frozen = true;
      freezeStart = performance.now();
      const indices = new Set<number>();
      const want = Math.min(BRIGHT_KANJI.length, particles.length);
      while (indices.size < want) {
        indices.add(Math.floor(Math.random() * particles.length));
      }
      let k = 0;
      for (const idx of indices) {
        const p = particles[idx];
        p.bright = true;
        p.ch = BRIGHT_KANJI[k++];
        // Bigger, easier-to-read kanji during the freeze.
        p.size = Math.max(p.size, 56);
        p.rotFrozen = p.rot;
      }
      for (const p of particles) {
        if (!p.bright) p.rotFrozen = p.rot;
      }
    };
    const onRelease = () => {
      if (!frozen) return;
      frozen = false;
      for (const p of particles) {
        p.bright = false;
        // Snap rot back to its drift value — already there, since we
        // never overwrote p.rot during freeze.
      }
    };
    window.addEventListener("yuho:freeze-kanji", onFreeze);
    window.addEventListener("yuho:release-kanji", onRelease);

    const onMotionChange = (ev: MediaQueryListEvent) => {
      if (ev.matches) {
        active = false;
        cancelAnimationFrame(raf);
        canvas.style.display = "none";
        setReduced(true);
      }
    };
    if (typeof motionMedia.addEventListener === "function") {
      motionMedia.addEventListener("change", onMotionChange);
    }

    return () => {
      obs.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("yuho:freeze-kanji", onFreeze);
      window.removeEventListener("yuho:release-kanji", onRelease);
      if (typeof motionMedia.removeEventListener === "function") {
        motionMedia.removeEventListener("change", onMotionChange);
      }
    };
  }, []);

  if (reduced) return null;

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1,
        opacity: 1,
      }}
    />
  );
}
