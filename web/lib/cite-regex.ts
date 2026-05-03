import type { Citation } from "./types";

/**
 * Matches a single `(ref: ...)` block. The body may contain inner `()` so the
 * naive `[^)]` would truncate. We allow inner parens that appear inside a
 * single- or double-quoted span; the closing `)` is the first un-quoted one.
 *
 * Strategy: match `(ref:` then any sequence of either
 *   - a quoted segment `'...'` or `"..."` (which may contain `)`),
 *   - or any non-`)`/non-quote char,
 * up to the closing `)`.
 *
 * Capture groups:
 *   [1] full body between `(ref:` and the closing `)`.
 */
export const CITATION_RE =
  /\(ref:\s*((?:'[^']*'|"[^"]*"|[^)'"])+)\)/gi;

/**
 * Matches a single ref segment inside a `(ref: ...)` block.
 *
 * Capture groups:
 *   [1] quoted span (single or double quotes).
 *   [2] optional pageRef (everything after `p.` up to `;`, `,`, or end).
 */
const SEGMENT_RE = /['"]([^'"]+)['"]\s*(?:p\.([^);,"]+?))?(?=\s*[;,]|\s*$)/g;

export function parseCitations(line: string): Citation[] {
  const out: Citation[] = [];
  for (const block of line.matchAll(CITATION_RE)) {
    const body = (block[1] ?? "").trim();
    if (!body) continue;
    const segments = [...body.matchAll(SEGMENT_RE)];
    if (segments.length > 0) {
      for (const seg of segments) {
        out.push({
          span: (seg[1] ?? "").trim(),
          section: "",
          pageRef: (seg[2] ?? "").trim(),
        });
      }
      continue;
    }
    // Fallback: a body that didn't terminate cleanly. Pull the first quoted
    // span + optional `p.xxx` even if the lookahead failed.
    const fallback = body.match(/['"]([^'"]+)['"]\s*(?:p\.([^);,"]+))?/);
    if (fallback) {
      out.push({
        span: (fallback[1] ?? "").trim(),
        section: "",
        pageRef: (fallback[2] ?? "").trim(),
      });
    }
  }
  return out;
}

/**
 * Strip every `(ref: ...)` block from a line so the caller can render the
 * cleaned prose alongside numbered superscripts. Also tidies up the orphan
 * whitespace + period that `text (ref: ...).` leaves behind, so we don't
 * render `Foo .` with a space before the period.
 */
export function stripInlineCitations(line: string): string {
  return line
    .replace(CITATION_RE, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
