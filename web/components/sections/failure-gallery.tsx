import failures from "@/data/failures.generated.json";
import type { FailureCase } from "@/lib/types";
import { EmphasisText } from "@/components/ui/emphasis-text";
import { Reveal } from "@/components/ui/reveal";

function FcOut({ block }: { block: string }) {
  // Highlight inline `OK` / `[evidence …]` markers as .ok / .lab spans.
  const parts = block.split(/(\bOK\b|\[evidence insufficient\])/);
  return (
    <pre className="fc-out">
      {parts.map((p, i) => {
        if (p === "OK") return <span key={i} className="ok">OK</span>;
        if (p === "[evidence insufficient]") return <span key={i} className="ok">[evidence insufficient]</span>;
        return <span key={i}>{p}</span>;
      })}
    </pre>
  );
}

export function FailureGallery() {
  const cases = failures as FailureCase[];
  return (
    <section className="fail-section is-paper-anchor-left" id="failures" data-paper-stage="failures" data-paper-hide>
      <Reveal>
        <div className="section-tag">
          <span className="num">03·5 / 04</span>
          <span>Where it refuses</span>
          <span className="ja">節度</span>
          <span className="rule" />
        </div>
      </Reveal>
      <Reveal>
        <h2 className="section-title">
          Three honest <span className="accent">failures.</span>
        </h2>
      </Reveal>
      <Reveal>
        <p className="section-lede">
          Every memo that ships goes through the grounder. These are the cases the grounder caught — kept honest, not hidden.
        </p>
      </Reveal>

      <div className="fail-grid">
        {cases.map((c, i) => (
          <Reveal key={c.num} delay={(i as 0 | 1 | 2)}>
            <article className="fail-card">
              <div className="fc-num">{c.num} / {c.type}</div>
              <span className="fc-tag">{c.caughtBy}</span>
              <h3>
                <EmphasisText
                  segments={c.headline}
                  emColor="var(--vermilion)"
                />
              </h3>
              <p className="fc-claim">{c.claim}</p>
              <FcOut block={c.outputBlock} />
              <div className="mono" style={{ color: "var(--type-faint)", fontSize: 9 }}>
                SOURCE · {c.customId}
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
