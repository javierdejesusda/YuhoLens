import type { EmphasisSegment } from "@/lib/types";

export type ProblemBeat = {
  num: string;
  label: string;
  headline: string;
  body: string;
  demoKind: "wall" | "split" | "lens";
};

export const PROBLEM_BEATS: ProblemBeat[] = [
  {
    num: "— Beat 01",
    label: "The wall",
    headline: "The wall.",
    body: "Eighty-eight thousand pages of Japanese regulatory filings. Published annually. Mostly unread outside Japan.",
    demoKind: "wall",
  },
  {
    num: "— Beat 02",
    label: "The translation gap",
    headline: "The translation gap.",
    body: "Machine translation loses the meaning. Professional translation takes weeks and costs thousands.",
    demoKind: "split",
  },
  {
    num: "— Beat 03",
    label: "The lens",
    headline: "The lens.",
    body: "YuhoLens reads the source. Translates with context. Refuses when the source doesn't say so.",
    demoKind: "lens",
  },
];

export type HowStep = {
  num: string;
  head: string;
  body: string;
  demoKind: "input" | "fetch" | "cite";
};

export const HOW_STEPS: HowStep[] = [
  {
    num: "Step 01 / Ingest",
    head: "Paste any EDINET row or ticker.",
    body: "Pull a row from EDINET-Bench, or upload your own filing. The pipeline runs section-split and span-grounding in one query.",
    demoKind: "input",
  },
  {
    num: "Step 02 / Fetch",
    head: "We fetch the source.",
    body: "Section-split, regex-bounded, page-aligned. Every claim will trace back to a specific span.",
    demoKind: "fetch",
  },
  {
    num: "Step 03 / Read",
    head: "Read it in English. With receipts.",
    body: "Span-cited memo. Hover any number to see the original Japanese and page reference.",
    demoKind: "cite",
  },
];

export const FAQ: Array<{ q: string; a: EmphasisSegment[] }> = [
  {
    q: "Why a 14B model? Why not GPT-4 over an API?",
    a: [
      { text: "Because the training and the eval close the loop. The whole pipeline reproduces in 23 days for " },
      { text: "~$80", bold: true },
      { text: " on one MI300X. Try doing that with a frontier API." },
    ],
  },
  {
    q: 'What does "refuse" actually do?',
    a: [
      { text: "The Citation-Grounder replaces any sentence whose citations don't match a Pass-1 span with " },
      { text: "[evidence insufficient]", bold: true },
      { text: ". The sentence stays in place; only the claim is pulled." },
    ],
  },
  {
    q: "Is the demo live?",
    a: [
      { text: "No. The demo is " },
      { text: "pre-recorded", bold: true },
      { text: " from the KG-2 best-of-5 picked set. The grounder logic is real; the streaming is simulated typing for editorial pacing." },
    ],
  },
  {
    q: "What's KG-2?",
    a: [
      { text: "Knowledge-grounding evaluation, generation 2. A 50-prompt test set evaluated on three gates: " },
      { text: "citation rate ≥ 0.70", bold: true },
      { text: ", " },
      { text: "section coverage ≥ 0.60", bold: true },
      { text: ", " },
      { text: "judge coherence ≥ 3.80", bold: true },
      { text: ". We pass all three." },
    ],
  },
  {
    q: "Why the MI300X specifically?",
    a: [
      { text: "Full-parameter SFT of a 14B model at sequence length 8192 needs ~140 GB peak VRAM. The MI300X has 192 GB of HBM3. " },
      { text: "An 80 GB H100 cannot fit this run.", bold: true },
    ],
  },
  {
    q: "Why no famous TSE tickers in the demo?",
    a: [
      { text: "EDINET-Bench is a curated subset. The shipped memos use " },
      { text: "real", bold: true },
      { text: " rows from the picked best-of-5 set — earnings_forecast-00271 (Kintetsu Group Holdings), earnings_forecast-00288 (TOYO INK SC HOLDINGS), fraud_detection-00467 (SBI Holdings), and the others you see in the chip strip. Honesty over flash." },
    ],
  },
];

export const MANIFESTO = [
  { i: "01", text: "A claim with no Japanese span is not a claim. It is a draft." },
  { i: "02", text: "The judge picks; the grounder refuses. Both must agree." },
  { i: "03", text: "Best-of-N is cheaper than another epoch." },
  { i: "04", text: "Open weights or it didn't happen." },
  { i: "05", text: "The yūhō is the source. The memo is the receipt." },
];
