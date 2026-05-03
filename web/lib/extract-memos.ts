import { parseCitations, stripInlineCitations } from "./cite-regex";
import type { MemoLine } from "./types";

const SECTION_HEADER_RE = /^(\d+)\.\s+(.+)$/;
const REFUSAL_MARKER = /\[evidence insufficient\]/i;

/**
 * Words that, when they appear after ` - ` mid-line, signal a NEW bullet
 * that the model glued onto the previous one. We split on those.
 */
const BULLET_LEAD = /\s-\s+(?=(?:Conclusion|Risk|Note|Action|Caveat|Implication|Outlook|Recommendation|Watch|Followup|Follow-up|Caveats|Risks|Notes)\b[: ])/g;

/**
 * Split lines that the model concatenated with ` - Conclusion:` style
 * separators. Each split fragment becomes its own bullet.
 */
function splitGluedBullets(line: string): string[] {
  if (!BULLET_LEAD.test(line)) {
    BULLET_LEAD.lastIndex = 0;
    return [line];
  }
  BULLET_LEAD.lastIndex = 0;
  return line
    .split(BULLET_LEAD)
    .map((part, idx) => (idx === 0 ? part : `- ${part}`));
}

/**
 * Convert a leading `- ` into a real bullet `• ` so the rendered list looks
 * like a list, not Markdown source. Operates only on the display text.
 */
function prettifyBullet(text: string): string {
  return text.replace(/^\s*-\s+/, "• ");
}

export function parseMemoLines(memo: string): MemoLine[] {
  const out: MemoLine[] = [];
  for (const raw of memo.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    for (const piece of splitGluedBullets(raw)) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      const cleaned = prettifyBullet(stripInlineCitations(trimmed));
      out.push({
        text: trimmed,
        displayText: cleaned,
        citations: parseCitations(trimmed),
        refused: REFUSAL_MARKER.test(trimmed),
      });
    }
  }
  return out;
}

export function splitIntoMemoSections(memo: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let current = "";
  for (const line of memo.split(/\r?\n/)) {
    const m = line.match(SECTION_HEADER_RE);
    if (m) {
      current = m[2].trim();
      sections[current] = [];
    } else if (current && line.trim()) {
      sections[current].push(line);
    }
  }
  return sections;
}
