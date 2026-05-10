"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { MemoLine } from "@/lib/types";
import { useCiteDrawer } from "@/components/ui/cite-drawer";
import { TokenSpring } from "@/components/demo/token-spring";

interface Props {
  lines: MemoLine[];
  active: boolean;
  customId: string;
  onDone: () => void;
  onCiteClick?: (markIdx: number) => void;
  approved?: boolean;
}

const STAGGER_MS = 120;
const SETTLE_MS = 320;

function visibleText(line: MemoLine): string {
  return line.displayText ?? line.text;
}

function isBullet(line: MemoLine): boolean {
  return /^[•\-]\s/.test(visibleText(line));
}

function stripBulletGlyph(text: string): string {
  return text.replace(/^[•\-]\s+/, "");
}

export function LdOutput({
  lines,
  active,
  customId,
  onDone,
  onCiteClick,
  approved = false,
}: Props) {
  const open = useCiteDrawer();
  const reduced = useReducedMotion();
  const runIdRef = useRef(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!active) return;
    setStarted(true);
    runIdRef.current += 1;
    const myRun = runIdRef.current;
    const total = reduced ? 0 : lines.length * STAGGER_MS + SETTLE_MS;
    const t = window.setTimeout(() => {
      if (runIdRef.current === myRun) onDone();
    }, total);
    return () => window.clearTimeout(t);
  }, [active, lines, reduced, onDone]);

  const { tokens, citationSlots } = useMemo(() => {
    const toks: string[] = lines.map(() => "");
    const slots: Record<number, React.ReactNode> = {};
    let citeOffset = 0;
    lines.forEach((line, i) => {
      const fullText = visibleText(line);
      const bullet = isBullet(line);
      const body = bullet ? stripBulletGlyph(fullText) : fullText;
      const baseIdx = citeOffset;
      citeOffset += line.citations.length;
      slots[i] = (
        <p
          key={i}
          className={
            "memo-line" +
            (line.refused ? " refused" : "") +
            (bullet ? " memo-line-bullet" : "")
          }
        >
          {line.refused && <span className="badge">refused</span>}
          {body}
          {line.citations.map((c, j) => {
            const globalIdx = baseIdx + j;
            const handle = () => {
              open({ citation: c, customId, globalIdx });
              onCiteClick?.(globalIdx);
            };
            return (
              <sup
                key={j}
                className="cite-ref"
                role="button"
                tabIndex={0}
                onClick={handle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handle();
                  }
                }}
                data-cursor-preview={`cite:${customId}:${globalIdx}`}
                aria-label={`Citation: ${c.span.slice(0, 32)}`}
              >
                [{j + 1}]
              </sup>
            );
          })}
        </p>
      );
    });
    return { tokens: toks, citationSlots: slots };
  }, [lines, customId, open, onCiteClick]);

  if (!started) return null;

  return (
    <TokenSpring
      tokens={tokens}
      approved={approved}
      citationSlots={citationSlots}
      label="memo grounded"
      stagger={STAGGER_MS}
      direction="block"
    />
  );
}
