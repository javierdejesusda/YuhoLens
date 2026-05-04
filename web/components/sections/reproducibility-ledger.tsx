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
    <section className="repro-section is-paper-anchor-right" id="repro" data-paper-stage="repro">
      <Reveal>
        <div className="section-tag">
          <span className="num">02·3 / 04</span>
          <span>The ledger</span>
          <span className="ja">明細</span>
          <span className="rule" />
        </div>
      </Reveal>

      <Reveal>
        <div className="repro-head">
          <h2 className="section-title">
            Every row maps to a script in the <span className="accent">public repo.</span>
          </h2>
          <p className="section-lede">
            Open weights, open eval, open ledger. The whole pipeline reproduces in one MI300X-day.
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
                <span className="mono repro-script-path" style={{ display: "block", marginTop: 4, color: "var(--type-muted)", fontSize: 10 }}>
                  {r.scriptPath}
                </span>
              </span>
              <span className="tag">{r.tag}</span>
            </button>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
