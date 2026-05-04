// Single source of truth for motion timings + easings.
//
// Importable both from JS/TS components (framer-motion, raw RAF) and from
// CSS via the `--ease-*` and `--dur-*` custom properties declared in
// `app/globals.css`. The two MUST stay in sync — a name change here
// requires a matching CSS variable update.
//
// The vocabulary:
//   EASE_OUT      — default deceleration; 95% of reveals/hovers
//   EASE_IN_OUT   — chrome that goes off and comes back (drawer, accordion)
//   EASE_IN       — exits, only used when something is leaving
//   DUR_FAST      — micro-interactions (hover, button press) ~180ms
//   DUR_BASE      — section reveals, main transitions ~640ms
//   DUR_SLOW      — staged hero choreography ~900ms
//   STAGGER       — gap between sibling reveals ~60ms
//
// Named exports are tuples for framer-motion `transition.ease` and ms
// numbers for `duration` (framer takes seconds — divide by 1000 at the
// call site).

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;
export const EASE_IN = [0.4, 0, 1, 1] as const;

export const DUR_FAST_MS = 180;
export const DUR_BASE_MS = 640;
export const DUR_SLOW_MS = 900;
export const DUR_HERO_SETTLE_MS = 220;

export const STAGGER_MS = 60;

// Reveal motion — used by `Reveal` wrapper. 64px translate is generous
// enough to register as a movement without feeling theatrical.
export const REVEAL_DISTANCE_PX = 64;
export const REVEAL_DURATION_MS = DUR_BASE_MS;

// Framer-motion transitions — pre-built for the most common cases so
// callers don't reach for cubic-bezier tuples.
export const transitionBase = {
  duration: DUR_BASE_MS / 1000,
  ease: EASE_OUT,
} as const;

export const transitionFast = {
  duration: DUR_FAST_MS / 1000,
  ease: EASE_OUT,
} as const;

export const transitionSlow = {
  duration: DUR_SLOW_MS / 1000,
  ease: EASE_OUT,
} as const;

export const springPunch = {
  type: "spring" as const,
  stiffness: 320,
  damping: 16,
  mass: 0.6,
};

export const springSettle = {
  type: "spring" as const,
  stiffness: 180,
  damping: 22,
  mass: 0.8,
};
