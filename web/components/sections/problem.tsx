import { PROBLEM_BEATS, type ProblemBeat } from "@/data/manual";
import { Reveal } from "@/components/ui/reveal";

const JA_BLOCK =
  "当社グループの事業等のリスクとして、急激な為替変動は営業利益率に重大な影響を及ぼす可能性がある。当連結会計年度における売上収益は前期比3.4%減となり、純利益は前期と比較して17億円の減少となった。なお、自己資本比率は…";

function BeatDemo({ kind }: { kind: ProblemBeat["demoKind"] }) {
  if (kind === "wall") {
    return (
      <div className="demo" aria-hidden="true">
        {JA_BLOCK}
      </div>
    );
  }
  if (kind === "split") {
    return (
      <div className="demo" aria-hidden="true">
        <div className="ja">急激な為替変動は営業利益率に重大な影響を及ぼす可能性がある。</div>
        <div className="mt">
          &ldquo;Sudden <s>foreign-exchange shaking</s> may give a serious feeling of influence to operating profit ratio.&rdquo;
        </div>
      </div>
    );
  }
  return (
    <div className="demo" aria-hidden="true">
      Prolonged yen weakness materially compresses operating margin in the electronic-components segment.
      <sup>¹</sup>
      <div
        style={{
          marginTop: 10,
          padding: "8px 10px",
          borderLeft: "2px solid var(--vermilion)",
          background: "rgba(232,80,58,0.08)",
          fontFamily: "var(--f-mono)",
          fontSize: "10.5px",
          color: "var(--type-muted)",
          fontStyle: "normal",
          lineHeight: 1.5,
        }}
      >
        <span style={{ color: "var(--vermilion)", letterSpacing: "0.18em" }}>[evidence insufficient]</span>
        <br />
        <span style={{ color: "var(--type-faint)" }}>
          — claim about FY25 guidance was
          <br />
          not span-grounded; refused.
        </span>
      </div>
      <div className="ja-orig">
        急激な為替変動は営業利益率に重大な影響を及ぼす可能性がある — p.??
      </div>
    </div>
  );
}

export function Problem() {
  return (
    <section className="problem is-paper-anchor-left" id="problem" data-paper-stage="problem">
      <Reveal>
        <div className="section-tag">
          <span className="num">01 / 04</span>
          <span>The reading problem</span>
          <span className="ja">読まれない</span>
          <span className="rule" />
        </div>
      </Reveal>
      <Reveal>
        <h2 className="section-title">
          Eighty-eight thousand pages, <span className="accent">mostly unread.</span>
        </h2>
      </Reveal>
      <Reveal>
        <p className="section-lede">
          Japan publishes some of the world&rsquo;s most rigorous financial disclosures. Almost no one outside Japan reads them.
        </p>
      </Reveal>

      <div className="beats">
        {PROBLEM_BEATS.map((beat, i) => (
          <Reveal key={beat.num} delay={(i as 0 | 1 | 2)}>
            <div className={`beat beat-${i + 1}`}>
              <span className="num">{beat.num}</span>
              <span className="label">{beat.label}</span>
              <h3>{beat.headline}</h3>
              <p>{beat.body}</p>
              <BeatDemo kind={beat.demoKind} />
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
