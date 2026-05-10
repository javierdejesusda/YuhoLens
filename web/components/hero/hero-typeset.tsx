"use client";
import { useEffect, useState } from "react";

import { SumiStroke } from "./sumi-stroke";

const BRIGHT_KANJI = ["拾", "朱", "報", "告", "書", "視", "鏡", "訳"];
// The 9-cell title row maps onto BRIGHT_KANJI[0..7] with the gap at
// index 4 (between YUHO and LENS). Slot indexes that don't have a
// kanji simply render the roman glyph alone.
const TITLE_LETTERS: Array<{ char: string; kanji: string | null }> = [
  { char: "Y", kanji: BRIGHT_KANJI[0] },
  { char: "U", kanji: BRIGHT_KANJI[1] },
  { char: "H", kanji: BRIGHT_KANJI[2] },
  { char: "O", kanji: BRIGHT_KANJI[3] },
  { char: " ", kanji: null },
  { char: "L", kanji: BRIGHT_KANJI[4] },
  { char: "E", kanji: BRIGHT_KANJI[5] },
  { char: "N", kanji: BRIGHT_KANJI[6] },
  { char: "S", kanji: BRIGHT_KANJI[7] },
];

const TAGLINE_PREFIX = "Translated with ";
const TAGLINE_ACCENT = "span-cited";
const TAGLINE_SUFFIX = " receipts.";
const FULL_TAGLINE_LENGTH =
  TAGLINE_PREFIX.length + TAGLINE_ACCENT.length + TAGLINE_SUFFIX.length;

/**
 * Hero Typeset — the 3.2-second cinematic intro that resolves into the
 * resting hero copy. Beat sequence:
 *   0  (0–800)    kanji freeze + 8 brighten
 *   1  (800–2200) kanji glide into baseline + crossfade to YUHO LENS
 *   2  (2200–2800) sumi-stroke draws under "span-cited"
 *   3  (2800–3200) paper unfolds, CTAs ride in, hero phase 2 takes over
 *
 * Reduced-motion or sub-1101px viewports collapse to beat 3 instantly
 * (a 200ms opacity fade), preserving the editorial layout without any
 * choreography.
 */
export function HeroTypeset() {
  const [beat, setBeat] = useState<0 | 1 | 2 | 3>(0);
  const [taglineChars, setTaglineChars] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const motionMQ = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    );
    const desktopMQ = window.matchMedia?.("(min-width: 1101px)");
    const reduced = !!motionMQ?.matches;
    const isMobile = !desktopMQ?.matches;

    if (reduced || isMobile) {
      setBeat(3);
      setTaglineChars(FULL_TAGLINE_LENGTH);
      // Reduced-motion / mobile: the paper-rail must boot already
      // unfolded since the orchestrator never dispatches the event.
      document.documentElement.dataset.paperUnfolded = "1";
      return;
    }

    // Freeze the falling-kanji canvas; the listener over in
    // kanji-field.tsx pauses the rAF, brightens 8 chosen particles,
    // and dims the rest to 30 % opacity.
    window.dispatchEvent(new CustomEvent("yuho:freeze-kanji"));

    const t1 = window.setTimeout(() => setBeat(1), 800);
    const t2 = window.setTimeout(() => setBeat(2), 2200);
    const t3 = window.setTimeout(() => {
      setBeat(3);
      // Set the late-boot fallback flag on <html> first so a
      // paper-rail that hasn't booted yet boots unfolded.
      document.documentElement.dataset.paperUnfolded = "1";
      window.dispatchEvent(new CustomEvent("yuho:paper-unfold"));
    }, 2800);
    // Release the kanji field to its normal drift after the typeset
    // sequence has fully resolved — slightly past beat 3 so the field
    // doesn't twitch back into motion mid-stroke.
    const tEnd = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("yuho:release-kanji"));
    }, 3400);

    // Tagline types in starting partway through beat 1.
    let raf = 0;
    const start = performance.now() + 1100;
    const tick = (now: number) => {
      if (now < start) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const elapsed = now - start;
      const chars = Math.min(FULL_TAGLINE_LENGTH, Math.floor(elapsed / 35));
      setTaglineChars(chars);
      if (chars < FULL_TAGLINE_LENGTH) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.clearTimeout(tEnd);
      cancelAnimationFrame(raf);
      // If the component unmounts mid-sequence, make sure the kanji
      // field doesn't stay frozen forever.
      window.dispatchEvent(new CustomEvent("yuho:release-kanji"));
    };
  }, []);

  const taglineState = sliceTagline(taglineChars);
  const ctaActive = beat >= 3;

  return (
    <div className="hero-typeset" data-beat={beat}>
      <p className="hero-typeset__eyebrow" aria-hidden={beat < 3}>
        <span className="sq" />
        <span>Vol. II, Edition 047</span>
        <span className="hero-typeset__sep">·</span>
        <span className="jp" lang="ja">有価証券報告書、英訳</span>
      </p>

      <h1 className="hero-typeset__title" aria-label="YuhoLens">
        {TITLE_LETTERS.map((slot, i) => (
          <HeroGlyph
            key={i}
            index={i}
            letter={slot.char}
            kanji={slot.kanji}
          />
        ))}
      </h1>

      <p
        className="hero-typeset__tagline"
        aria-label="Translated with span-cited receipts."
      >
        <span className="hero-typeset__tagline-text" aria-hidden="true">
          {taglineState.prefix}
        </span>
        {taglineState.accentVisibleChars > 0 && (
          <span
            className="accent hero-typeset__tagline-accent"
            aria-hidden="true"
          >
            {TAGLINE_ACCENT.slice(0, taglineState.accentVisibleChars)}
            {taglineState.accentVisibleChars >= TAGLINE_ACCENT.length && (
              <SumiStroke active={beat >= 2} />
            )}
          </span>
        )}
        <span className="hero-typeset__tagline-text" aria-hidden="true">
          {taglineState.suffix}
        </span>
        {taglineChars < FULL_TAGLINE_LENGTH && (
          <span
            className="hero-typeset__caret"
            aria-hidden="true"
          />
        )}
      </p>

      <p className="hero-typeset__sub" aria-hidden={beat < 3}>
        Every claim, currency, margin, segment, links back to a page and
        span in the original{" "}
        <span className="jp-loan">yūhō</span>. Open weights, GGUF on AMD
        silicon.
      </p>

      <div className="hero-typeset__cta" aria-hidden={!ctaActive}>
        <a
          href="#problem"
          className="hero-typeset__btn btn-primary"
          tabIndex={ctaActive ? 0 : -1}
        >
          Read the case
        </a>
        <a
          href="#access"
          className="hero-typeset__btn is-ghost"
          tabIndex={ctaActive ? 0 : -1}
        >
          Try the model
        </a>
      </div>
    </div>
  );
}

type GlyphProps = {
  index: number;
  letter: string;
  kanji: string | null;
};

function HeroGlyph({ index, letter, kanji }: GlyphProps) {
  // Per-glyph stagger so the crossfade ripples left-to-right rather
  // than firing as one block.
  const delay = `${index * 60}ms`;
  const isSpace = letter === " ";
  return (
    <span
      className="hero-typeset__glyph"
      data-letter={isSpace ? "" : letter}
      data-space={isSpace ? "true" : "false"}
      style={{ transitionDelay: delay }}
      aria-hidden="true"
    >
      {kanji && (
        <span
          className="hero-typeset__glyph-kanji"
          style={{ transitionDelay: delay }}
          lang="ja"
        >
          {kanji}
        </span>
      )}
      <span
        className="hero-typeset__glyph-roman"
        style={{ transitionDelay: delay }}
      >
        {isSpace ? " " : letter}
      </span>
      <span
        className="hero-typeset__glyph-bleed"
        style={{ transitionDelay: delay }}
        aria-hidden="true"
      />
      {/* Force the slot to reserve space matching the roman glyph even
          when only the kanji is currently visible, so the row doesn't
          reflow mid-crossfade. */}
      <span className="hero-typeset__glyph-spacer" aria-hidden="true">
        {isSpace ? " " : letter}
      </span>
    </span>
  );
}

type SliceState = {
  prefix: string;
  accentVisibleChars: number;
  suffix: string;
};

function sliceTagline(typedChars: number): SliceState {
  const prefixLen = TAGLINE_PREFIX.length;
  const accentLen = TAGLINE_ACCENT.length;
  if (typedChars <= prefixLen) {
    return {
      prefix: TAGLINE_PREFIX.slice(0, typedChars),
      accentVisibleChars: 0,
      suffix: "",
    };
  }
  if (typedChars <= prefixLen + accentLen) {
    return {
      prefix: TAGLINE_PREFIX,
      accentVisibleChars: typedChars - prefixLen,
      suffix: "",
    };
  }
  return {
    prefix: TAGLINE_PREFIX,
    accentVisibleChars: accentLen,
    suffix: TAGLINE_SUFFIX.slice(0, typedChars - prefixLen - accentLen),
  };
}
