"use client";
import { useEffect, useRef, useState } from "react";

const START_JA = "日本語で。";
const FINAL_EN = "In English.";
const CHARSET = "アイウエオカキクケコ日本語英訳価証券報告書益損資産率";
const DELAY_MS = 1700;
const DURATION_MS = 1400;

const CADENCE_IDLE_MS = 320;
const CADENCE_PEAK_MS = 90;
const CADENCE_FLOOR_MS = 100;
const FLIP_DURATION_MS = 220;
const PRESSURE_HOLD_MS = 200;

export function cadenceFromPressure(pressure: number): number {
  const p = Math.min(1, Math.max(0, pressure));
  const raw = CADENCE_IDLE_MS - (CADENCE_IDLE_MS - CADENCE_PEAK_MS) * p;
  return Math.max(CADENCE_FLOOR_MS, raw);
}

type Pair = readonly [string, string];

export type MorphTargetProps = {
  pressure?: number;
  cadenceMs?: number;
  pairs?: Pair;
  className?: string;
};

export function MorphTarget(props: MorphTargetProps = {}) {
  if (props.pairs) {
    return (
      <CyclingMorph
        pairs={props.pairs}
        pressure={props.pressure}
        cadenceMs={props.cadenceMs}
        className={props.className}
      />
    );
  }
  return <OneShotMorph className={props.className} />;
}

function OneShotMorph({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      node.textContent = FINAL_EN;
      setDone(true);
      return;
    }

    node.textContent = START_JA;

    let raf = 0;
    let frame = 0;
    const t0 = performance.now() + DELAY_MS;

    const step = (now: number) => {
      if (now < t0) {
        raf = requestAnimationFrame(step);
        return;
      }
      const elapsed = now - t0;
      const progress = Math.min(1, elapsed / DURATION_MS);
      const targetLen = FINAL_EN.length;
      const out: string[] = [];
      for (let i = 0; i < targetLen; i++) {
        const reveal = i / targetLen;
        if (progress > reveal + 0.05) {
          out.push(FINAL_EN[i]);
        } else if (progress > reveal - 0.05) {
          out.push(CHARSET[(frame + i) % CHARSET.length]);
        } else {
          out.push(START_JA[i % START_JA.length] || CHARSET[(frame + i) % CHARSET.length]);
        }
      }
      node.textContent = out.join("");
      if (progress < 1) {
        frame += 1;
        raf = requestAnimationFrame(step);
      } else {
        node.textContent = FINAL_EN;
        setDone(true);
      }
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span
      ref={ref}
      className={(className ?? "accent") + (done ? "" : " jp")}
      style={
        done
          ? undefined
          : { fontFamily: "var(--f-jp)", fontStyle: "normal", willChange: "contents" }
      }
    >
      {FINAL_EN}
    </span>
  );
}

function CyclingMorph({
  pairs,
  pressure,
  cadenceMs,
  className,
}: {
  pairs: Pair;
  pressure?: number;
  cadenceMs?: number;
  className?: string;
}) {
  const [text, setText] = useState(pairs[0]);
  const [phase, setPhase] = useState<"hold" | "morph">("hold");
  const pressureRef = useRef(pressure ?? 0);
  const cadenceOverrideRef = useRef(cadenceMs);

  useEffect(() => {
    pressureRef.current = pressure ?? 0;
    cadenceOverrideRef.current = cadenceMs;
  }, [pressure, cadenceMs]);

  useEffect(() => {
    if (typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(pairs[0]);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let raf = 0;
    let idx = 0;

    const scheduleNext = () => {
      if (cancelled) return;
      const dwell =
        cadenceOverrideRef.current ?? cadenceFromPressure(pressureRef.current);
      timer = setTimeout(runMorph, dwell);
    };

    const runMorph = () => {
      if (cancelled) return;
      setPhase("morph");
      const fromText = pairs[idx];
      const toText = pairs[(idx + 1) % pairs.length];
      const t0 = performance.now();
      const targetLen = toText.length;

      const tick = (now: number) => {
        if (cancelled) return;
        const progress = Math.min(1, (now - t0) / FLIP_DURATION_MS);
        const out: string[] = [];
        for (let i = 0; i < targetLen; i++) {
          const reveal = i / Math.max(1, targetLen);
          if (progress > reveal + 0.08) {
            out.push(toText[i]);
          } else if (progress > reveal - 0.08) {
            const pool = fromText + toText + CHARSET;
            out.push(pool[(Math.floor(now / 40) + i) % pool.length]);
          } else {
            out.push(fromText[i % fromText.length] || " ");
          }
        }
        setText(out.join(""));
        if (progress < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          idx = (idx + 1) % pairs.length;
          setText(pairs[idx]);
          setPhase("hold");
          scheduleNext();
        }
      };
      raf = requestAnimationFrame(tick);
    };

    timer = setTimeout(runMorph, PRESSURE_HOLD_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [pairs]);

  return (
    <span
      className={className ?? "accent"}
      data-phase={phase}
      style={{ fontFamily: "var(--f-jp)", fontStyle: "normal", willChange: "contents" }}
    >
      {text}
    </span>
  );
}
