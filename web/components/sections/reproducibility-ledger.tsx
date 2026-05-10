"use client";
import { motion, useReducedMotion } from "framer-motion";
import repro from "@/data/repro-ledger.generated.json";
import type { ReproRow } from "@/lib/types";
import { Reveal } from "@/components/ui/reveal";
import { SealStamp } from "@/components/ui/seal-stamp";
import { useCiteDrawer } from "@/components/ui/cite-drawer";

function rowToCite(row: ReproRow) {
  return {
    citation: {
      span: row.value,
      section: row.key,
      pageRef: row.scriptPath,
    },
    customId: row.tag,
  };
}

const OPEN_ITEMS: { num: string; label: string; sub: string }[] = [
  { num: "01", label: "BF16 weights", sub: "MIT · HuggingFace" },
  { num: "02", label: "GGUF Q3–Q8 quants", sub: "Five sizes · 7.18–14.03 GiB" },
  { num: "03", label: "KG-2 eval scripts", sub: "50-prompt set · graders" },
  { num: "04", label: "DPO + ORPO logs", sub: "Full training run history" },
];

export function ReproducibilityLedger() {
  const rows = repro as ReproRow[];
  const open = useCiteDrawer();
  const prefersReducedMotion = useReducedMotion();

  const STAMP_SCALE = 22 / 54;
  const stampInitial = prefersReducedMotion
    ? { rotate: -6, opacity: 1, scale: STAMP_SCALE }
    : { rotate: -10, opacity: 0, scale: STAMP_SCALE };
  const stampAnimate = { rotate: -6, opacity: 1, scale: STAMP_SCALE };

  return (
    <section
      className="repro-section is-paper-anchor-center"
      id="repro"
      data-paper-stage="repro"
      data-paper-hide
    >
      <Reveal>
        <div className="section-tag">
          <span className="num">§ 03</span>
          <span>The receipt</span>
          <span className="ja">領収書</span>
          <span className="rule" />
        </div>
      </Reveal>

      <Reveal>
        <div className="repro-head">
          <h2 className="section-title">
            Open weights. Open eval. Every row maps to a script in the{" "}
            <span className="accent">public repo.</span>
          </h2>
          <p className="section-lede">
            The whole pipeline — corpus build, SFT, ORPO, KG-2 eval, GGUF export — reproduces in
            one MI300X-day. ~$80 of compute. No private data, no held-out tricks; click any row to
            open the script that produced it.
          </p>
          <p className="mono repro-receipt">RECEIPT · {rows.length} ROWS</p>
        </div>
      </Reveal>

      <Reveal delay={1}>
        <div className="repro-ledger">
          {rows.map((r) => (
            <button
              key={r.key}
              type="button"
              className={"row repro-row" + (r.isTotal ? " total" : "")}
              onClick={() => open(rowToCite(r))}
              aria-label={`${r.key}: ${r.value}. Open source artefact.`}
            >
              <span className="repro-row__seal" aria-hidden="true">
                <motion.span
                  className="repro-row__seal-inner"
                  initial={stampInitial}
                  animate={stampAnimate}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <SealStamp state="verified" label={`${r.key} verified`} />
                </motion.span>
              </span>
              <span className="k">{r.key}</span>
              <span className="v">
                {r.value}
                <span
                  className="mono repro-script-path"
                  style={{
                    display: "block",
                    marginTop: 4,
                    color: "var(--type-muted)",
                    fontSize: 10,
                  }}
                >
                  {r.scriptPath}
                </span>
              </span>
              <span className="tag">{r.tag}</span>
            </button>
          ))}
        </div>
      </Reveal>

      <Reveal delay={2}>
        <div className="repro-open-strip" role="list" aria-label="What is open">
          {OPEN_ITEMS.map((item) => (
            <div className="repro-open-item" role="listitem" key={item.num}>
              <span className="mono repro-open-num">{item.num}</span>
              <div className="repro-open-text">
                <span className="repro-open-label">{item.label}</span>
                <span className="mono repro-open-sub">{item.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
