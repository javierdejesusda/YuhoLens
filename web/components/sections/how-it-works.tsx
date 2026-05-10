"use client";
import { useEffect, useRef, useState } from "react";
import { HOW_STEPS, type HowStep } from "@/data/manual";
import { Reveal } from "@/components/ui/reveal";

function TypingDemo() {
  const [text, setText] = useState("");
  useEffect(() => {
    const target = "earnings_forecast-00141";
    let i = 0;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (now - last > 90 && i < target.length) {
        setText(target.slice(0, i + 1));
        i += 1;
        last = now;
      }
      if (i < target.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="demo-input">
      <span className="prompt">$</span>
      <span className="typed">{text}</span>
      <span className="caret" aria-hidden="true" />
      <span className="return">↵</span>
    </div>
  );
}

function FetchDemo() {
  const [pct, setPct] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1800);
      setPct(Math.round(t * 100));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="demo-fetch" ref={ref}>
      <div className="counter">
        <span className="label">PAGE</span>
        <b>{String(Math.round((pct / 100) * 312)).padStart(3, "0")}</b>
      </div>
      <div className="bar" style={{ ["--w" as never]: `${pct}%` }} />
      <div className="label">DOWNLOADING · EDINET · ROW {pct}%</div>
    </div>
  );
}

function CiteDemo() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = wrapRef.current;
    if (!root) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const words = root.querySelectorAll(".word");
    const sups = root.querySelectorAll("sup");

    if (reduced) {
      words.forEach((w) => w.classList.add("is-on"));
      sups.forEach((s) => s.classList.add("show"));
      return;
    }

    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timeouts.push(t);
    };
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      words.forEach((w) => w.classList.remove("is-on"));
      sups.forEach((s) => s.classList.remove("show"));
      words.forEach((w, i) => schedule(() => w.classList.add("is-on"), i * 110));
      const supBase = words.length * 110 + 200;
      sups.forEach((s, i) => {
        const start = supBase + i * 1500;
        schedule(() => s.classList.add("show"), start);
        schedule(() => s.classList.remove("show"), start + 1200);
      });
      schedule(run, supBase + sups.length * 1500 + 800);
    };
    schedule(run, 800);

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="demo-cite" ref={wrapRef}>
      <span className="word">Operating</span> <span className="word">margin</span>{" "}
      <span className="word">compressed</span> <span className="word">3.4%</span>{" "}
      <span className="word">YoY</span>
      <sup data-pop="営業利益率, p.23 §2.1" data-cursor-preview="cite:demo:fx">¹</sup>{" "}
      <span className="word">on</span> <span className="word">yen</span>{" "}
      <span className="word">weakness</span>
      <sup data-pop="為替予約, p.24 §2.1" data-cursor-preview="cite:demo:fx-hedge">²</sup>
      <span className="word">.</span>
    </div>
  );
}

function StepDemo({ kind }: { kind: HowStep["demoKind"] }) {
  if (kind === "input") return <TypingDemo />;
  if (kind === "fetch") return <FetchDemo />;
  return <CiteDemo />;
}

export function HowItWorks() {
  return (
    <section className="how is-paper-anchor-right" id="how" data-paper-stage="how">
      <Reveal>
        <div className="section-tag">
          <span className="num">§ 02</span>
          <span>How it works</span>
          <span className="ja">仕組み</span>
          <span className="rule" />
        </div>
      </Reveal>
      <Reveal>
        <h2 className="section-title">
          A four-stage pipeline. <span className="accent">Span-grounded.</span> Refuses when uncertain.
        </h2>
      </Reveal>
      <Reveal>
        <p className="section-lede">
          Section-split → translate-with-context → citation-grounder → judge. Every claim ties to a verbatim
          Japanese span; sentences without grounding are replaced with{" "}
          <em>[evidence insufficient]</em>.
        </p>
      </Reveal>

      <div className="how-grid">
        {HOW_STEPS.map((s, i) => (
          <Reveal key={s.num} delay={(i as 0 | 1 | 2)}>
            <article className="step-card">
              <div className="step-num">{s.num}</div>
              <h3>{s.head}</h3>
              <p>{s.body}</p>
              <div className="demo-area" aria-hidden="true">
                <StepDemo kind={s.demoKind} />
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      <Reveal delay={2}>
        <p className="how-exit-caption" aria-hidden="true">
         , end of pass · paper out
        </p>
      </Reveal>
    </section>
  );
}
