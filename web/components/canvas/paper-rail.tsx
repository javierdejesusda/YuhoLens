"use client";
import { useEffect, useRef, useState } from "react";
import type * as THREE from "three";

const PAPER_W = 2.0;
const PAPER_H = 2.75;
const TEX_W = 1024;
const TEX_H = 1408;

type StageKey =
  | "hero"
  | "problem"
  | "how"
  | "repro"
  | "demo"
  | "hardware"
  | "dag"
  | "readalong"
  | "kg2"
  | "reports"
  | "failures"
  | "manifest"
  | "faq"
  | "access";

type PaperSide = "right" | "left" | "centre";

type StagePose = {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  s: number;
  side: PaperSide;
  texture: TextureKey;
  inkProgram: number;
};

type TextureKey = "hero" | "problem" | "how" | "rail" | "manifest" | "footer";

// Hero now centres the paper for a single full-bleed cinematic moment.
// CENTRE_HERO sits the paper right in the middle of the viewport with
// a slightly larger scale so it carries the whole frame without any
// flanking copy. After hero, the cycle reverts to LEFT/RIGHT.
// Phase 1 paper centred. The cover overlay (brand + tagline) sits ON
// the paper magazine-cover style, with a cream halo to keep it
// readable over the Japanese filing texture.
const CENTRE_HERO   = { x:  0.00, y: 0.00, z: 0.20,  rx: -0.04, ry:  0.00, rz: -0.02, s: 1.18 } as const;
const LEFT_BIG_NEAR = { x: -2.55, y: 0.05, z: 0.10,  rx: -0.05, ry:  0.26, rz: -0.04, s: 1.18 } as const;
const RIGHT_BIG_NEAR = { x: 2.55, y: 0.05, z: 0.10,  rx: -0.05, ry: -0.26, rz: 0.04, s: 1.18 } as const;
// Hide-zone parking poses: paper will already be faded by data-paper-hide,
// these just keep the underlying spring values from snapping if the user
// scrolls back up and the hide section becomes briefly active.
const PARK_RIGHT = { x: 2.55, y: 0.10, z: 0.0, rx: -0.05, ry: -0.22, rz: 0.04, s: 1.10 } as const;

// Side flow: hero=CENTRE, problem=LEFT, how=RIGHT, then the paper exits
// and stays gone for everything after readalong. The opposite-side flip
// between problem and how triggers the fly-out cycle; the transition
// from how → readalong (a data-paper-hide section) lets the natural
// fade-out + exit-transform path send the paper off-screen for good.
// Hero phase 2: same texture, but the paper auto-slides to the LEFT and
// the camera pulls back to the editorial Z=11 plane. Triggered by the
// Hero component flipping data-hero-phase="2" on its section element a
// few seconds after first paint.
const HERO_PHASE_2: StagePose = {
  ...LEFT_BIG_NEAR,
  side: "left",
  texture: "hero",
  inkProgram: 0,
};

const STAGES: Record<StageKey, StagePose> = {
  hero: { ...CENTRE_HERO, side: "centre", texture: "hero", inkProgram: 0 },
  problem: { ...LEFT_BIG_NEAR, side: "left", texture: "problem", inkProgram: 1 },
  how: { ...RIGHT_BIG_NEAR, side: "right", texture: "how", inkProgram: 2 },
  readalong: { ...PARK_RIGHT, side: "right", texture: "how", inkProgram: 2 },
  repro: { ...PARK_RIGHT, side: "right", texture: "rail", inkProgram: 3 },
  hardware: { ...PARK_RIGHT, side: "right", texture: "rail", inkProgram: 3 },
  access: { ...PARK_RIGHT, side: "right", texture: "footer", inkProgram: 5 },
  // Legacy stages — kept so type stays in sync with old data-paper-stage
  // attributes if they linger; all park on the right and are fade-hidden.
  demo: { ...PARK_RIGHT, side: "right", texture: "rail", inkProgram: 3 },
  dag: { ...PARK_RIGHT, side: "right", texture: "how", inkProgram: 2 },
  kg2: { ...PARK_RIGHT, side: "right", texture: "rail", inkProgram: 3 },
  reports: { ...PARK_RIGHT, side: "right", texture: "rail", inkProgram: 3 },
  failures: { ...PARK_RIGHT, side: "right", texture: "problem", inkProgram: 1 },
  manifest: { ...PARK_RIGHT, side: "right", texture: "manifest", inkProgram: 4 },
  faq: { ...PARK_RIGHT, side: "right", texture: "manifest", inkProgram: 4 },
};

const cachedTextures: Partial<Record<TextureKey, THREE.Texture>> = {};
const cachedAux: {
  back?: THREE.Texture;
  normal?: THREE.Texture;
  shadow?: THREE.Texture;
  rim?: THREE.Texture;
} = {};

function makeSpring(initial = 0, stiffness = 80, damping = 28) {
  let value = initial;
  let velocity = 0;
  return {
    get value() {
      return value;
    },
    target(t: number, dt: number) {
      const x = value - t;
      const a = -stiffness * x - damping * velocity;
      velocity += a * dt;
      value += velocity * dt;
    },
    set(v: number) {
      value = v;
      velocity = 0;
    },
  };
}

function paperBase(g: CanvasRenderingContext2D) {
  const grd = g.createLinearGradient(0, 0, 0, TEX_H);
  grd.addColorStop(0, "#F7EDD7");
  grd.addColorStop(1, "#E8DEC4");
  g.fillStyle = grd;
  g.fillRect(0, 0, TEX_W, TEX_H);
  for (let i = 0; i < 4500; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.025})`;
    g.fillRect(Math.random() * TEX_W, Math.random() * TEX_H, 1, 1);
  }
}

function paperHeader(g: CanvasRenderingContext2D, jp: string, code: string) {
  g.fillStyle = "#5C594F";
  g.font = "500 22px 'JetBrains Mono', monospace";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText(jp, 70, 90);
  g.textAlign = "right";
  g.fillText(code, TEX_W - 70, 90);
  g.strokeStyle = "rgba(14,14,16,0.35)";
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(70, 110);
  g.lineTo(TEX_W - 70, 110);
  g.stroke();
}

function paperFooter(g: CanvasRenderingContext2D, leftStr: string, rightStr: string) {
  g.strokeStyle = "rgba(14,14,16,0.2)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(70, TEX_H - 80);
  g.lineTo(TEX_W - 70, TEX_H - 80);
  g.stroke();
  g.fillStyle = "#5C594F";
  g.font = "400 16px 'JetBrains Mono', monospace";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText(leftStr, 70, TEX_H - 50);
  g.textAlign = "right";
  g.fillText(rightStr, TEX_W - 70, TEX_H - 50);
}

function paperStamp(g: CanvasRenderingContext2D, x: number, y: number, glyph: string) {
  g.save();
  g.translate(x, y);
  g.rotate(0.16);
  g.strokeStyle = "#E8503A";
  g.lineWidth = 3;
  g.beginPath();
  g.arc(0, 0, 70, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#E8503A";
  g.font = "700 70px 'Noto Serif JP', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(glyph, 0, 4);
  g.restore();
}

const buildHero = (g: CanvasRenderingContext2D) => {
  paperBase(g);
  // Memo header: filing identifier in Japanese on the left, filing
  // identifier in English/EDINET on the right — like the running header
  // of an actual yūhō page.
  paperHeader(g, "有価証券報告書 · 第120期", "EDINET 00271 · p.23 / 142");

  // Brand title block — sits at the top of the page like a memo
  // masthead: red 朱 sigil, "YuhoLens" wordmark, and a Japanese subtitle
  // identifying what this memo is about.
  const brandY = 200;
  g.fillStyle = "#E8503A";
  g.font = "700 96px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("朱", 70, brandY);

  g.fillStyle = "#15161A";
  g.font = "500 72px 'Playfair Display', serif";
  g.fillText("YuhoLens", 184, brandY - 4);

  // Japanese subtitle pinned to the right of the masthead — gives the
  // memo its actual subject ("Japanese filings · annotated").
  g.fillStyle = "#3A3833";
  g.font = "500 32px 'Noto Serif JP', serif";
  g.textAlign = "right";
  g.fillText("日本の有価証券報告書 · 註釈付", TEX_W - 70, brandY - 30);
  g.fillStyle = "#7A6D55";
  g.font = "italic 400 24px 'Playfair Display', serif";
  g.fillText("Japanese filings, annotated.", TEX_W - 70, brandY);

  // Heavy rule under the masthead — separates the title block from the
  // body of the memo.
  g.strokeStyle = "rgba(14,14,16,0.55)";
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(70, brandY + 36);
  g.lineTo(TEX_W - 70, brandY + 36);
  g.stroke();

  // Section heading — like the start of a new chapter inside the filing.
  g.fillStyle = "#15161A";
  g.font = "700 38px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("第二　事業等のリスク", 70, brandY + 92);
  g.fillStyle = "#7A6D55";
  g.font = "italic 400 22px 'Playfair Display', serif";
  g.textAlign = "right";
  g.fillText("II.  Risks affecting the business", TEX_W - 70, brandY + 92);

  // Dense Japanese body — three paragraphs of filing prose with English
  // marginalia/glosses on the right. Reads like a real yūhō page.
  g.textBaseline = "top";
  g.textAlign = "left";
  g.fillStyle = "#15161A";
  g.font = "400 24px 'Noto Serif JP', serif";

  // Paragraph 1: currency-risk preamble.
  const para1: string[] = [
    "（１）為替相場の変動について",
    "  当社グループは海外売上高比率が高く、為替相場の変",
    "  動が連結業績に及ぼす影響は大きい。特に米ドル及び",
    "  ユーロに対する円安進行は、輸入原材料コストの上昇",
    "  を通じて電子部品セグメントの営業利益率に重大な影",
    "  響を及ぼす可能性がある。当社は為替予約等のヘッジ",
    "  取引を実施しているものの、長期的な相場変動を完全",
    "  に相殺することは困難である。",
  ];
  let y = brandY + 142;
  for (const l of para1) {
    g.fillText(l, 70, y);
    y += 34;
  }
  // Highlight on the operative span (currency-risk → margin compression).
  g.fillStyle = "rgba(232,80,58,0.22)";
  g.fillRect(70, brandY + 282, TEX_W - 220, 36);
  g.fillStyle = "#15161A";
  g.font = "400 24px 'Noto Serif JP', serif";

  // Paragraph 2: financial impact statement.
  y += 14;
  const para2: string[] = [
    "（２）当連結会計年度の業績への影響",
    "  当連結会計年度における売上収益は前期比3.4%減と",
    "  なり、営業利益は17億円減少した。自己資本比率は",
    "  46.2%（前期末比 ▲1.8pt）に低下している。",
  ];
  for (const l of para2) {
    g.fillText(l, 70, y);
    y += 34;
  }

  // Paragraph 3: hedging caveat.
  y += 14;
  const para3: string[] = [
    "（３）ヘッジ方針の限界",
    "  当社は通常１２ヶ月以内の為替予約契約を主としてお",
    "  り、構造的・長期的な円安傾向には対応していない。",
  ];
  for (const l of para3) {
    g.fillText(l, 70, y);
    y += 34;
  }

  // English marginalia — stacked at the foot of the body, italic
  // Playfair like an editor's gloss in the margin of an annotated text.
  y += 28;
  g.strokeStyle = "rgba(14,14,16,0.3)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(70, y);
  g.lineTo(TEX_W - 70, y);
  g.stroke();
  y += 18;
  g.fillStyle = "#5C594F";
  g.font = "italic 400 22px 'Playfair Display', serif";
  g.fillText(
    "Prolonged yen weakness materially compresses",
    70,
    y,
  );
  y += 28;
  g.fillText(
    "operating margin in the electronic-components segment.¹",
    70,
    y,
  );
  y += 22;
  g.fillText("Hedging via forwards cannot fully offset long-cycle", 70, y);
  y += 28;
  g.fillText("currency drift.²", 70, y);

  // Citation receipts — vermilion mono labels stamped at the foot,
  // showing the page+span every claim is grounded in.
  g.fillStyle = "#E8503A";
  g.font = "500 18px 'JetBrains Mono', monospace";
  g.fillText("[1] 営業利益率, p.23 §2.1", 70, y + 36);
  g.fillText("[2] 為替予約, p.24 §2.1", 70, y + 64);

  paperFooter(g, "YUHOLENS · ingest", "span-cited · ✓");
};

const buildProblem = (g: CanvasRenderingContext2D) => {
  paperBase(g);
  paperHeader(g, "訂正・註釈 · ANNOTATED", "DRAFT · p.23 / 142");
  g.fillStyle = "#15161A";
  g.font = "700 40px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("LOST IN TRANSLATION", 70, 175);
  g.fillStyle = "#7A6D55";
  g.font = "italic 400 22px 'Playfair Display', serif";
  g.textAlign = "right";
  g.fillText("editor's marginalia", TEX_W - 70, 175);

  g.font = "400 24px 'Noto Serif JP', serif";
  g.textBaseline = "top";
  g.textAlign = "left";
  const jp = [
    "当社は為替変動の影響を最小化",
    "すべく努めておりますが、",
    "構造的な収益性の変化を完全に",
    "回避することは困難であります。",
  ];
  let y = 230;
  for (const l of jp) {
    g.fillStyle = "#15161A";
    g.fillText(l, 70, y);
    y += 36;
  }
  g.strokeStyle = "#E8503A";
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(70, 405);
  g.lineTo(610, 405);
  g.stroke();

  y = 470;
  g.font = "italic 400 22px 'Playfair Display', serif";
  g.fillStyle = "#9A4035";
  g.fillText('"endeavor to minimize impact"  ←  hedge', 70, y);
  y += 32;
  g.fillStyle = "#5C594F";
  g.fillText('"difficult to fully avoid"  ←  admission', 70, y);
  y += 32;
  g.fillStyle = "#9A4035";
  g.fillText('"structural change in profitability"  ←  margin loss', 70, y);

  g.strokeStyle = "#E8503A";
  g.lineWidth = 2.4;
  g.beginPath();
  g.ellipse(350, 248, 130, 26, 0, 0, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.ellipse(280, 320, 150, 24, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#E8503A";
  g.font = "italic 600 22px 'Playfair Display', serif";
  g.fillText("= structural margin", 670, 280);
  g.fillText("compression", 670, 308);

  g.fillStyle = "#5C594F";
  g.font = "400 18px 'JetBrains Mono', monospace";
  g.fillText("// auditor euphemism", TEX_W - 380, 250);
  g.fillText("// real meaning →", TEX_W - 380, 410);
  g.fillText("// hedged admission", TEX_W - 380, 322);

  let ny = 600;
  g.fillStyle = "#15161A";
  g.font = "700 26px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.fillText("（補足）為替予約の限界", 70, ny);
  g.fillStyle = "#7A6D55";
  g.font = "italic 400 20px 'Playfair Display', serif";
  g.textAlign = "right";
  g.fillText("supplementary, hedging cap", TEX_W - 70, ny);

  ny += 38;
  g.fillStyle = "#15161A";
  g.font = "400 22px 'Noto Serif JP', serif";
  g.textAlign = "left";
  const para2: string[] = [
    "  当社が締結する為替予約は概ね１２ヶ月",
    "  以内であり、長期にわたる円安基調を相殺",
    "  する設計とはなっておりません。当連結会",
    "  計年度においては、米ドル建て売上比率の",
    "  上昇に伴い、ヘッジ未対応部分の為替損失",
    "  が営業利益を１７億円押し下げました。",
  ];
  for (const l of para2) {
    g.fillText(l, 70, ny);
    ny += 32;
  }

  g.strokeStyle = "#E8503A";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(86, ny - 162);
  g.lineTo(TEX_W - 380, ny - 162);
  g.stroke();
  g.fillStyle = "#E8503A";
  g.font = "italic 600 22px 'Playfair Display', serif";
  g.textAlign = "left";
  g.fillText("→ unhedged USD exposure", TEX_W - 360, ny - 168);
  g.fillStyle = "#5C594F";
  g.font = "400 18px 'JetBrains Mono', monospace";
  g.fillText("// 17 億 ≈ ¥1.7 B", TEX_W - 360, ny - 138);

  ny += 18;
  g.strokeStyle = "rgba(14,14,16,0.3)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(70, ny);
  g.lineTo(TEX_W - 70, ny);
  g.stroke();
  ny += 22;
  g.fillStyle = "#15161A";
  g.font = "700 22px 'Playfair Display', serif";
  g.textAlign = "left";
  g.fillText("Translator's note", 70, ny);
  ny += 34;
  g.fillStyle = "#5C594F";
  g.font = "italic 400 20px 'Playfair Display', serif";
  const tn: string[] = [
    "Where the filing hedges, we cite. Where the",
    "filing admits, we underline. We do not paraphrase",
    "the operative span, it stays in 日本語, beside",
    "the gloss, so the reader can read both at once.",
  ];
  for (const l of tn) {
    g.fillText(l, 70, ny);
    ny += 28;
  }

  g.fillStyle = "#E8503A";
  g.font = "500 18px 'JetBrains Mono', monospace";
  g.fillText("[*] span p.23 §2.1, operative", 70, ny + 16);
  g.fillText("[†] span p.24 §2.1, hedging cap", 70, ny + 42);

  paperStamp(g, TEX_W - 180, TEX_H - 220, "訂");
  paperFooter(g, "translator · marginalia", "untranslated · ✕");
};

const buildHow = (g: CanvasRenderingContext2D) => {
  paperBase(g);
  paperHeader(g, "パイプライン仕様書 · v0.4", "INTERNAL · p.04 / 12");
  g.fillStyle = "#15161A";
  g.font = "700 44px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("処理パイプライン", 70, 180);
  g.fillStyle = "#7A6D55";
  g.font = "italic 400 22px 'Playfair Display', serif";
  g.textAlign = "right";
  g.fillText("A four-stage pipeline, span-grounded.", TEX_W - 70, 180);

  g.textBaseline = "top";
  g.textAlign = "left";
  const steps: Array<[string, string, string]> = [
    ["01", "INGEST", "EDINET 行 ID · 有報 PDF · 節分割"],
    ["02", "TRANSLATE", "英文メモ · span 単位 · 原文同伴"],
    ["03", "CITE", "ページ整列 · §節 / 行番号 · 引用候補"],
    ["04", "JUDGE", "Best-of-N · 棄却率 · 不確実時は留保"],
  ];
  let y = 240;
  for (const [n, en, jp] of steps) {
    g.strokeStyle = "rgba(14,14,16,0.22)";
    g.lineWidth = 1;
    g.strokeRect(70, y, TEX_W - 140, 122);
    g.fillStyle = "#E8503A";
    g.font = "700 26px 'JetBrains Mono', monospace";
    g.fillText(n, 90, y + 28);
    g.fillStyle = "#15161A";
    g.font = "700 32px 'Playfair Display', serif";
    g.fillText(en, 158, y + 26);
    g.fillStyle = "#5C594F";
    g.font = "400 22px 'Noto Serif JP', serif";
    g.fillText(jp, 158, y + 78);
    y += 132;
  }

  const tableY = y + 24;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#15161A";
  g.font = "700 28px 'Noto Serif JP', serif";
  g.fillText("ルーティング表", 70, tableY);
  g.fillStyle = "#7A6D55";
  g.font = "italic 400 20px 'Playfair Display', serif";
  g.textAlign = "right";
  g.fillText("Stage routing", TEX_W - 70, tableY);

  g.strokeStyle = "rgba(14,14,16,0.32)";
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(70, tableY + 14);
  g.lineTo(TEX_W - 70, tableY + 14);
  g.stroke();

  const rows: Array<[string, string, string]> = [
    ["split", "節分割 · spaCy-ja", "p.23 §2.1"],
    ["translate", "英文要約 · span保持", "p.23 §2.1"],
    ["cite", "原文引用 · 行番号付", "p.23 §2.1"],
    ["judge", "Best-of-5 · 留保判定", "p.24 §2.2"],
  ];
  let ry = tableY + 46;
  g.textBaseline = "alphabetic";
  for (const [stage, jp, ref] of rows) {
    g.fillStyle = "#E8503A";
    g.font = "500 20px 'JetBrains Mono', monospace";
    g.textAlign = "left";
    g.fillText(stage, 70, ry);
    g.fillStyle = "#15161A";
    g.font = "400 22px 'Noto Serif JP', serif";
    g.fillText(jp, 230, ry);
    g.fillStyle = "#5C594F";
    g.font = "400 18px 'JetBrains Mono', monospace";
    g.textAlign = "right";
    g.fillText(ref, TEX_W - 70, ry);
    g.strokeStyle = "rgba(14,14,16,0.14)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(70, ry + 12);
    g.lineTo(TEX_W - 70, ry + 12);
    g.stroke();
    ry += 36;
  }

  ry += 14;
  g.fillStyle = "#15161A";
  g.font = "400 22px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.textBaseline = "top";
  const noteJP: string[] = [
    "本パイプラインは原文 span を消去せず、",
    "英訳の隣に常に併置する。判定段階で",
    "信頼度が閾値を下回る場合、出力は留保",
    "され「未訳」として記録される。",
  ];
  for (const l of noteJP) {
    g.fillText(l, 70, ry);
    ry += 30;
  }

  g.fillStyle = "#7A6D55";
  g.font = "italic 400 20px 'Playfair Display', serif";
  g.textAlign = "right";
  let glossY = tableY + 46;
  const gloss: string[] = [
    "split, sentence-level",
    "translate, span-faithful",
    "cite, page + line aligned",
    "judge, abstain on doubt",
  ];
  for (const l of gloss) {
    g.fillText(l, TEX_W - 80, glossY);
    glossY += 36;
  }

  g.fillStyle = "#E8503A";
  g.font = "500 18px 'JetBrains Mono', monospace";
  g.textAlign = "left";
  g.fillText("[1] kg2_memos_bo5_picked.jsonl, n=5", 70, TEX_H - 158);
  g.fillText("[2] eval/citation_presence_rate.py", 70, TEX_H - 132);
  g.fillText("[3] orpo/v3.2, margin -0.015", 70, TEX_H - 106);

  paperStamp(g, TEX_W - 180, TEX_H - 260, "判");
  paperFooter(g, "pipeline · rev 0.4", "span-cited · ✓");
};

const buildRail = (g: CanvasRenderingContext2D) => {
  paperBase(g);
  paperHeader(g, "財務諸表 · 連結損益計算書", "EDINET 00271 · p.78 / 142");
  g.fillStyle = "#15161A";
  g.font = "700 40px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("営業利益率 推移", 70, 180);
  g.fillStyle = "#7A6D55";
  g.font = "italic 400 22px 'Playfair Display', serif";
  g.textAlign = "right";
  g.fillText("Operating margin, five-year", TEX_W - 70, 180);

  g.textBaseline = "top";
  const cols = ["FY20", "FY21", "FY22", "FY23", "FY24"];
  const vals = ["8.2%", "9.8%", "7.1%", "11.4%", "9.6%"];
  const startX = 70;
  const colW = (TEX_W - 140) / 5;
  g.fillStyle = "#5C594F";
  g.font = "500 22px 'JetBrains Mono', monospace";
  cols.forEach((cc, i) => {
    g.textAlign = "center";
    g.fillText(cc, startX + colW * i + colW / 2, 240);
  });
  g.strokeStyle = "rgba(14,14,16,0.3)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(70, 280);
  g.lineTo(TEX_W - 70, 280);
  g.stroke();

  g.fillStyle = "#15161A";
  g.font = "700 40px 'Playfair Display', serif";
  vals.forEach((v, i) => {
    g.textAlign = "center";
    g.fillText(v, startX + colW * i + colW / 2, 300);
  });

  const barY = 420;
  const barH = 200;
  const heights = [0.55, 0.75, 0.42, 1.0, 0.78];
  heights.forEach((h, i) => {
    const x = startX + colW * i + colW / 2 - 30;
    const hh = h * barH;
    g.fillStyle = i === 3 ? "#E8503A" : "rgba(14,14,16,0.55)";
    g.fillRect(x, barY + (barH - hh), 60, hh);
  });

  g.strokeStyle = "#E8503A";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(startX + colW * 3 + 10, barY - 20);
  g.lineTo(startX + colW * 3 + 10, barY - 40);
  g.lineTo(startX + colW * 3 + colW - 10, barY - 40);
  g.lineTo(startX + colW * 3 + colW - 10, barY - 20);
  g.stroke();
  g.fillStyle = "#E8503A";
  g.font = "italic 600 22px 'Playfair Display', serif";
  g.textAlign = "center";
  g.fillText("peak · cited p.78 §3.2", startX + colW * 3 + colW / 2, barY - 70);

  let ny = barY + barH + 60;
  g.fillStyle = "#15161A";
  g.font = "700 26px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.fillText("セグメント別 営業利益率", 70, ny);
  g.fillStyle = "#7A6D55";
  g.font = "italic 400 20px 'Playfair Display', serif";
  g.textAlign = "right";
  g.fillText("By segment, FY24", TEX_W - 70, ny);
  ny += 18;
  g.strokeStyle = "rgba(14,14,16,0.3)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(70, ny);
  g.lineTo(TEX_W - 70, ny);
  g.stroke();
  ny += 18;

  const segRows: Array<[string, string, string]> = [
    ["電子部品", "11.2%", "+1.6 pt"],
    ["産業機器", " 8.4%", "▲0.3 pt"],
    ["車載システム", " 7.1%", "▲1.1 pt"],
    ["ヘルスケア", "10.8%", "+0.4 pt"],
  ];
  for (const [name, val, delta] of segRows) {
    g.fillStyle = "#15161A";
    g.font = "400 22px 'Noto Serif JP', serif";
    g.textAlign = "left";
    g.fillText(name, 86, ny);
    g.fillStyle = "#15161A";
    g.font = "600 22px 'Playfair Display', serif";
    g.textAlign = "right";
    g.fillText(val, TEX_W - 260, ny);
    g.fillStyle = delta.startsWith("▲") ? "#9A4035" : "#5C594F";
    g.font = "500 20px 'JetBrains Mono', monospace";
    g.fillText(delta, TEX_W - 86, ny);
    ny += 32;
  }

  g.fillStyle = "#5C594F";
  g.font = "400 18px 'JetBrains Mono', monospace";
  g.textAlign = "left";
  g.fillText("source · EDINET · audited · ¥ 連結 · in millions", 70, TEX_H - 158);
  g.fillStyle = "#E8503A";
  g.fillText("[1] §3.2, peak FY23", 70, TEX_H - 132);
  g.fillText("[2] §3.4, segment table", 70, TEX_H - 106);

  paperStamp(g, TEX_W - 180, TEX_H - 240, "財");
  paperFooter(g, "figures · §3.2", "cited · ✓");
};

const buildManifest = (g: CanvasRenderingContext2D) => {
  paperBase(g);
  paperHeader(g, "宣言 · MANIFEST", "YUHOLENS · v1");
  g.fillStyle = "#15161A";
  g.font = "700 56px 'Playfair Display', serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("We translate", 70, 200);
  g.fillText("with the original", 70, 270);
  g.fillStyle = "#E8503A";
  g.fillText("still in view.", 70, 340);

  g.textBaseline = "top";
  g.fillStyle = "#15161A";
  g.font = "400 24px 'Noto Serif JP', serif";
  const tenets = [
    "一.  原文を消さず、隣に置く。",
    "二.  すべての訳出は span に紐づく。",
    "三.  推測しない。引用する。",
    "四.  読み手の時間を尊重する。",
  ];
  let y = 430;
  for (const l of tenets) {
    g.fillText(l, 70, y);
    y += 50;
  }

  g.fillStyle = "#5C594F";
  g.font = "italic 400 22px 'Playfair Display', serif";
  const en = [
    "Source first, never replaced.",
    "Every output is span-cited.",
    "No inference. Only quotation.",
    "Reader's time is sacred.",
  ];
  y = 430;
  for (const l of en) {
    g.fillText(l, 540, y + 8);
    y += 50;
  }

  let ny = y + 10;
  g.strokeStyle = "rgba(14,14,16,0.3)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(70, ny);
  g.lineTo(TEX_W - 70, ny);
  g.stroke();
  ny += 22;

  g.fillStyle = "#15161A";
  g.font = "700 26px 'Noto Serif JP', serif";
  g.fillText("実装方針", 70, ny);
  g.fillStyle = "#7A6D55";
  g.font = "italic 400 20px 'Playfair Display', serif";
  g.textAlign = "right";
  g.fillText("Implementation tenets", TEX_W - 70, ny);
  g.textAlign = "left";

  ny += 38;
  g.fillStyle = "#15161A";
  g.font = "400 22px 'Noto Serif JP', serif";
  const impl: string[] = [
    "  本モデルは有価証券報告書を span 単位で",
    "  処理し、原文と英訳を常に同伴させる。",
    "  判定段階で信頼度が閾値を下回る場合は",
    "  出力を留保し、未訳として記録する。",
  ];
  for (const l of impl) {
    g.fillText(l, 70, ny);
    ny += 30;
  }

  ny += 10;
  g.fillStyle = "#E8503A";
  g.font = "500 18px 'JetBrains Mono', monospace";
  g.fillText("[1] kg2_memos_bo5_picked.jsonl", 70, ny);
  g.fillText("[2] eval/citation_presence_rate.py", 70, ny + 26);
  g.fillText("[3] orpo/v3.2, frozen-judge", 70, ny + 52);

  paperStamp(g, TEX_W - 180, TEX_H - 240, "宣");
  paperFooter(g, "manifest · v1", "signed · ✓");
};

const buildFooter = (g: CanvasRenderingContext2D) => {
  paperBase(g);
  paperHeader(g, "結 · CLOSING", "YUHOLENS · " + new Date().getFullYear());

  g.fillStyle = "#15161A";
  g.font = "700 36px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("読了の記録", 70, 190);
  g.fillStyle = "#7A6D55";
  g.font = "italic 400 22px 'Playfair Display', serif";
  g.textAlign = "right";
  g.fillText("Closing colophon", TEX_W - 70, 190);
  g.strokeStyle = "rgba(14,14,16,0.32)";
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(70, 210);
  g.lineTo(TEX_W - 70, 210);
  g.stroke();

  g.textBaseline = "top";
  g.fillStyle = "#15161A";
  g.font = "400 22px 'Noto Serif JP', serif";
  g.textAlign = "left";
  const closing: string[] = [
    "  本書類は当社が EDINET に提出した有価",
    "  証券報告書をもとに、span 単位で英訳・",
    "  註釈を付したものである。原文は常に併",
    "  記し、信頼度の低い箇所は留保とした。",
  ];
  let cy = 240;
  for (const l of closing) {
    g.fillText(l, 70, cy);
    cy += 32;
  }

  g.fillStyle = "#15161A";
  g.font = "700 200px 'Noto Serif JP', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("結", TEX_W / 2, TEX_H / 2 - 40);

  g.fillStyle = "#5C594F";
  g.font = "italic 400 28px 'Playfair Display', serif";
  g.fillText("end of document", TEX_W / 2, TEX_H / 2 + 120);

  g.fillStyle = "#E8503A";
  g.font = "500 22px 'JetBrains Mono', monospace";
  g.fillText("with the original still in view", TEX_W / 2, TEX_H / 2 + 168);

  g.textBaseline = "top";
  g.textAlign = "left";
  g.fillStyle = "#5C594F";
  g.font = "400 18px 'JetBrains Mono', monospace";
  g.fillText("source · EDINET 00271 · audited", 70, TEX_H - 200);
  g.fillStyle = "#E8503A";
  g.fillText("[*] all spans cited · §1.0–§3.4", 70, TEX_H - 174);
  g.fillText("[†] no untranslated body remains", 70, TEX_H - 148);

  paperStamp(g, TEX_W / 2, TEX_H - 290, "完");
  paperFooter(g, "fin · " + new Date().getFullYear(), "archived · ✓");
};

const TEX_BUILDERS: Record<TextureKey, (g: CanvasRenderingContext2D) => void> = {
  hero: buildHero,
  problem: buildProblem,
  how: buildHow,
  rail: buildRail,
  manifest: buildManifest,
  footer: buildFooter,
};

function buildPaperTexture(THREE: typeof import("three"), key: TextureKey) {
  const c = document.createElement("canvas");
  c.width = TEX_W;
  c.height = TEX_H;
  TEX_BUILDERS[key](c.getContext("2d")!);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildBackTexture(THREE: typeof import("three")) {
  const c = document.createElement("canvas");
  c.width = TEX_W;
  c.height = TEX_H;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 0, TEX_H);
  grd.addColorStop(0, "#EFE5CD");
  grd.addColorStop(1, "#DFD3B6");
  g.fillStyle = grd;
  g.fillRect(0, 0, TEX_W, TEX_H);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.03})`;
    g.fillRect(Math.random() * TEX_W, Math.random() * TEX_H, 1, 1);
  }
  g.fillStyle = "#7E7B70";
  g.font = "400 18px 'JetBrains Mono', monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.save();
  g.translate(TEX_W / 2, TEX_H / 2);
  g.rotate(-Math.PI / 2);
  g.fillText("verso · margin notes · YUHOLENS ·", 0, 0);
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildNormalMap(THREE: typeof import("three")) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;
  const img = g.createImageData(512, 512);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    const m = (Math.random() - 0.5) * 22;
    img.data[i] = 128 + n;
    img.data[i + 1] = 128 + m;
    img.data[i + 2] = 240 + Math.random() * 15;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.globalAlpha = 0.18;
  g.strokeStyle = "rgb(140,128,255)";
  g.lineWidth = 0.4;
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const len = 8 + Math.random() * 24;
    const ang = Math.random() * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function buildRimGlowTexture(THREE: typeof import("three")) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grad.addColorStop(0, "rgba(232,80,58,0)");
  grad.addColorStop(0.7, "rgba(232,80,58,0.18)");
  grad.addColorStop(1, "rgba(232,80,58,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildShadowTexture(THREE: typeof import("three")) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 20, 128, 128, 120);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(0.6, "rgba(0,0,0,0.18)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const INK_W = 1024;
const INK_H = 1408;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function strokePath(ctx: CanvasRenderingContext2D, pts: number[][], p: number) {
  if (pts.length < 2 || p <= 0) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  const total = pts.length - 1;
  const reach = total * p;
  for (let i = 1; i <= total; i++) {
    if (i <= reach) {
      ctx.lineTo(pts[i][0], pts[i][1]);
    } else {
      const frac = reach - (i - 1);
      if (frac > 0) {
        const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * frac;
        const y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * frac;
        ctx.lineTo(x, y);
      }
      break;
    }
  }
  ctx.stroke();
}

const INK_PROGRAMS: Array<(ctx: CanvasRenderingContext2D, p: number) => void> = [
  (ctx, p) => {
    ctx.strokeStyle = "rgba(232,80,58,0.85)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    const e = easeOutCubic(p);
    strokePath(ctx, [[80, 286], [INK_W - 200, 286]], e);
    strokePath(ctx, [[80, 370], [600, 370]], e);
    if (p > 0.6) {
      ctx.beginPath();
      const r = (p - 0.6) / 0.4;
      ctx.arc(INK_W - 220, INK_H - 240, 70 * r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  (ctx, p) => {
    ctx.strokeStyle = "#E8503A";
    ctx.lineWidth = 2.5;
    const e = easeOutCubic(p);
    strokePath(ctx, [[80, 405], [620, 405]], e);
    ctx.lineWidth = 2.4;
    if (p > 0.4) {
      ctx.beginPath();
      const r = (p - 0.4) / 0.6;
      ctx.ellipse(370, 248, 130 * r, 26 * r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  (ctx, p) => {
    // Single ink underline beneath the section heading. The previous
    // four-line pattern bisected the step cards as the texture rendered.
    ctx.strokeStyle = "rgba(232,80,58,0.7)";
    ctx.lineWidth = 3;
    const e = easeOutCubic(p);
    strokePath(ctx, [[70, 200], [INK_W - 70, 200]], e);
  },
  (ctx, p) => {
    ctx.strokeStyle = "#E8503A";
    ctx.lineWidth = 3;
    const e = easeOutCubic(p);
    const startX = 70 + (INK_W - 140) * 0.6 + 10;
    const endX = 70 + (INK_W - 140) * 0.8 - 10;
    strokePath(
      ctx,
      [
        [startX, 400],
        [startX, 380],
        [endX, 380],
        [endX, 400],
      ],
      e,
    );
  },
  (ctx, p) => {
    ctx.strokeStyle = "#E8503A";
    ctx.lineWidth = 3;
    const e = easeOutCubic(p);
    if (e > 0) {
      ctx.beginPath();
      ctx.arc(INK_W - 180, INK_H - 230, 60 * e, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  (ctx, p) => {
    ctx.strokeStyle = "rgba(232,80,58,0.7)";
    ctx.lineWidth = 3;
    const e = easeOutCubic(p);
    strokePath(ctx, [[100, INK_H * 0.5], [INK_W - 100, INK_H * 0.5]], e);
  },
];

const VERLET_N = 24;

function makeVerlet() {
  return {
    pos: new Float32Array(VERLET_N),
    prev: new Float32Array(VERLET_N),
    acc: new Float32Array(VERLET_N),
  };
}

function verletStep(state: ReturnType<typeof makeVerlet>, dt: number) {
  for (let i = 0; i < VERLET_N; i++) {
    let neighbor = 0;
    if (i > 0) neighbor += state.pos[i - 1] - state.pos[i];
    if (i < VERLET_N - 1) neighbor += state.pos[i + 1] - state.pos[i];
    state.acc[i] += neighbor * 60.0;
    state.acc[i] -= state.pos[i] * 8.0;
  }
  state.pos[0] = 0;
  state.prev[0] = 0;
  state.pos[VERLET_N - 1] = 0;
  state.prev[VERLET_N - 1] = 0;
  const damp = 0.92;
  for (let i = 1; i < VERLET_N - 1; i++) {
    const vel = (state.pos[i] - state.prev[i]) * damp;
    const next = state.pos[i] + vel + state.acc[i] * dt * dt;
    state.prev[i] = state.pos[i];
    state.pos[i] = Math.max(-0.5, Math.min(0.5, next));
    state.acc[i] = 0;
  }
}

function verletAt(state: ReturnType<typeof makeVerlet>, u: number, v: number) {
  const edgeMask = Math.max(0, (u - 0.5) * 2);
  const idx = v * (VERLET_N - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(VERLET_N - 1, i0 + 1);
  const f = idx - i0;
  const z = state.pos[i0] * (1 - f) + state.pos[i1] * f;
  return z * edgeMask;
}

function bendPaper(
  pos: Float32Array,
  rest: Float32Array,
  curl: number,
  wave: number,
  flap: number,
  slack: number,
  time: number,
  verlet: ReturnType<typeof makeVerlet>,
  cursorU: number,
  cursorV: number,
  cursorPress: number,
) {
  if (!Number.isFinite(curl)) curl = 0;
  if (!Number.isFinite(wave)) wave = 0;
  if (!Number.isFinite(flap)) flap = 0;
  if (!Number.isFinite(slack)) slack = 0;
  if (!Number.isFinite(time)) time = 0;
  if (!Number.isFinite(cursorPress)) cursorPress = 0;
  const cursorActive = Math.abs(cursorPress) > 0.001;
  for (let i = 0; i < pos.length; i += 3) {
    const px = rest[i];
    const py = rest[i + 1];
    const u = Math.max(0, Math.min(1, px / PAPER_W + 0.5));
    const v = Math.max(0, Math.min(1, py / PAPER_H + 0.5));
    const verletZ = verletAt(verlet, u, v) * 0.6;
    const edgeMask = Math.max(0, Math.min(1, (u - 0.45) / 0.55));
    const curlZ = Math.sin(edgeMask * (Math.PI / 2)) * curl * 0.65;
    const waveDist = Math.abs(u - wave);
    const waveStrength = Math.exp(-waveDist * 14) * (wave > 0.02 && wave < 0.98 ? 1 : 0);
    const waveZ = waveStrength * 0.42 * (1 - Math.abs(0.5 - wave) * 1.4);
    const cornerMask = Math.pow(u, 2.5) * Math.pow(Math.max(0, 1 - v), 2.5);
    const flapZ = cornerMask * flap * 0.85;
    const wind1 = Math.sin(u * 4.0 + v * 2.5 - time * 1.4) * 0.022;
    const wind2 = Math.sin(u * 8.0 - time * 1.9) * Math.cos(v * 5.0 + time * 1.1) * 0.012;
    const wind3 = Math.sin(u * 16.0 + time * 2.4) * Math.cos(v * 12.0 - time * 1.7) * 0.005;
    const edgeFalloff = 1 - 4 * (u - 0.5) * (u - 0.5) * (v - 0.5) * (v - 0.5);
    const ripple = (wind1 + wind2 + wind3) * (0.5 + edgeFalloff * 0.5);
    const sagMask = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
    const sagY = -sagMask * slack * 0.1;
    const sagZ = -sagMask * slack * 0.06;
    const yWobble = Math.sin(u * 5.0 + time * 1.6) * 0.006 * (1 - sagMask * 0.5);
    // Cursor bump: subtle volume-conserving deformation centred on the
    // cursor's UV. Most of the displacement is the positive gaussian
    // lobe; the (1 - 0.6·r²) factor adds only a faint counter-curve at
    // the rim, since real paper barely dips around a press. Tight radius
    // weights (50/32) keep the footprint at ~10% of the paper, with
    // mild vertical anisotropy along the washi grain.
    let cursorZ = 0;
    if (cursorActive) {
      const du = u - cursorU;
      const dv = v - cursorV;
      const r2 = du * du * 50 + dv * dv * 32;
      cursorZ = (1 - 0.6 * r2) * Math.exp(-r2) * cursorPress;
    }
    const newY = py + ripple * 0.5 + sagY + yWobble;
    const newZ = curlZ + waveZ + flapZ + sagZ + ripple + verletZ + cursorZ;
    pos[i] = px;
    pos[i + 1] = Number.isFinite(newY) ? newY : py;
    pos[i + 2] = Number.isFinite(newZ) ? newZ : 0;
  }
}

const PAPER_X_RANGE = 1.8;
function normalizePaperX(x: number) {
  const n = x / PAPER_X_RANGE;
  if (n > 1) return 1;
  if (n < -1) return -1;
  return n;
}

function ReducedMotionFallback() {
  return (
    <>
      <div
        className="paper-edge-bleed"
        data-stage-from="hero"
        data-stage-to="problem"
        data-static="1"
        aria-hidden="true"
      />
      <div
        id="paper-stage"
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: 1,
          opacity: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: "8vw",
        }}
      >
      <article
        style={{
          width: "min(420px, 36vw)",
          aspectRatio: "5 / 7",
          padding: "42px 38px",
          background: "linear-gradient(180deg, #F4EAD3 0%, #ECE0C5 100%)",
          color: "#15161A",
          fontFamily: "var(--f-jp)",
          boxShadow:
            "0 60px 120px -30px rgba(14,14,16,0.6), 0 20px 40px -10px rgba(14,14,16,0.4), inset 0 1px 0 rgba(255,255,255,0.5)",
          transform: "rotate(-1.4deg)",
          position: "relative",
        }}
      >
        <div
          style={{
            fontFamily: "var(--f-mono)",
            fontSize: 9,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "#5C594F",
            borderBottom: "1px solid rgba(14,14,16,0.18)",
            paddingBottom: 12,
            marginBottom: 22,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>有価証券報告書 · 第120期</span>
          <span style={{ color: "#E8503A" }}>EDINET 00271</span>
        </div>
        <h3 style={{ margin: "0 0 18px", fontWeight: 700, fontSize: 22, lineHeight: 1.4 }}>
          事業等のリスク
        </h3>
        <p style={{ fontSize: 14, lineHeight: 1.95, margin: "0 0 20px", color: "#2A2620" }}>
          為替相場の変動は当社グループの
          <mark style={{ background: "rgba(232,80,58,0.28)", padding: "0 2px" }}>
            営業利益率に重大な影響
          </mark>
          を及ぼす可能性があり、特に急激な円安は電子部品セグメントにおいて原材料コストを押し上げる要因となる。
        </p>
      </article>
      </div>
    </>
  );
}

export function PaperRail() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const motionMedia = matchMedia("(prefers-reduced-motion: reduce)");
    if (motionMedia.matches) {
      const root = document.documentElement;
      root.classList.add("has-paper");
      root.dataset.paperSide = "right";
      root.style.setProperty("--paper-x", "0.85");
      root.style.setProperty("--paper-y", "0");
      root.style.setProperty("--paper-progress", "0");
      root.style.setProperty("--paper-vel", "0");
      setReduced(true);
      return () => {
        root.classList.remove("has-paper");
        delete root.dataset.paperSide;
        root.style.removeProperty("--paper-x");
        root.style.removeProperty("--paper-y");
        root.style.removeProperty("--paper-progress");
        root.style.removeProperty("--paper-vel");
      };
    }
    const stage = stageRef.current;
    if (!stage) return;

    let disposed = false;
    let raf = 0;
    let active = true;
    let cleanup = () => {};
    let preloaderListener: (() => void) | null = null;
    let motionChangeListener: ((ev: MediaQueryListEvent) => void) | null = null;

    const boot = async () => {
      const THREE = await import("three").then((m) => ({ ...m }));
      if (disposed) return;

      const W = stage.clientWidth || window.innerWidth;
      const H = stage.clientHeight || window.innerHeight;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
      renderer.setSize(W, H);
      if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      stage.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("aria-hidden", "true");
      stage.classList.add("is-on");

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, W / H, 0.1, 100);
      camera.position.set(0, 0, 8.6);

      const paperGroup = new THREE.Group();
      scene.add(paperGroup);

      const SEG_X = 80;
      const SEG_Y = 56;
      const frontGeom = new THREE.PlaneGeometry(PAPER_W, PAPER_H, SEG_X, SEG_Y);
      const backGeom = new THREE.PlaneGeometry(PAPER_W, PAPER_H, SEG_X, SEG_Y);
      const frontRest = new Float32Array(frontGeom.attributes.position.array);
      const backRest = new Float32Array(backGeom.attributes.position.array);

      const ensureTexture = (key: TextureKey) => {
        if (!cachedTextures[key]) {
          cachedTextures[key] = buildPaperTexture(THREE, key);
        }
        return cachedTextures[key];
      };
      ensureTexture("hero");
      if (!cachedAux.back) cachedAux.back = buildBackTexture(THREE);
      if (!cachedAux.normal) cachedAux.normal = buildNormalMap(THREE);
      if (!cachedAux.shadow) cachedAux.shadow = buildShadowTexture(THREE);
      if (!cachedAux.rim) cachedAux.rim = buildRimGlowTexture(THREE);

      const frontMat = new THREE.MeshStandardMaterial({
        map: ensureTexture("hero"),
        side: THREE.FrontSide,
        transparent: true,
        roughness: 0.7,
        metalness: 0.0,
        emissive: new THREE.Color(0xf4ead3),
        emissiveMap: ensureTexture("hero"),
        emissiveIntensity: 0.1,
        normalMap: cachedAux.normal,
        normalScale: new THREE.Vector2(0.32, 0.32),
        envMapIntensity: 0.55,
      });
      const backMat = new THREE.MeshStandardMaterial({
        map: cachedAux.back,
        side: THREE.BackSide,
        transparent: true,
        roughness: 0.85,
        metalness: 0.0,
        emissive: new THREE.Color(0xe8e0cc),
        emissiveMap: cachedAux.back,
        emissiveIntensity: 0.08,
        normalMap: cachedAux.normal,
        normalScale: new THREE.Vector2(0.22, 0.22),
        envMapIntensity: 0.4,
      });
      const frontMesh = new THREE.Mesh(frontGeom, frontMat);
      const backMesh = new THREE.Mesh(backGeom, backMat);
      backMesh.position.z = -0.012;
      backMesh.scale.set(1.005, 1.005, 1);
      frontMesh.frustumCulled = false;
      backMesh.frustumCulled = false;
      paperGroup.add(frontMesh);
      paperGroup.add(backMesh);

      const shadowGeom = new THREE.PlaneGeometry(PAPER_W * 1.4, PAPER_H * 1.4);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: cachedAux.shadow,
        transparent: true,
        depthWrite: false,
      });
      const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
      shadowMesh.position.z = -0.25;
      paperGroup.add(shadowMesh);

      const sweepGeom = new THREE.PlaneGeometry(PAPER_W * 1.1, 0.06);
      const sweepMat = new THREE.MeshBasicMaterial({
        color: 0xe8503a,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sweepMesh = new THREE.Mesh(sweepGeom, sweepMat);
      sweepMesh.position.z = 0.02;
      paperGroup.add(sweepMesh);

      const rimGlowGeom = new THREE.PlaneGeometry(PAPER_W * 1.25, PAPER_H * 1.15);
      const rimGlowMat = new THREE.MeshBasicMaterial({
        map: cachedAux.rim,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0.6,
      });
      const rimGlow = new THREE.Mesh(rimGlowGeom, rimGlowMat);
      rimGlow.position.z = -0.18;
      paperGroup.add(rimGlow);

      const inkCanvas = document.createElement("canvas");
      inkCanvas.width = INK_W;
      inkCanvas.height = INK_H;
      const inkCtx = inkCanvas.getContext("2d")!;
      const inkTex = new THREE.CanvasTexture(inkCanvas);
      if (THREE.SRGBColorSpace) inkTex.colorSpace = THREE.SRGBColorSpace;
      const inkMat = new THREE.MeshBasicMaterial({
        map: inkTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      });
      const inkMesh = new THREE.Mesh(frontGeom, inkMat);
      inkMesh.position.z = 0.001;
      inkMesh.frustumCulled = false;
      paperGroup.add(inkMesh);

      let inkProgress = 0;
      let waveStart = -1;
      const renderInk = (idx: number, p: number) => {
        inkCtx.clearRect(0, 0, INK_W, INK_H);
        const prog = INK_PROGRAMS[idx] || INK_PROGRAMS[0];
        prog(inkCtx, Math.max(0, Math.min(1, p)));
        inkTex.needsUpdate = true;
      };
      renderInk(0, 0);

      const verlet = makeVerlet();

      const keyLight = new THREE.DirectionalLight(0xfff8e8, 1.4);
      keyLight.position.set(-2, 2.5, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xffd9b8, 0.55);
      fillLight.position.set(3, -1, 3);
      scene.add(fillLight);
      const rimLight = new THREE.DirectionalLight(0xe8503a, 0.25);
      rimLight.position.set(0, 0, -3);
      scene.add(rimLight);
      const ambient = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambient);

      const DUST_COUNT = 280;
      const dustGeom = new THREE.BufferGeometry();
      const dustPos = new Float32Array(DUST_COUNT * 3);
      const dustVel = new Float32Array(DUST_COUNT * 3);
      for (let i = 0; i < DUST_COUNT; i++) {
        dustPos[i * 3] = (Math.random() - 0.5) * 16;
        dustPos[i * 3 + 1] = (Math.random() - 0.5) * 10;
        dustPos[i * 3 + 2] = (Math.random() - 0.5) * 6;
        dustVel[i * 3] = (Math.random() - 0.5) * 0.0008;
        dustVel[i * 3 + 1] = (Math.random() - 0.5) * 0.0006 + 0.0002;
        dustVel[i * 3 + 2] = (Math.random() - 0.5) * 0.0004;
      }
      dustGeom.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
      const dustMat = new THREE.PointsMaterial({
        color: 0xf4ead3,
        size: 0.02,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      });
      const dust = new THREE.Points(dustGeom, dustMat);
      scene.add(dust);

      let activeStage: StageKey = "hero";
      const initialPose = STAGES[activeStage];
      // Position springs: gentle (stiffness 80, damping 28) so the paper
      // glides between zones instead of snapping. Rotation springs are
      // even softer to keep the paper from twitching when scroll velocity
      // jumps.
      const spX = makeSpring(initialPose.x, 80, 28);
      const spY = makeSpring(initialPose.y, 80, 28);
      const spZ = makeSpring(initialPose.z, 80, 28);
      const spRX = makeSpring(initialPose.rx, 60, 24);
      const spRY = makeSpring(initialPose.ry, 60, 24);
      // First-paint settle: start rz off-target by ~0.04 rad and let the
      // spring damp back. Reads as a tiny "place down" gesture (~220ms),
      // not a slide-in.
      const spRZ = makeSpring(initialPose.rz + 0.04, 60, 24);
      // Same idea for scale — start a touch smaller so the paper "lands"
      // into its hero pose rather than appearing already at rest.
      const spS = makeSpring(initialPose.s * 0.96, 70, 22);
      // Camera dolly + exit-flight springs.
      const spCamZ = makeSpring(8.6, 55, 22);
      const spExit = makeSpring(0, 90, 26); // 0 = on-stage, 1 = flown out
      // Texture-change "punch" — squashes scale briefly when the doc swaps.
      const spPunch = makeSpring(1, 240, 22);

      // Cursor-bump physics. Paper has high internal damping and tracks
      // a finger closely, so all three springs are overdamped or near-
      // critical, no ringing. spBumpU/V (100/28) lock to the cursor with
      // a barely-perceptible lag and no overshoot. spBumpAmp (70/18) is
      // close to critical damping with one tiny overshoot, so a press
      // rises sharply, returns smoothly, and never oscillates like a
      // tuning fork.
      const spBumpU = makeSpring(0.5, 100, 28);
      const spBumpV = makeSpring(0.5, 100, 28);
      const spBumpAmp = makeSpring(0, 70, 18);

      const sectionEls = Array.from(
        document.querySelectorAll<HTMLElement>("[data-paper-stage]"),
      );
      const visibility = new Map<HTMLElement, number>();
      const sectionStage = new Map<HTMLElement, StageKey>();
      const sectionHide = new Map<HTMLElement, boolean>();
      let heroEl: HTMLElement | null = null;
      let problemEl: HTMLElement | null = null;
      let readalongEl: HTMLElement | null = null;
      for (const el of sectionEls) {
        const k = el.dataset.paperStage as StageKey | undefined;
        if (k && k in STAGES) sectionStage.set(el, k);
        sectionHide.set(el, el.hasAttribute("data-paper-hide"));
        if (k === "hero") heroEl = el;
        if (k === "problem") problemEl = el;
        if (k === "readalong") readalongEl = el;
      }
      let targetFade = 1;
      // Side-swap state machine. When the active stage flips between two
      // visible-paper sections that sit on OPPOSITE sides (e.g. hero LEFT
      // → problem RIGHT), we don't want the paper to slide diagonally
      // across the headline — instead it flies OUT along its current
      // side, swaps texture/pose mid-flight, then flies BACK IN from the
      // new side. This is the "fly-out / swap / fly-in" choreography.
      //   idle      — paper at its stage pose, exit spring → 0
      //   exiting   — exit spring driven → 1, opacity → 0
      //   swapping  — instantaneous: flip activeStage to the queued one,
      //               update side/texture, then transition to entering
      //   entering  — exit spring released → 0, opacity → 1
      type TransitionPhase = "idle" | "exiting" | "entering";
      let transitionPhase: TransitionPhase = "idle";
      let queuedStage: StageKey | null = null;
      let transitionStart = 0;
      // Sticky disable once we've crossed into the post-readalong band; clears if the user scrolls back up to a visible-paper stage. Kills inter-section frame-flashes between repro/hardware/access where hideMax briefly drops below the fade threshold.
      let paperTerminalDisabled = false;
      const HIDE_TERMINAL: ReadonlySet<StageKey> = new Set([
        "readalong",
        "repro",
        "hardware",
        "access",
      ]);
      const VISIBLE_PAPER: ReadonlySet<StageKey> = new Set([
        "hero",
        "problem",
        "how",
      ]);
      const EXIT_MS = 320;   // time spent flying off-screen
      const ENTER_MS = 380;  // time spent flying back in
      // 0.65: paper finishes EXIT_MS+ENTER_MS (~700ms) before the next section's headline reaches viewport center, so the side-flip lands before the user reads the new heading.
      const TRIGGER_FRACTION = 0.65;
      const pickActive = () => {
        const vh = window.innerHeight || 1;
        const triggerY = vh * TRIGGER_FRACTION;
        let bestEl: HTMLElement | null = null;
        let bestDist = Infinity;
        let visibleBestEl: HTMLElement | null = null;
        let visibleBestDist = Infinity;
        let lastVisibleStageEl: HTMLElement | null = null;
        let lastVisibleStageRatio = 0;
        for (const [el, ratio] of visibility) {
          const r = el.getBoundingClientRect();
          const center = r.top + r.height / 2;
          const dist = Math.abs(center - triggerY);
          // Section spans the trigger line — strong claim on the paper.
          const spans = r.top <= triggerY && r.bottom >= triggerY;
          const score = spans ? dist : dist + vh;
          if (score < bestDist) {
            bestDist = score;
            bestEl = el;
          }
          if (!sectionHide.get(el)) {
            if (score < visibleBestDist) {
              visibleBestDist = score;
              visibleBestEl = el;
            }
            if (ratio > lastVisibleStageRatio) {
              lastVisibleStageRatio = ratio;
              lastVisibleStageEl = el;
            }
          }
        }
        const target = visibleBestEl ?? bestEl;
        if (target) {
          const k = sectionStage.get(target);
          if (k && k !== activeStage && k !== queuedStage) {
            const incoming = STAGES[k];
            const current = STAGES[activeStage];
            const oppositeSides =
              (current.side === "left" && incoming.side === "right") ||
              (current.side === "right" && incoming.side === "left");
            const isHide = sectionHide.get(target) ?? false;
            // Opposite-side flip between two visible sections triggers
            // the fly-out cycle. Same-side flips and hide-zone entries
            // fall through to the immediate swap below.
            if (oppositeSides && !isHide && transitionPhase === "idle") {
              queuedStage = k;
              transitionPhase = "exiting";
              transitionStart = performance.now();
            } else if (transitionPhase === "idle") {
              activeStage = k;
              inkProgress = 0;
              waveStart = performance.now();
              spPunch.set(0.92);
            }
          }
        }
        if (HIDE_TERMINAL.has(activeStage)) {
          paperTerminalDisabled = true;
        } else if (VISIBLE_PAPER.has(activeStage)) {
          paperTerminalDisabled = false;
        }
        // Position-based early-disable: as soon as readalong's top edge crosses
        // the viewport bottom, force the terminal flag. Triggers ~150–200ms
        // before the readalong heading is read, so the paper is fully gone.
        if (readalongEl) {
          const rTop = readalongEl.getBoundingClientRect().top;
          if (Number.isFinite(rTop) && rTop < vh) {
            paperTerminalDisabled = true;
          }
        }
        const visibleStageMax = Number.isFinite(lastVisibleStageRatio)
          ? lastVisibleStageRatio
          : 0;
        let hideMax = 0;
        for (const [el, ratio] of visibility) {
          if (sectionHide.get(el) && Number.isFinite(ratio) && ratio > hideMax) {
            hideMax = ratio;
          }
        }
        if (paperTerminalDisabled) {
          targetFade = 0;
        } else if (visibleStageMax > 0.05) {
          targetFade = 1;
        } else if (hideMax > 0.05 && visibleStageMax < 0.05) {
          // Earlier ramp: paper is gone by the time a hide section claims ~20% of the viewport, so readalong's headline reads on a clean stage.
          const k = Math.min(1, Math.max(0, (hideMax - 0.05) / 0.15));
          targetFade = Math.max(0, 1 - k);
        } else {
          targetFade = 1;
        }
      };
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            visibility.set(e.target as HTMLElement, e.intersectionRatio);
          }
          pickActive();
        },
        { threshold: [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 1] },
      );
      for (const el of sectionEls) io.observe(el);

      // The IO only re-fires when a section crosses one of its discrete
      // thresholds. Between fires the rect-based pickActive() sees stale
      // geometry, so we also re-run it every scroll tick (rAF-throttled
      // to one call per animation frame). This is what makes the paper
      // hand off as soon as the trigger line crosses, instead of waiting
      // for the next IO threshold tick.
      let scrollPickPending = false;
      const onScroll = () => {
        if (scrollPickPending) return;
        scrollPickPending = true;
        requestAnimationFrame(() => {
          scrollPickPending = false;
          pickActive();
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });

      // Raw pointer values arrive at high frequency and produce twitch
      // when fed straight into the paper transform — we keep the raw
      // value, then lowpass-filter it inside the animation loop.
      let mouseRawX = 0;
      let mouseRawY = 0;
      let mouseX = 0;
      let mouseY = 0;
      const onMouse = (e: MouseEvent) => {
        mouseRawX = (e.clientX / window.innerWidth) * 2 - 1;
        mouseRawY = (e.clientY / window.innerHeight) * 2 - 1;
      };
      window.addEventListener("mousemove", onMouse, { passive: true });

      const onResize = () => {
        const w = stage.clientWidth || window.innerWidth;
        const h = stage.clientHeight || window.innerHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);

      const obs = new IntersectionObserver(
        ([e]) => {
          active = e.isIntersecting;
          if (active) loop();
        },
        { threshold: 0 },
      );
      obs.observe(stage);

      let last = performance.now();
      let lastP = 0;
      let currentTexture: TextureKey = "hero";
      let currentInkIdx = 0;
      let evenFrame = false;
      let paused = false;
      let sleepTimer: ReturnType<typeof setTimeout> | null = null;
      let currentSide: PaperSide | null = null;
      // Last non-centre side the paper occupied — used to pick a fly-out
      // direction even when the active stage has flipped to a hide-zone.
      let exitSide: PaperSide = "right";
      // Lowpass-filtered scroll velocity. Raw `velocity` spikes per frame
      // and made the corner flap visibly twitch ("the paper moves the
      // corner I don't like that"). Filtering smooths the kick without
      // killing motion entirely.
      let velFiltered = 0;
      const root = document.documentElement;
      const frontPosArr = frontGeom.attributes.position.array as Float32Array;
      const backPosArr = backGeom.attributes.position.array as Float32Array;
      root.classList.add("has-paper");
      // Seed the exit transform CSS vars so first-frame layout is sane.
      root.style.setProperty("--paper-exit-x", "0");
      root.style.setProperty("--paper-exit-rot", "0");
      root.style.setProperty("--paper-exit-scale", "1");
      root.style.setProperty("--paper-edge-progress", "0");

      // Hero → Problem edge bleed. Tracks the handoff window where the
      // paper is leaving the hero section (right-anchored) and entering
      // problem (left-anchored). A scaleX 0→1 ramp draws a 2px vermilion
      // edge gradient on the paper's right margin; once activeStage flips
      // to "problem" the edge fades to ink-faint over 400ms.
      let edgeProgress = 0;
      let edgeFade = 0;
      let edgeFadeStart = -1;
      const EDGE_FADE_MS = 400;

      const loop = () => {
        if (disposed || !active || paused) return;
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        const docH = document.documentElement.scrollHeight - window.innerHeight;
        const p = docH > 0 ? Math.min(1, Math.max(0, window.scrollY / docH)) : 0;
        const rawVelocity = Math.abs(p - lastP) / Math.max(0.0001, dt);
        lastP = p;
        // Lowpass: 8% per frame (60fps ≈ 5Hz cutoff). Smooths scroll
        // micro-jitter and momentum spikes from trackpad inertia.
        velFiltered += (rawVelocity - velFiltered) * 0.08;
        const velNorm = Math.min(1, velFiltered * 8);
        const velNormClamped = Math.min(0.6, velNorm); // cap kicks
        // Mouse parallax — same lowpass treatment.
        mouseX += (mouseRawX - mouseX) * 0.08;
        mouseY += (mouseRawY - mouseY) * 0.08;

        // Drive the side-swap state machine. While `exiting`, force the
        // exit spring toward 1; at EXIT_MS we instantaneously swap the
        // active stage (texture, pose, side) and switch to `entering`,
        // which lets the spring relax back to whatever the fade target
        // wants. This produces a clean fly-out → swap → fly-in arc.
        if (transitionPhase === "exiting" && queuedStage) {
          if (now - transitionStart >= EXIT_MS) {
            activeStage = queuedStage;
            queuedStage = null;
            inkProgress = 0;
            waveStart = now;
            spPunch.set(0.9);
            transitionPhase = "entering";
            transitionStart = now;
          }
        } else if (transitionPhase === "entering") {
          if (now - transitionStart >= ENTER_MS) {
            transitionPhase = "idle";
          }
        }

        if (HIDE_TERMINAL.has(activeStage)) {
          paperTerminalDisabled = true;
        } else if (VISIBLE_PAPER.has(activeStage)) {
          paperTerminalDisabled = false;
        }
        if (readalongEl) {
          const rTop = readalongEl.getBoundingClientRect().top;
          const vhNow = window.innerHeight || 1;
          if (Number.isFinite(rTop) && rTop < vhNow) {
            paperTerminalDisabled = true;
          }
        }
        if (paperTerminalDisabled) targetFade = 0;

        // Hero phase override: when the Hero component flips
        // data-hero-phase="2" on its section, the paper auto-slides from
        // CENTRE_HERO to a LEFT pose without any user scroll. We branch
        // on the live attribute so React state and the rAF loop stay in
        // sync without an extra event listener.
        const inHeroPhase2 =
          activeStage === "hero" &&
          heroEl?.dataset.heroPhase === "2";
        const t = inHeroPhase2 ? HERO_PHASE_2 : STAGES[activeStage];

        spX.target(t.x, dt);
        spY.target(t.y, dt);
        spZ.target(t.z, dt);
        spRX.target(t.rx, dt);
        spRY.target(t.ry, dt);
        spRZ.target(t.rz, dt);
        spS.target(t.s, dt);
        spPunch.target(1, dt);

        // Fly-out / fly-in: exitAmount is 0 when paper is on stage,
        // 1 when it's fully gone. The transition state machine forces
        // the exit spring to 1 during the `exiting` phase regardless of
        // fade, so opposite-side stage swaps yank the paper off-screen
        // before the texture/pose flip. Otherwise it tracks (1 - targetFade)
        // for hide-section fades.
        const exitTarget =
          transitionPhase === "exiting" ? 1 : 1 - targetFade;
        spExit.target(exitTarget, dt);
        const exitAmt = Math.max(0, Math.min(1, spExit.value));
        // Fade tail: opacity bottoms out faster than position so the
        // paper is fully transparent by the time it crosses the
        // viewport edge. exitAmt 0..0.85 → fade 1..0.05, then clamps.
        const fadeFiltered = Math.max(0, Math.min(1, 1 - exitAmt / 0.85));

        // Track the last non-centre side so the exit direction makes
        // sense regardless of the currently-active stage.
        if (t.side === "right" || t.side === "left") exitSide = t.side;

        // Scroll-driven zoom — the paper "breathes" between 0.9 and 1.25
        // as the user scrolls, modulated by the stage's own scale so
        // each pose still feels distinct.
        const scrollZoom = 0.9 + p * 0.35;
        const punch = spPunch.value;
        const stageScale = t.s * scrollZoom * punch;

        // Camera dolly: hero pulls the camera in close (Z=7.6 — the
        // single cinematic moment, paper centred and large) while the
        // problem and how stages sit wider (Z=11) to leave room for
        // copy on the opposite side and the fly-out arc.
        const dramatic = activeStage === "hero" && !inHeroPhase2;
        const camTarget = dramatic ? 7.6 : 11.0;
        spCamZ.target(camTarget, dt);

        const exitDirX = exitSide === "left" ? -1 : 1;
        // Stronger fly-out (was 2.5 → now 3.5) — paper completely
        // clears the viewport before the texture/pose swap, which
        // makes the side-flip read as a single fly-out / fly-in
        // motion rather than a slide across the headline.
        const exitDist = exitAmt * 3.5;
        paperGroup.position.set(
          spX.value + exitDirX * exitDist + mouseX * 0.12,
          spY.value - mouseY * 0.08 - exitAmt * 0.5,
          spZ.value,
        );

        const paperNX = normalizePaperX(spX.value);
        const paperNY = Math.max(-1, Math.min(1, spY.value / 0.6));
        const velNormForCss = Math.min(1, velFiltered * 6);
        root.style.setProperty("--paper-x", paperNX.toFixed(4));
        root.style.setProperty("--paper-y", paperNY.toFixed(4));
        root.style.setProperty("--paper-progress", p.toFixed(4));
        root.style.setProperty("--paper-vel", velNormForCss.toFixed(4));
        root.style.setProperty("--paper-fade", fadeFiltered.toFixed(3));
        // Fly-out CSS vars — sections / chrome that want to slide with
        // the exiting paper can read these. They mirror the JS transform.
        // Rotation bumped 0.5 → 0.85 rad and scale 0.7 → 0.55 floor so
        // the exiting paper visibly tumbles + shrinks as it clears.
        root.style.setProperty(
          "--paper-exit-x",
          (exitDirX * exitAmt).toFixed(3),
        );
        root.style.setProperty(
          "--paper-exit-rot",
          (exitDirX * exitAmt * 0.85).toFixed(3),
        );
        root.style.setProperty(
          "--paper-exit-scale",
          (1 - exitAmt * 0.45).toFixed(3),
        );

        // Edge bleed driver: while the hero section is still active but
        // its visibility has dropped below ~0.85 (i.e. the bottom 15% of
        // hero is leaving), ramp edgeProgress 0 → 1 over the closing
        // window. We also need problem to have begun peeking
        // (problemVis > 0.05) so the bleed doesn't fire when the user
        // has scrolled hero partway down without problem in view.
        // Once the active stage flips to "problem", hold the last
        // edgeProgress and start a 400ms fade-out via edgeFade.
        const heroVis = heroEl ? visibility.get(heroEl) ?? 0 : 0;
        const problemVis = problemEl ? visibility.get(problemEl) ?? 0 : 0;
        if (activeStage === "hero" || activeStage === "problem") {
          if (activeStage === "hero" && problemVis > 0.05 && heroVis < 0.95) {
            const handoff = Math.max(
              0,
              Math.min(1, (0.85 - heroVis) / 0.85),
            );
            edgeProgress = handoff;
            edgeFade = 0;
            edgeFadeStart = -1;
          } else if (activeStage === "problem") {
            if (edgeFadeStart < 0) edgeFadeStart = now;
            const k = Math.max(
              0,
              Math.min(1, (now - edgeFadeStart) / EDGE_FADE_MS),
            );
            edgeFade = k;
          } else {
            edgeProgress = 0;
          }
        } else {
          edgeProgress = 0;
          edgeFade = 0;
          edgeFadeStart = -1;
        }
        const edgeOut = Math.max(0, edgeProgress * (1 - edgeFade));
        root.style.setProperty("--paper-edge-progress", edgeOut.toFixed(3));

        if (t.side !== currentSide) {
          currentSide = t.side;
          root.dataset.paperSide = t.side;
        }

        if (t.texture !== currentTexture) {
          const tex = ensureTexture(t.texture);
          frontMat.map = tex;
          frontMat.emissiveMap = tex;
          frontMat.needsUpdate = true;
          currentTexture = t.texture;
          waveStart = now;
          // Punch on texture swap too so any ink-program change has weight.
          spPunch.set(0.94);
        }

        if (t.inkProgram !== currentInkIdx) {
          currentInkIdx = t.inkProgram;
          inkProgress = 0;
          renderInk(currentInkIdx, 0);
        }

        paperGroup.rotation.set(
          spRX.value + mouseY * 0.04,
          spRY.value + mouseX * 0.06 + exitDirX * exitAmt * 0.85,
          spRZ.value + exitDirX * exitAmt * 0.18,
        );
        paperGroup.scale.setScalar(stageScale * (1 - exitAmt * 0.45));

        camera.position.x = mouseX * 0.3;
        camera.position.y = -mouseY * 0.22;
        camera.position.z = spCamZ.value;
        camera.lookAt(0, 0, 0);

        const curl = velNormClamped * 0.45;
        // Flap was 0.4 * raw velNorm — that's the "corner flapping every
        // scroll tick" complaint. Use the filtered+clamped velocity and
        // drop the multiplier substantially.
        const flap = Math.min(0.18, velNormClamped * 0.18);
        const slack = Math.max(0, 0.35 - velNormClamped * 0.5);
        const tSec = now / 1000;
        // Verlet kick uses the SAME filtered velocity — no random
        // jitter. The previous (Math.random()-0.5) kick was the
        // primary source of "papery noise" the user disliked.
        const verletKick = velNormClamped * 0.06;
        if (Math.abs(verletKick) > 0.002) {
          for (let i = 4; i < VERLET_N - 4; i++) {
            const fall = 1 - Math.abs((i - VERLET_N / 2) / (VERLET_N / 2));
            verlet.acc[i] += verletKick * fall * 18;
          }
        }
        const subSteps = 3;
        const subDt = dt / subSteps;
        for (let s = 0; s < subSteps; s++) verletStep(verlet, subDt);

        const waveTime = waveStart > 0 ? (now - waveStart) / 600 : 1;
        const wave = waveTime < 1 ? waveTime : 0;

        // Raw cursor UV in paper-screen space. Used as the spring target
        // for the trailing bump position.
        const cursorRawU = Math.max(0, Math.min(1, mouseRawX * 0.5 + 0.5));
        const cursorRawV = Math.max(0, Math.min(1, -mouseRawY * 0.5 + 0.5));
        // Cursor velocity in NDC. mouseX/Y are the lowpass-filtered cursor
        // (pre-existing); the diff vs raw gives an instantaneous velocity
        // estimate without needing per-frame state.
        const cursorVelX = mouseRawX - mouseX;
        const cursorVelY = mouseRawY - mouseY;
        // Hover lift: when the cursor is roughly over the paper's
        // viewport region, add a tiny persistent positive bias. Kept
        // small (0.004) so it reads as the paper noticing the cursor,
        // not lifting toward it.
        const overU = Math.max(0, 1 - Math.max(0, Math.abs(mouseRawX) - 0.35) * 5);
        const overV = Math.max(0, 1 - Math.max(0, Math.abs(mouseRawY) - 0.5) * 5);
        const hoverLift = overU * overV * 0.004;
        // Press input: signed by horizontal motion (so swipes have
        // direction), magnitude boosted by total speed (so vertical
        // gestures still register), plus the hover lift baseline.
        // Clamp at 0.16 keeps the bump in the realistic finger-press
        // range, never the cartoon-balloon range.
        const cursorPressInput = Math.max(
          -0.16,
          Math.min(
            0.16,
            cursorVelX * 2.6
              + Math.hypot(cursorVelX, cursorVelY) * 0.8
              + hoverLift,
          ),
        );

        spBumpU.target(cursorRawU, dt);
        spBumpV.target(cursorRawV, dt);
        spBumpAmp.target(cursorPressInput, dt);

        const bumpU = spBumpU.value;
        const bumpV = spBumpV.value;
        const bumpAmp = spBumpAmp.value;

        bendPaper(
          frontPosArr,
          frontRest,
          curl,
          wave,
          flap,
          slack,
          tSec,
          verlet,
          bumpU,
          bumpV,
          bumpAmp,
        );
        bendPaper(
          backPosArr,
          backRest,
          curl,
          wave,
          flap,
          slack,
          tSec,
          verlet,
          bumpU,
          bumpV,
          bumpAmp,
        );
        frontGeom.attributes.position.needsUpdate = true;
        backGeom.attributes.position.needsUpdate = true;
        const windActive =
          curl + flap + Math.abs(slack) + Math.abs(wave) + Math.abs(bumpAmp)
            > 0.005;

        const settleAmt = Math.max(0, 1 - velNorm * 1.6);
        sweepMat.opacity = Math.max(0, settleAmt - 0.3) * 0.5 * fadeFiltered;
        sweepMesh.position.x = (Math.sin(tSec * 0.7) * 0.5) * PAPER_W * 0.8;

        const targetInk = Math.pow(settleAmt, 1.4);
        inkProgress += (targetInk - inkProgress) * Math.min(1, dt * 1.8);
        if (Math.abs(targetInk - inkProgress) > 0.005) {
          renderInk(currentInkIdx, inkProgress);
        }
        inkMat.opacity = inkProgress * 0.95 * fadeFiltered;

        const breath = Math.sin(tSec * 1.3) * 0.008 * settleAmt;
        paperGroup.scale.setScalar(stageScale * (1 - exitAmt * 0.45) * (1 + breath));

        rimGlowMat.opacity = (0.3 + settleAmt * 0.45) * fadeFiltered;

        const arr = dust.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < DUST_COUNT; i++) {
          arr[i * 3] += dustVel[i * 3];
          arr[i * 3 + 1] += dustVel[i * 3 + 1];
          arr[i * 3 + 2] += dustVel[i * 3 + 2];
          if (arr[i * 3 + 1] > 5) arr[i * 3 + 1] = -5;
          if (arr[i * 3] > 8) arr[i * 3] = -8;
          if (arr[i * 3] < -8) arr[i * 3] = 8;
        }
        dust.geometry.attributes.position.needsUpdate = true;

        const settled =
          rawVelocity < 0.0001 &&
          transitionPhase === "idle" &&
          Math.abs(spX.value - t.x) < 0.001 &&
          Math.abs(spY.value - t.y) < 0.001 &&
          Math.abs(spZ.value - t.z) < 0.001 &&
          Math.abs(spRX.value - t.rx) < 0.001 &&
          Math.abs(spRY.value - t.ry) < 0.001 &&
          Math.abs(spRZ.value - t.rz) < 0.001 &&
          Math.abs(spS.value - t.s) < 0.001 &&
          Math.abs(spExit.value - exitTarget) < 0.002 &&
          Math.abs(spPunch.value - 1) < 0.002 &&
          Math.abs(targetInk - inkProgress) < 0.005;

        if (settled && document.hidden) {
          sleepTimer = setTimeout(() => {
            sleepTimer = null;
            if (!disposed && active && !paused) {
              last = performance.now();
              raf = requestAnimationFrame(loop);
            }
          }, 250);
          return;
        }

        if (settled) {
          evenFrame = !evenFrame;
          if (windActive && evenFrame) {
            frontGeom.computeVertexNormals();
            backGeom.computeVertexNormals();
          }
        } else if (windActive) {
          frontGeom.computeVertexNormals();
          backGeom.computeVertexNormals();
        }

        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      const onVisibility = () => {
        if (document.hidden) {
          paused = true;
          if (sleepTimer) {
            clearTimeout(sleepTimer);
            sleepTimer = null;
          }
          cancelAnimationFrame(raf);
        } else if (paused) {
          paused = false;
          last = performance.now();
          if (active && !disposed) {
            raf = requestAnimationFrame(loop);
          }
        }
      };
      document.addEventListener("visibilitychange", onVisibility);

      const onMotionChange = (ev: MediaQueryListEvent) => {
        if (ev.matches) {
          setReduced(true);
          cleanup();
        }
      };
      motionChangeListener = onMotionChange;
      if (typeof motionMedia.addEventListener === "function") {
        motionMedia.addEventListener("change", onMotionChange);
      }

      cleanup = () => {
        cancelAnimationFrame(raf);
        if (sleepTimer) {
          clearTimeout(sleepTimer);
          sleepTimer = null;
        }
        obs.disconnect();
        io.disconnect();
        window.removeEventListener("mousemove", onMouse);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("scroll", onScroll);
        document.removeEventListener("visibilitychange", onVisibility);
        if (
          motionChangeListener &&
          typeof motionMedia.removeEventListener === "function"
        ) {
          motionMedia.removeEventListener("change", motionChangeListener);
          motionChangeListener = null;
        }
        renderer.dispose();
        inkTex.dispose();
        frontGeom.dispose();
        backGeom.dispose();
        shadowGeom.dispose();
        sweepGeom.dispose();
        rimGlowGeom.dispose();
        dustGeom.dispose();
        frontMat.dispose();
        backMat.dispose();
        shadowMat.dispose();
        sweepMat.dispose();
        rimGlowMat.dispose();
        inkMat.dispose();
        dustMat.dispose();
        if (renderer.domElement.parentElement === stage) {
          stage.removeChild(renderer.domElement);
        }
        stage.classList.remove("is-on");
        root.classList.remove("has-paper");
        root.style.removeProperty("--paper-x");
        root.style.removeProperty("--paper-y");
        root.style.removeProperty("--paper-progress");
        root.style.removeProperty("--paper-vel");
        root.style.removeProperty("--paper-fade");
        root.style.removeProperty("--paper-exit-x");
        root.style.removeProperty("--paper-exit-rot");
        root.style.removeProperty("--paper-exit-scale");
        root.style.removeProperty("--paper-edge-progress");
        delete root.dataset.paperSide;
      };
    };

    // Viewport gate: the active WebGL canvas is CSS-hidden under 1101px
    // (globals.css:828). Booting Three.js anyway costs ~660 KB of parse
    // work on a slow mobile CPU and was the dominant contributor to a
    // 1.69 s mobile TBT. We skip the dynamic import entirely on small
    // viewports — the page is paper-free on mobile by design.
    const desktopMQ = matchMedia("(min-width: 1101px)");
    if (!desktopMQ.matches) {
      return;
    }

    // Defer the dynamic three.js import + renderer setup to an idle
    // window so it never competes with LCP paint or hero hydration.
    // requestIdleCallback gives the browser permission to slot the
    // parse into a free frame; setTimeout(200) is the fallback path
    // for Safari (where rIC is still behind a flag).
    type IdleCb = (cb: () => void, opts?: { timeout?: number }) => number;
    const ric = (window as unknown as { requestIdleCallback?: IdleCb })
      .requestIdleCallback;
    const scheduleBoot = () => {
      if (disposed) return;
      if (typeof ric === "function") {
        ric(() => {
          if (!disposed) boot();
        }, { timeout: 1500 });
      } else {
        setTimeout(() => {
          if (!disposed) boot();
        }, 200);
      }
    };

    if (document.body.dataset.preloaderDone === "1") {
      scheduleBoot();
    } else {
      const onPreloaderDone = () => {
        if (disposed) return;
        document.body.removeEventListener(
          "yuho:preloader-done",
          onPreloaderDone,
        );
        preloaderListener = null;
        scheduleBoot();
      };
      preloaderListener = onPreloaderDone;
      document.body.addEventListener(
        "yuho:preloader-done",
        onPreloaderDone,
        { once: true },
      );
    }

    return () => {
      disposed = true;
      if (preloaderListener) {
        document.body.removeEventListener(
          "yuho:preloader-done",
          preloaderListener,
        );
        preloaderListener = null;
      }
      cleanup();
    };
  }, []);

  if (reduced) return <ReducedMotionFallback />;

  return (
    <>
      <div
        id="paper-stage"
        ref={stageRef}
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
      <div
        className="paper-edge-bleed"
        data-stage-from="hero"
        data-stage-to="problem"
        aria-hidden="true"
      />
    </>
  );
}
