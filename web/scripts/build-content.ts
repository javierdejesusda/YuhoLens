#!/usr/bin/env tsx
/**
 * Reads ../data/eval, ../docs, ../src/yuholens; emits typed JSON to web/data/*.generated.json.
 * No network calls. The site is fully deterministic at build.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMemoLines } from "../lib/extract-memos";
import { parseJpName, shortenJpName } from "../lib/parse-jp-name";
import type {
  DecoderProfile,
  Filer,
  ArcPoint,
  ReproRow,
  FailureCase,
} from "../lib/types";

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

function readArcPoints(): ArcPoint[] {
  const FALLBACK_COHERENCE: Record<string, number> = {
    "v5 single": 3.56,
    "bo-2 mix": 3.72,
    "bo-3 seeds": 3.64,
    "bo-5 SHIP ★": 3.88,
    "bo-9": 4.04,
  };
  const stages: Array<[string, string, string, boolean]> = [
    ["kg2_scores_v5.json", "v5 single", "T=0.10 · top_p=0.9 · seed=5151", false],
    ["kg2_scores_bestof_v4v5.json", "bo-2 mix", "v4_mixed_warm + v5_seed_a", false],
    ["kg2_scores_bo3_picked.json", "bo-3 seeds", "v5_seed_a/b/c", false],
    ["kg2_scores_bo5_picked.json", "bo-5 SHIP ★", "v4×2 + v5×3 mix", true],
    ["kg2_scores_bo9_picked.json", "bo-9", "bo5 + 4 new profiles", false],
  ];
  return stages.map(([file, label, config, isShip]) => {
    const path = join(ROOT, "data", "eval", file);
    const stage = file.replace("kg2_scores_", "").replace(".json", "");
    if (!existsSync(path)) {
      console.warn(`⚠ missing ${file} — using fallback coherence`);
      return {
        stage,
        label,
        coherence: FALLBACK_COHERENCE[label] ?? 3.5,
        citationRate: 1.0,
        config,
        isShip,
        preview: "",
      };
    }
    const raw = JSON.parse(readFileSync(path, "utf-8"));
    return {
      stage,
      label,
      coherence: Number(raw.coherence ?? FALLBACK_COHERENCE[label] ?? 3.5),
      citationRate: Number(raw.citation ?? raw.citation_rate ?? 1.0),
      config,
      isShip,
      preview: typeof raw.preview === "string" ? raw.preview : "",
    };
  });
}

function extractJpExcerpt(memo: string): string {
  const m = [...memo.matchAll(/['"]([^'"]{20,400}[一-龯][^'"]*)['"]/g)];
  return m.length ? m[0][1] : "";
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
  "earnings_forecast-00288": "TOYO INK SC HOLDINGS",
  "earnings_forecast_v2-00173": "Asahi Group Holdings",
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
  "earnings_forecast-00288": "東洋インキSCホールディングス株式会社",
  "earnings_forecast_v2-00173": "アサヒグループホールディングス株式会社",
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
  const PICKED_DEMO_IDS = [
    "earnings_forecast-00271",
    "earnings_forecast-00288",
    "earnings_forecast_v2-00173",
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

function readReproLedger(): ReproRow[] {
  return [
    {
      key: "Hardware",
      value: "1× AMD Instinct MI300X — 192 GB HBM3 — ROCm 7.0",
      tag: "AMD",
      scriptPath: "configs/sft.yaml",
      isTotal: false,
    },
    {
      key: "Base model",
      value:
        "pfnet/nekomata-14b-pfn-qfin (Qwen 1, 14B, JP-finance pretrained)",
      tag: "PFN",
      scriptPath: "src/yuholens/training/sft.py",
      isTotal: false,
    },
    {
      key: "Fine-tune",
      value:
        "Full-parameter SFT · seq 8192 · 2 epochs · lr 1e-5 · paged_adamw_8bit",
      tag: "SFT",
      scriptPath: "src/yuholens/training/sft.py",
      isTotal: false,
    },
    {
      key: "Dataset",
      value:
        "1,910 rows from SakanaAI/EDINET-Bench (865 fraud + 549 earnings + 496 industry)",
      tag: "EDINET",
      scriptPath: "src/yuholens/training/teacher.py",
      isTotal: false,
    },
    {
      key: "Inference",
      value: "4-agent LangGraph · best-of-5 mixed decoder · gpt-5-mini judge",
      tag: "BO-5",
      scriptPath: "src/yuholens/agents/graph.py",
      isTotal: false,
    },
    {
      key: "Eval",
      value: "KG-2 PASS · coherence 3.88 · citation 1.000 · coverage 0.994",
      tag: "KG-2",
      scriptPath: "src/yuholens/eval/run_kg2.py",
      isTotal: false,
    },
    {
      key: "All-in cost",
      value: "~$80 · 23 days · open weights",
      tag: "MIT",
      scriptPath: "docs/blog_post.md",
      isTotal: true,
    },
  ];
}

function readFailures(): FailureCase[] {
  return [
    {
      num: "Case 01",
      type: "Hallucinated number",
      caughtBy: "Caught by Grounder",
      headline: [
        { text: "A claim with " },
        { text: "no Japanese span", em: true },
        { text: " gets refused." },
      ],
      claim:
        "Pass-2 drafted a sentence asserting a revenue figure that no Pass-1 span backed. The Citation-Grounder replaces the sentence with [evidence insufficient].",
      outputBlock:
        'draft  → "FY25 revenue is forecast at ¥12.4 trillion."\nground → [evidence insufficient]',
      customId: "fraud_detection-00467",
    },
    {
      num: "Case 02",
      type: "Ambiguous span",
      caughtBy: "Resolved by Critic",
      headline: [
        { text: "Two candidates disagree — the " },
        { text: "judge picks the tighter span", em: true },
        { text: "." },
      ],
      claim:
        "Two of five decoder profiles cited adjacent Japanese spans that overlap. The bo-5 judge selected the candidate whose citations matched a unique Pass-1 span.",
      outputBlock:
        "v4_mixed_warm  → score 3 (overlap)\nv5_seed_a      → score 4 ★ (unique span)",
      customId: "fraud_detection-00580",
    },
    {
      num: "Case 03",
      type: "Contradictory signal",
      caughtBy: "Logged · escalated",
      headline: [
        { text: "OCF up while DSO stretches — " },
        { text: "flagged, not muted", em: true },
        { text: "." },
      ],
      claim:
        "Pass-1 detected a positive operating-cash-flow swing alongside DSO drift. The memo surfaces the tension as a risk note rather than smoothing it away.",
      outputBlock:
        "OCF      +2.1B (positive)\nDSO      +6 days  (negative)\nRisk note  ★ kept",
      customId: "industry_prediction_v2-00119",
    },
  ];
}

function main(): void {
  const profiles = readDecoderProfiles();
  const arc = readArcPoints();
  const filers = readFilers();
  const repro = readReproLedger();
  const failures = readFailures();

  writeFileSync(
    join(OUT, "decoder-profiles.generated.json"),
    JSON.stringify(profiles, null, 2),
  );
  writeFileSync(
    join(OUT, "kg2-arc.generated.json"),
    JSON.stringify(arc, null, 2),
  );
  writeFileSync(
    join(OUT, "filers.generated.json"),
    JSON.stringify(filers, null, 2),
  );
  writeFileSync(
    join(OUT, "repro-ledger.generated.json"),
    JSON.stringify(repro, null, 2),
  );
  writeFileSync(
    join(OUT, "failures.generated.json"),
    JSON.stringify(failures, null, 2),
  );
  writeFileSync(
    join(OUT, "memos.generated.json"),
    JSON.stringify(
      filers.slice(0, 6).map((f) => ({ ...f, memo: f.memo.slice(0, 4) })),
      null,
      2,
    ),
  );

  console.log(`✓ wrote ${profiles.length} decoder profiles`);
  console.log(`✓ wrote ${arc.length} arc points`);
  console.log(`✓ wrote ${filers.length} filers`);
  console.log(`✓ wrote ${repro.length} repro rows`);
  console.log(`✓ wrote ${failures.length} failure cases`);
}

main();
