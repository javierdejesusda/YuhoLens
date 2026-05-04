import { MetricTicker } from "@/components/ui/metric-ticker";
import { MorphTarget } from "@/components/ui/morph-target";

export function Hero() {
  return (
    <section
      className="hero is-paper-anchor-right"
      id="hero"
      aria-label="Hero"
      data-paper-stage="hero"
    >
      <div className="corner c-tl">
        <span className="dash">—</span> 朱 / SHU · A LENS ON JAPANESE FILINGS
      </div>
      <div className="corner c-tr">N° 047 / TOKYO · NEW YORK</div>
      <div className="corner c-bl">VOL. II · MMXXVI</div>
      <div className="corner c-br">
        <span>EDINET FEED · LIVE</span>
        <span style={{ color: "var(--vermilion)" }}>●</span>
      </div>

      <div className="hero-grid pa-full">
        <div className="hero-copy">
          <div className="hero-eyebrow paper-orbit">
            <span className="sq" />
            <span>Vol. II — Edition 047</span>
            <span className="jp" lang="ja">有価証券報告書、英訳。</span>
          </div>
          <h1 className="hero-title">
            <span className="line"><span className="inner">Every Japanese</span></span>
            <span className="line"><span className="inner">annual report.</span></span>
            <span className="line"><span className="inner"><MorphTarget /></span></span>
          </h1>
          <p className="hero-sub">
            A reading lens for the 88,000 pages of <span className="jp-loan">yūhō</span> filed each year — translated with context, cited to the verbatim source span, refused when uncertain.
          </p>

          <MetricTicker />

          <div className="hero-cta-row">
            <a href="#demo" className="btn-primary">
              Read a sample memo <span className="arr">→</span>
            </a>
            <a href="#repro" className="btn-secondary">
              How it was built
            </a>
          </div>

          <p className="hero-microcopy">
            <span className="hero-microcopy__dot" aria-hidden="true">·</span>
            MIT-licensed weights
            <span className="hero-microcopy__sep" aria-hidden="true">·</span>
            KG-2 PASS
            <span className="hero-microcopy__sep" aria-hidden="true">·</span>
            MI300X-trained
          </p>

          <div className="hero-meta">
            <span><b>1,910</b> EDINET-Bench rows</span>
            <span>BF16 SFT + best-of-5</span>
            <span>Open weights · MIT</span>
            <span>ROCm 7.0 · MI300X</span>
          </div>
        </div>
      </div>

      <div className="scroll-hint" aria-hidden="true">
        <span>Scroll</span>
        <span className="line" />
      </div>
    </section>
  );
}
