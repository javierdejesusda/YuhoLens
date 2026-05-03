"use client";
import { useRef } from "react";
import { useInView, useReducedMotion } from "framer-motion";
import { MANIFESTO } from "@/data/manual";
import { Reveal } from "@/components/ui/reveal";

function Tenet({
  index,
  num,
  head,
  body,
}: {
  index: number;
  num: string;
  head: string;
  body: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const delay = (Math.min(index, 3) as 0 | 1 | 2 | 3);
  const cls = reduced
    ? "pair ink-drip-static"
    : "pair" + (inView ? " ink-drip-active" : "");

  return (
    <Reveal delay={delay}>
      <div ref={ref} className={cls}>
        <span className="num">{num}</span>
        <div>
          <h4>
            <span className="ink-drip-highlight">{head}.</span>
          </h4>
          {body ? <p>{body}</p> : null}
        </div>
      </div>
    </Reveal>
  );
}

export function Manifest() {
  return (
    <section className="manifest is-paper-anchor-center" id="manifest" data-paper-stage="manifest" data-paper-hide>
      <div className="left">
        <Reveal>
          <div className="section-tag">
            <span className="num">04 / 04</span>
            <span>The discipline</span>
            <span className="ja">節度</span>
            <span className="rule" />
          </div>
        </Reveal>
        <Reveal>
          <h2 className="section-title">
            A reading discipline,<br />
            <span className="accent">not a chatbot.</span>
          </h2>
        </Reveal>
        <Reveal delay={1}>
          <p className="section-lede">
            We didn&rsquo;t ship a chatbot. We shipped a reading discipline that refuses claims it can&rsquo;t cite — and a public ledger that proves it did.
          </p>
        </Reveal>
        <Reveal delay={2}>
          <p className="sig">
            朱 / SHU — <span className="accent">vermilion</span>, the seal of the verified spec
          </p>
        </Reveal>
      </div>

      <div className="right">
        {MANIFESTO.map((m, i) => {
          const head = m.text.split(".")[0].trim();
          const body = m.text.split(".").slice(1).join(".").trim();
          return (
            <Tenet
              key={m.i}
              index={i}
              num={m.i}
              head={head}
              body={body}
            />
          );
        })}
      </div>
    </section>
  );
}
