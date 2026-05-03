"use client";
import { forwardRef, useMemo } from "react";
import type { Filer } from "@/lib/types";
import { useCiteDrawer } from "@/components/ui/cite-drawer";

const SUP_DIGITS: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
};

function toSup(n: number): string {
  return String(n + 1)
    .split("")
    .map((d) => SUP_DIGITS[d] ?? d)
    .join("");
}

type Span = { type: "text" | "mark"; text: string; idx?: number };

interface BuildResult {
  spans: Span[];
  synthesized: boolean;
}

function buildSpans(
  source: string,
  citations: { span: string }[],
): BuildResult {
  if (!source || citations.length === 0) {
    return synth(citations);
  }
  let remaining = source;
  const out: Span[] = [];
  const matched = new Set<number>();
  citations.forEach((c, i) => {
    if (!c.span) return;
    const probe = c.span.split("...")[0].trim();
    if (!probe) return;
    const found = remaining.indexOf(probe);
    if (found < 0) return;
    if (found > 0) out.push({ type: "text", text: remaining.slice(0, found) });
    out.push({ type: "mark", text: probe, idx: i });
    remaining = remaining.slice(found + probe.length);
    matched.add(i);
  });
  if (matched.size === 0) {
    return synth(citations);
  }
  if (remaining) out.push({ type: "text", text: remaining });
  citations.forEach((c, i) => {
    if (matched.has(i)) return;
    if (!c.span) return;
    out.push({ type: "text", text: " " });
    out.push({ type: "mark", text: `[evidence: ${c.span}]`, idx: i });
  });
  return { spans: out, synthesized: false };
}

function synth(citations: { span: string }[]): BuildResult {
  const present = citations.filter((c) => c.span);
  if (present.length === 0) return { spans: [], synthesized: true };
  const out: Span[] = [];
  citations.forEach((c, i) => {
    if (!c.span) return;
    if (out.length > 0) out.push({ type: "text", text: "。 " });
    out.push({ type: "mark", text: c.span, idx: i });
  });
  return { spans: out, synthesized: true };
}

export const LdSource = forwardRef<HTMLDivElement, { filer: Filer }>(function LdSource(
  { filer },
  ref,
) {
  const open = useCiteDrawer();
  const allCitations = useMemo(
    () => filer.memo.flatMap((m) => m.citations.map((c) => ({ span: c.span, ref: c }))),
    [filer.memo],
  );
  const { spans } = useMemo(
    () => buildSpans(filer.jpSourceExcerpt || "", allCitations),
    [filer.jpSourceExcerpt, allCitations],
  );

  const subsetLabel = filer.displayLabel.split(" · ").pop() ?? filer.subset;
  const hasJp = filer.jpName && filer.jpName !== filer.customId;
  const headingJp = hasJp ? filer.jpName : filer.displayLabel;
  const showEn = Boolean(hasJp && filer.enName);

  return (
    <div className="ld-source ld-source-paper" ref={ref}>
      <div className="ld-source-fold" aria-hidden="true" />
      <div className="head">
        <span>有価証券報告書 · EDINET</span>
        <span className="ticker">{subsetLabel}</span>
      </div>
      <h3 className="jp">{headingJp}</h3>
      {showEn && <p className="ld-source-en">{filer.enName}</p>}
      <div className="ja-doc jp">
        {spans.length === 0
          ? filer.jpSourceExcerpt || "ソーステキストの抜粋を表示します。"
          : spans.map((s, i) =>
              s.type === "mark" && s.idx !== undefined ? (
                <mark
                  key={i}
                  data-cite={s.idx}
                  onClick={() =>
                    open({ citation: allCitations[s.idx!].ref, customId: filer.customId, globalIdx: s.idx! })
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      open({ citation: allCitations[s.idx!].ref, customId: filer.customId, globalIdx: s.idx! });
                    }
                  }}
                >
                  {s.text}
                  <span className="pg">{toSup(s.idx)}</span>
                </mark>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
      </div>
      <div className="foot">
        <span>{filer.displayLabel}</span>
        <span>cohere {filer.coherence.toFixed(2)}</span>
      </div>
      <span className="ld-source-stamp" aria-hidden="true">
        済
      </span>
    </div>
  );
});
