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
 * The model emits two pageRef shapes:
 *   1. Short codes — `p.B/S`, `p.P/L`, `p.CF`, `p.23`
 *   2. Full section titles in quotes — `p. "事業等のリスク"`
 *
 * We accept either, in that priority. Capture groups:
 *   [1] quoted span — always required, this is what gets cited.
 *   [2] quoted pageRef (when the model wrote `p. "事業等のリスク"`).
 *   [3] unquoted pageRef (short codes / page numbers).
 */
const SEGMENT_RE =
  /['"]([^'"]+)['"](?:\s*p\.\s*(?:['"]([^'"]+)['"]|([^);,"]+?(?=\s*(?:[;,)]|$)))))?/g;

export function parseCitations(line: string): Citation[] {
  const out: Citation[] = [];
  for (const block of line.matchAll(CITATION_RE)) {
    const body = (block[1] ?? "").trim();
    if (!body) continue;
    const segments = [...body.matchAll(SEGMENT_RE)];
    for (const seg of segments) {
      const pageRef = (seg[2] ?? seg[3] ?? "").trim();
      out.push({
        span: (seg[1] ?? "").trim(),
        section: "",
        pageRef,
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
