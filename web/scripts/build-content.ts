#!/usr/bin/env tsx
/**
 * Reads ../data/eval, ../docs, ../src/yuholens; emits typed JSON to web/data/*.generated.json.
 * No network calls. The site is fully deterministic at build.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHighlighter } from "shiki";
import { parseMemoLines } from "../lib/extract-memos";
import { parseJpName, shortenJpName } from "../lib/parse-jp-name";
import type { DecoderProfile, Filer, ReproRow } from "../lib/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");
const OUT = resolve(__dirname, "..", "data");

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

function readDecoderProfiles(): DecoderProfile[] {
  const py = readFileSync(
    join(ROOT, "src", "yuholens", "agents", "decoder_profiles.py"),
    "utf-8",
  );
  const block = py.match(/DEFAULT_PROFILES[\s\S]+?\n\)\n/);
  if (!block) throw new Error("DEFAULT_PROFILES not found");
  const entries = [...block[0].matchAll(/DecoderProfile\(\s*([\s\S]+?)\s*\)/g)].map((m) => {
    const body = m[1];
    const get = (key: string) => {
      const r = body.match(new RegExp(`${key}\\s*=\\s*([^,\\n]+)`));
      return r?.[1].trim().replace(/['"]/g, "") ?? "";
    };
    return {
      name: get("name"),
      temperature: Number(get("temperature")),
      top_p: Number(get("top_p")),
      repetition_penalty: Number(get("repetition_penalty")),
      no_repeat_ngram_size: Number(get("no_repeat_ngram_size") || "0"),
      seed: get("seed") ? Number(get("seed")) : null,
    };
  });
  return entries.map((e, i) => ({
    ...e,
    uiLabel: `P-${i + 1}`,
    isDefault: i === 2,
  }));
}

const JP_CHAR_RE = /[぀-ヿ㐀-䶿一-鿿]/g;

function jpRatio(s: string): number {
  if (!s) return 0;
  const matches = s.match(JP_CHAR_RE);
  return matches ? matches.length / s.length : 0;
}

function extractJpExcerpt(memo: string): string {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const m of memo.matchAll(/['"]([^'"]{20,400})['"]/g)) {
    const s = m[1];
    if (jpRatio(s) < 0.5) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    unique.push(s);
  }
  if (!unique.length) return "";
  // Sort by length and take the most substantial Japanese spans. Joining
  // with `。 ` reads as native prose; earlier versions emitted a single
  // span which gave the source pane a one-line excerpt.
  unique.sort((a, b) => b.length - a.length);
  return unique.slice(0, 4).join("。 ");
}

/** Map raw subset slug → human-readable label. */
function humaniseSubset(subset: string): string {
  const map: Record<string, string> = {
    earnings_forecast_v2: "Earnings Forecast",
    earnings_forecast: "Earnings Forecast",
    fraud_detection: "Fraud Detection",
    industry_prediction_v2: "Industry Prediction",
    industry_prediction: "Industry Prediction",
  };
  if (map[subset]) return map[subset];
  return subset
    .split("_")
    .filter((w) => w && !/^v\d+$/i.test(w))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Short fallback code when the JP name parse fails. */
function subsetCode(subset: string): string {
  const map: Record<string, string> = {
    earnings_forecast_v2: "EFC",
    earnings_forecast: "EFC",
    fraud_detection: "FRD",
    industry_prediction_v2: "IND",
    industry_prediction: "IND",
  };
  if (map[subset]) return map[subset];
  return subset
    .split("_")
    .filter((w) => w && !/^v\d+$/i.test(w))
    .map((w) => w.charAt(0).toUpperCase())
    .join("")
    .slice(0, 3) || subset.slice(0, 3).toUpperCase();
}

/** Build a friendly display label like `EDINET Row 00270 · Earnings Forecast`. */
function buildDisplayLabel(customId: string, subset: string): string {
  const tail = customId.split("-").slice(1).join("-") || customId;
  const padded = /^\d+$/.test(tail) ? tail.padStart(5, "0") : tail;
  return `EDINET Row ${padded} · ${humaniseSubset(subset)}`;
}

/**
 * Verified English / romanised filer names for the rows we ship in the live
 * demo. Sourced from each memo's own `Executive summary` line so the name is
 * already grounded in the corpus, never invented. Rows not listed fall back
 * to an empty string and the UI hides the secondary line.
 */
const EN_NAMES: Record<string, string> = {
  "earnings_forecast-00271": "Kintetsu Group Holdings",
  "industry_prediction-00373": "Nippon Steel Corporation",
  "industry_prediction-00398": "Asahi Holdings",
  "fraud_detection-00467": "SBI Holdings",
  "fraud_detection-00580": "Riso Education",
};

/**
 * Canonical Japanese legal names for picked rows whose memo prose either
 * skips the `株式会社` suffix (so `parseJpName` returns empty) or only matches
 * a partial fragment. These come from the row's own filing in EDINET-Bench;
 * never invented.
 */
const JP_NAMES: Record<string, string> = {
  "industry_prediction-00373": "日本製鉄株式会社",
  "industry_prediction-00398": "株式会社アサヒホールディングス",
  "fraud_detection-00467": "SBIホールディングス株式会社",
  "fraud_detection-00580": "株式会社リソー教育",
};

function readFilers(): Filer[] {
  const memosPath = join(ROOT, "data", "eval", "kg2_memos_bo5_picked.jsonl");
  const scoresPath = join(
    ROOT,
    "data",
    "eval",
    "kg2_per_memo_scores_bestof_v4v5_fresh.json",
  );

  if (!existsSync(memosPath)) {
    console.warn(`⚠ no memos at ${memosPath} — emitting empty filer list`);
    return [];
  }

  const memosFile = readFileSync(memosPath, "utf-8");
  const memos = memosFile
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as { custom_id: string; memo: string });

  const scoreMap = new Map<string, number>();
  if (existsSync(scoresPath)) {
    const scoresFile = JSON.parse(readFileSync(scoresPath, "utf-8")) as
      | Array<{ custom_id: string; coherence: number }>
      | { scores?: Array<{ custom_id: string; coherence: number }> };
    const arr = Array.isArray(scoresFile) ? scoresFile : (scoresFile.scores ?? []);
    for (const s of arr) scoreMap.set(s.custom_id, Number(s.coherence ?? 3));
  }

  const scored = memos
    .map((m) => ({ ...m, coherence: scoreMap.get(m.custom_id) ?? 3 }))
    .sort((a, b) => b.coherence - a.coherence);

  // Curated picked-set for the live demo. Locked in by the implementation
  // plan (Phase B · Task 11) so the demo always references rows whose
  // English filer name is verifiable from the memo text. Order = chip strip
  // order. If a row drops out of the JSONL at some future regeneration we
  // fall back to the highest-coherence remaining rows.
  // Picked rows must satisfy two constraints: (1) the memo introduces the
  // filer with a verifiable English name, and (2) the prose contains no
  // rounded-down placeholder figures (the model occasionally collapses
  // unknown values to ¥1,000,000,000 — those spans look broken on the page).
  // Earlier picks earnings_forecast-00288 and earnings_forecast_v2-00173 hit
  // constraint (2) and were swapped for the cleanest replacements available
  // in kg2_memos_bo5_picked.jsonl.
  const PICKED_DEMO_IDS = [
    "earnings_forecast-00271",
    "industry_prediction-00373",
    "industry_prediction-00398",
    "fraud_detection-00467",
    "fraud_detection-00580",
  ];
  const byId = new Map(scored.map((m) => [m.custom_id, m]));
  const pickedTop5 = PICKED_DEMO_IDS.map((id) => byId.get(id)).filter(
    (m): m is (typeof scored)[number] => Boolean(m),
  );
  if (pickedTop5.length < PICKED_DEMO_IDS.length) {
    console.warn(
      `⚠ ${PICKED_DEMO_IDS.length - pickedTop5.length} curated demo rows missing from JSONL — falling back to coherence-sorted top-5`,
    );
  }
  const fallbackTop5 = scored
    .filter((m) => !PICKED_DEMO_IDS.includes(m.custom_id) && m.coherence >= 4)
    .slice(0, PICKED_DEMO_IDS.length - pickedTop5.length);
  const baseTop5 =
    pickedTop5.length === PICKED_DEMO_IDS.length
      ? pickedTop5
      : [...pickedTop5, ...fallbackTop5];

  const refusalMemo =
    scored.find(
      (m) => m.coherence <= 3 && /\[evidence insufficient\]/i.test(m.memo),
    ) ?? scored[scored.length - 1];

  const toFiler = (
    m: { custom_id: string; memo: string; coherence: number },
    customIdOverride?: string,
  ): Filer => {
    const parsedJp = parseJpName(m.memo);
    const overrideJp = JP_NAMES[m.custom_id];
    const canonicalJp = overrideJp || parsedJp;
    const jpName = canonicalJp || m.custom_id;
    const subset = m.custom_id.split("-")[0];
    const finalId = customIdOverride ?? m.custom_id;
    const chipLabel = canonicalJp
      ? shortenJpName(canonicalJp) || subsetCode(subset)
      : subsetCode(subset);
    return {
      customId: finalId,
      jpName,
      enName: EN_NAMES[m.custom_id] ?? "",
      chipLabel,
      subset,
      displayLabel: buildDisplayLabel(finalId, subset),
      coherence: m.coherence,
      memo: parseMemoLines(m.memo),
      jpSourceExcerpt: extractJpExcerpt(m.memo),
    };
  };

  return [...baseTop5.map((m) => toFiler(m)), toFiler(refusalMemo, "REFUSE.X")];
}

type ShikiLang = "python" | "typescript" | "bash" | "text";

interface ScriptPreview {
  lang: ShikiLang;
  lines: string[];
  html: string;
}

function detectLang(scriptPath: string): ShikiLang {
  const lower = scriptPath.toLowerCase();
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".sh")) return "bash";
  return "text";
}

async function buildScriptPreviews(): Promise<Record<string, ScriptPreview>> {
  const ledgerPath = join(OUT, "repro-ledger.generated.json");
  if (!existsSync(ledgerPath)) {
    console.warn(`⚠ ${ledgerPath} missing — skipping script-preview step`);
    return {};
  }
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf-8")) as ReproRow[];
  const uniquePaths = Array.from(
    new Set(ledger.map((row) => row.scriptPath).filter(Boolean)),
  );

  const highlighter = await createHighlighter({
    themes: ["github-dark"],
    langs: ["python", "typescript", "bash"],
  });

  const previews: Record<string, ScriptPreview> = {};
  const missing: string[] = [];

  const escapeHtml = (s: string): string =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  for (const scriptPath of uniquePaths) {
    const absolute = join(ROOT, scriptPath);
    let raw: string;
    try {
      raw = readFileSync(absolute, "utf-8");
    } catch {
      missing.push(scriptPath);
      continue;
    }
    const lines = raw.split(/\r?\n/).slice(0, 8);
    const snippet = lines.join("\n");
    const lang = detectLang(scriptPath);
    const html =
      lang === "text"
        ? `<pre class="shiki github-dark"><code>${escapeHtml(snippet)}</code></pre>`
        : highlighter.codeToHtml(snippet, {
            lang,
            theme: "github-dark",
          });
    previews[scriptPath] = { lang, lines, html };
  }

  if (missing.length) {
    console.warn(
      `⚠ ${missing.length} scriptPath(s) could not be read; skipped: ${missing.join(", ")}`,
    );
  }

  return previews;
}

async function main(): Promise<void> {
  // Detect whether the gitignored eval sources are present. On Vercel /
  // any clean clone they are not, and we must NOT overwrite the committed
  // generated JSON with empty-fallback content. Locally, when the data is
  // present, we regenerate as before.
  const memosSourcePath = join(
    ROOT,
    "data",
    "eval",
    "kg2_memos_bo5_picked.jsonl",
  );
  const memosSourcePresent = existsSync(memosSourcePath);

  const profiles = readDecoderProfiles();

  writeFileSync(
    join(OUT, "decoder-profiles.generated.json"),
    JSON.stringify(profiles, null, 2),
  );

  console.log(`✓ wrote ${profiles.length} decoder profiles`);

  if (memosSourcePresent) {
    const filers = readFilers();
    writeFileSync(
      join(OUT, "filers.generated.json"),
      JSON.stringify(filers, null, 2),
    );
    writeFileSync(
      join(OUT, "memos.generated.json"),
      JSON.stringify(
        filers.slice(0, 6).map((f) => ({ ...f, memo: f.memo.slice(0, 4) })),
        null,
        2,
      ),
    );
    console.log(`✓ wrote ${filers.length} filers`);
  } else {
    console.warn(
      "⚠ kg2_memos_bo5_picked.jsonl missing — keeping committed filers/memos JSON",
    );
  }

  const previews = await buildScriptPreviews();
  const previewKeys = Object.keys(previews);
  writeFileSync(
    join(OUT, "repro-script-previews.generated.json"),
    JSON.stringify(previews, null, 2),
  );
  console.log(
    `✓ wrote ${previewKeys.length} repro script previews (${previewKeys.join(", ") || "none"})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
