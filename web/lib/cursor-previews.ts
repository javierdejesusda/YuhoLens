import type { Filer } from "@/lib/types";

export interface Preview {
  title: string;
  meta: string;
  eyebrow?: string;
}

const STATIC_PREVIEWS: Record<string, Preview> = {
  "hf:yuholens-14b": {
    eyebrow: "HUGGINGFACE",
    title: "yuholens-14b",
    meta: "BF16 · 28.4 GB · MIT",
  },
  "hf:yuholens-14b-GGUF": {
    eyebrow: "HUGGINGFACE",
    title: "yuholens-14b-GGUF",
    meta: "Q3–Q8 · 7.18–14.03 GiB",
  },
  "gh:YuhoLens": {
    eyebrow: "GITHUB",
    title: "javierdejesusda/YuhoLens",
    meta: "MIT · pipeline + eval",
  },
  // Inline demo citations used by problem.tsx / how-it-works.tsx CiteDemo.
  // Spans paraphrase the JP source the demos surface in their `data-pop`.
  "cite:demo:fx": {
    eyebrow: "DEMO · §2.1",
    title: "急激な為替変動は営業利益率に重大な影響を及ぼす可能性がある",
    meta: "RISK · P23",
  },
  "cite:demo:fx-hedge": {
    eyebrow: "DEMO · §2.1",
    title: "為替予約",
    meta: "RISK · P24",
  },
};

let filersByCustomId: Map<string, Filer> | null = null;
let filersLoading: Promise<Map<string, Filer>> | null = null;

async function loadFilersIndex(): Promise<Map<string, Filer>> {
  if (filersByCustomId) return filersByCustomId;
  if (filersLoading) return filersLoading;
  filersLoading = import("@/data/filers.generated.json").then((mod) => {
    const filers = (mod.default ?? mod) as Filer[];
    filersByCustomId = new Map<string, Filer>(filers.map((f) => [f.customId, f]));
    return filersByCustomId;
  });
  return filersLoading;
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function metaForCitation(section: string, pageRef: string): string {
  const sec = (section || "").trim();
  const pg = (pageRef || "").trim();
  const parts: string[] = [];
  if (sec) parts.push(sec.toUpperCase());
  if (pg && pg !== "??") parts.push("P" + pg);
  if (parts.length === 0) return "EDINET CITATION";
  return parts.join(" · ");
}

function lookupCitePreviewSync(rest: string): Preview | null {
  if (!filersByCustomId) return null;
  const lastColon = rest.lastIndexOf(":");
  if (lastColon < 0) return null;
  const customId = rest.slice(0, lastColon);
  const idxStr = rest.slice(lastColon + 1);
  const idx = Number.parseInt(idxStr, 10);
  if (Number.isNaN(idx)) return null;
  const filer = filersByCustomId.get(customId);
  if (!filer) return null;
  let cursor = 0;
  for (const line of filer.memo) {
    for (const cite of line.citations) {
      if (cursor === idx) {
        return {
          eyebrow: customId,
          title: truncate(cite.span, 60),
          meta: metaForCitation(cite.section, cite.pageRef),
        };
      }
      cursor += 1;
    }
  }
  return null;
}

export function lookupPreview(key: string): Preview | null {
  if (!key) return null;
  const direct = STATIC_PREVIEWS[key];
  if (direct) return direct;
  if (key.startsWith("cite:")) {
    return lookupCitePreviewSync(key.slice(5));
  }
  return null;
}

// Optional: callers that want the cite preview can await this. Returns
// null if the key is unrecognised after the index has loaded.
export async function lookupPreviewAsync(key: string): Promise<Preview | null> {
  if (!key) return null;
  const direct = STATIC_PREVIEWS[key];
  if (direct) return direct;
  if (key.startsWith("cite:")) {
    await loadFilersIndex();
    return lookupCitePreviewSync(key.slice(5));
  }
  return null;
}

// Eagerly warm the filers index (called on first cite-target hover so
// subsequent previews are synchronous).
export function warmCitePreviews(): void {
  void loadFilersIndex();
}
