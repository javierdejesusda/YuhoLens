"use client";
import { useEffect, useRef, useState } from "react";

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

// Bigger / more present poses — user complained the LEFT pose was too
// small. Both LEFT and RIGHT are bumped to s ≈ 1.20 for symmetry so the
// paper has equal weight on either side as the alternation cycles.
const LEFT_BIG_NEAR = { x: -2.10, y: 0.05, z: 0.10,  rx: -0.05, ry:  0.24, rz: -0.04, s: 1.20 } as const;
const LEFT_BIG_MID  = { x: -1.95, y: 0.10, z: -0.05, rx: -0.05, ry:  0.20, rz: -0.04, s: 1.16 } as const;
const RIGHT_BIG_NEAR = { x: 2.10, y: 0.05, z: 0.10,  rx: -0.05, ry: -0.24, rz: 0.04, s: 1.20 } as const;
const RIGHT_BIG_MID  = { x: 1.95, y: 0.10, z: -0.05, rx: -0.05, ry: -0.20, rz: 0.04, s: 1.16 } as const;
const RIGHT_DEEP = { x: 1.7, y: 0.18, z: -0.22, rx: -0.07, ry: -0.18, rz: 0.04, s: 0.98 } as const;
const CENTRE_HERO = { x: 0.0, y: -0.05, z: -0.4, rx: 0.0, ry: 0.0, rz: 0.0, s: 1.18 } as const;
const CENTRE_FAR = { x: 0.0, y: -0.05, z: -1.0, rx: 0.0, ry: 0.0, rz: 0.0, s: 0.9 } as const;

// Side alternation: hero=RIGHT, problem=LEFT, how=LEFT, repro=RIGHT,
// demo=RIGHT (hide), hardware=LEFT (hide), dag=RIGHT, readalong=LEFT,
// kg2=RIGHT (deep), failures=LEFT. Flips between visible stages trigger
// the fly-out state machine in the loop.
const STAGES: Record<StageKey, StagePose> = {
  hero: { ...RIGHT_BIG_NEAR, side: "right", texture: "hero", inkProgram: 0 },
  problem: { ...LEFT_BIG_NEAR, side: "left", texture: "problem", inkProgram: 1 },
  how: { ...LEFT_BIG_MID, side: "left", texture: "how", inkProgram: 2 },
  repro: { ...RIGHT_BIG_MID, side: "right", texture: "rail", inkProgram: 3 },
  demo: { ...RIGHT_BIG_NEAR, side: "right", texture: "rail", inkProgram: 3 },
  hardware: { ...LEFT_BIG_NEAR, side: "left", texture: "rail", inkProgram: 3 },
  dag: { ...RIGHT_BIG_MID, side: "right", texture: "how", inkProgram: 2 },
  readalong: { ...LEFT_BIG_MID, side: "left", texture: "problem", inkProgram: 1 },
  kg2: { ...RIGHT_DEEP, side: "right", texture: "rail", inkProgram: 3 },
  reports: { ...RIGHT_BIG_MID, side: "right", texture: "rail", inkProgram: 3 },
  failures: { ...LEFT_BIG_NEAR, side: "left", texture: "problem", inkProgram: 1 },
  manifest: { ...CENTRE_HERO, side: "centre", texture: "manifest", inkProgram: 4 },
  faq: { ...CENTRE_FAR, side: "centre", texture: "manifest", inkProgram: 4 },
  access: { ...CENTRE_FAR, side: "centre", texture: "footer", inkProgram: 5 },
};

let cachedTextures: Partial<Record<TextureKey, any>> = {};
let cachedAux: { back?: any; normal?: any; shadow?: any; rim?: any } = {};

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
  paperHeader(g, "有価証券報告書 · 第120期", "EDINET 00271 · p.23 / 142");
  g.fillStyle = "#15161A";
  g.font = "700 44px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("事業等のリスク", 70, 180);
  g.font = "400 26px 'Noto Serif JP', serif";
  g.textBaseline = "top";
  const lines = [
    "為替相場の変動は当社グループの営業利益率に重大",
    "な影響を及ぼす可能性があり、特に急激な円安は電子",
    "部品セグメントにおいて原材料コストを押し上げる",
    "要因となる。当社は為替予約等のヘッジ取引を実施",
    "しているものの、長期的な相場変動を完全に相殺",
    "することは困難である。",
  ];
  let y = 230;
  for (const l of lines) {
    g.fillText(l, 70, y);
    y += 42;
  }
  g.fillStyle = "rgba(232,80,58,0.22)";
  g.fillRect(70, 273, TEX_W - 200, 38);
  g.fillStyle = "rgba(232,80,58,0.18)";
  g.fillRect(70, 357, 380, 38);
  y += 30;
  g.fillStyle = "#5C594F";
  g.font = "italic 400 22px 'Playfair Display', serif";
  for (const l of [
    "Prolonged yen weakness materially compresses",
    "operating margin in the electronic-components segment.¹",
  ]) {
    g.fillText(l, 70, y);
    y += 30;
  }
  y += 14;
  for (const l of ["Hedging via forwards cannot fully offset long-cycle", "currency drift.²"]) {
    g.fillText(l, 70, y);
    y += 30;
  }
  g.fillStyle = "#E8503A";
  g.font = "500 18px 'JetBrains Mono', monospace";
  g.fillText("[1] 営業利益率 — p.23 §2.1", 70, y + 30);
  g.fillText("[2] 為替予約 — p.24 §2.1", 70, y + 60);
  paperStamp(g, TEX_W - 180, TEX_H - 220, "朱");
  paperFooter(g, "YUHOLENS · ingest", "span-cited · ✓");
};

const buildProblem = (g: CanvasRenderingContext2D) => {
  paperBase(g);
  paperHeader(g, "訂正・註釈 · ANNOTATED", "DRAFT · p.23");
  g.fillStyle = "#15161A";
  g.font = "700 40px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("LOST IN TRANSLATION", 70, 175);

  g.font = "400 24px 'Noto Serif JP', serif";
  g.textBaseline = "top";
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

  g.strokeStyle = "#E8503A";
  g.lineWidth = 2.4;
  g.beginPath();
  g.ellipse(350, 248, 130, 26, 0, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#E8503A";
  g.font = "italic 600 22px 'Playfair Display', serif";
  g.fillText("= structural margin", 670, 280);
  g.fillText("compression", 670, 308);

  g.fillStyle = "#5C594F";
  g.font = "400 18px 'JetBrains Mono', monospace";
  g.fillText("// auditor euphemism", TEX_W - 380, 250);
  g.fillText("// real meaning →", TEX_W - 380, 410);

  paperStamp(g, TEX_W - 180, TEX_H - 220, "訂");
  paperFooter(g, "translator · marginalia", "untranslated · ✕");
};

const buildHow = (g: CanvasRenderingContext2D) => {
  paperBase(g);
  paperHeader(g, "パイプライン仕様書 · v0.4", "INTERNAL");
  g.fillStyle = "#15161A";
  g.font = "700 44px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("処理パイプライン", 70, 180);

  g.textBaseline = "top";
  const steps: Array<[string, string, string]> = [
    ["01", "INGEST", "有報PDF · OCR · レイアウト保持"],
    ["02", "STRUCTURE", "節 · 表 · 注釈 · index 化"],
    ["03", "TRANSLATE", "保守的・原文ロック・diff 表示"],
    ["04", "CITE", "span 単位・p / §  / 行 番号"],
  ];
  let y = 240;
  for (const [n, en, jp] of steps) {
    g.strokeStyle = "rgba(14,14,16,0.18)";
    g.lineWidth = 1;
    g.strokeRect(70, y, TEX_W - 140, 130);
    g.fillStyle = "#E8503A";
    g.font = "700 28px 'JetBrains Mono', monospace";
    g.fillText(n, 90, y + 24);
    g.fillStyle = "#15161A";
    g.font = "700 32px 'Playfair Display', serif";
    g.fillText(en, 170, y + 22);
    g.fillStyle = "#5C594F";
    g.font = "400 22px 'Noto Serif JP', serif";
    g.fillText(jp, 170, y + 70);
    y += 150;
  }

  g.save();
  g.translate(TEX_W - 220, 220);
  g.rotate(-0.18);
  g.strokeStyle = "#E8503A";
  g.lineWidth = 3;
  g.strokeRect(-90, -28, 180, 56);
  g.fillStyle = "#E8503A";
  g.font = "700 26px 'JetBrains Mono', monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("ROUTING", 0, 0);
  g.restore();

  paperFooter(g, "pipeline · diagram", "rev 0.4 · ✓");
};

const buildRail = (g: CanvasRenderingContext2D) => {
  paperBase(g);
  paperHeader(g, "財務諸表 · 連結損益計算書", "EDINET 00271 · p.78");
  g.fillStyle = "#15161A";
  g.font = "700 40px 'Noto Serif JP', serif";
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText("営業利益率 推移", 70, 180);

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

  g.fillStyle = "#5C594F";
  g.font = "400 18px 'JetBrains Mono', monospace";
  g.textAlign = "left";
  g.fillText("source · EDINET · audited · ¥ 連結 · in millions", 70, TEX_H - 130);

  paperStamp(g, TEX_W - 180, TEX_H - 220, "財");
  paperFooter(g, "figures · §3.2", "cited · ✓");
};

const buildManifest = (g: CanvasRenderingContext2D) => {
  paperBase(g);
  paperHeader(g, "宣言 · MANIFEST", "YUHOLENS");
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
    "— Source first, never replaced.",
    "— Every output is span-cited.",
    "— No inference. Only quotation.",
    "— Reader's time is sacred.",
  ];
  y = 430;
  for (const l of en) {
    g.fillText(l, 540, y + 8);
    y += 50;
  }

  paperStamp(g, TEX_W - 180, TEX_H - 220, "宣");
  paperFooter(g, "manifest · v1", "signed · ✓");
};

const buildFooter = (g: CanvasRenderingContext2D) => {
  paperBase(g);
  paperHeader(g, "結 · CLOSING", "YUHOLENS · " + new Date().getFullYear());

  g.fillStyle = "#15161A";
  g.font = "700 200px 'Noto Serif JP', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("結", TEX_W / 2, TEX_H / 2 - 80);

  g.fillStyle = "#5C594F";
  g.font = "italic 400 28px 'Playfair Display', serif";
  g.fillText("end of document", TEX_W / 2, TEX_H / 2 + 80);

  g.fillStyle = "#E8503A";
  g.font = "500 22px 'JetBrains Mono', monospace";
  g.fillText("— with the original still in view —", TEX_W / 2, TEX_H / 2 + 130);

  paperStamp(g, TEX_W / 2, TEX_H - 280, "完");
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
  g.fillText("— verso · margin notes · YUHOLENS ·", 0, 0);
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
    ctx.strokeStyle = "rgba(232,80,58,0.7)";
    ctx.lineWidth = 3;
    const e = easeOutCubic(p);
    for (let i = 0; i < 4; i++) {
      const y = 260 + i * 150;
      strokePath(ctx, [[60, y], [INK_W - 60, y]], Math.max(0, Math.min(1, e * 4 - i)));
    }
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
) {
  if (!Number.isFinite(curl)) curl = 0;
  if (!Number.isFinite(wave)) wave = 0;
  if (!Number.isFinite(flap)) flap = 0;
  if (!Number.isFinite(slack)) slack = 0;
  if (!Number.isFinite(time)) time = 0;
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
    const newY = py + ripple * 0.5 + sagY + yWobble;
    const newZ = curlZ + waveZ + flapZ + sagZ + ripple + verletZ;
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
      const spRZ = makeSpring(initialPose.rz, 60, 24);
      const spS = makeSpring(initialPose.s, 70, 22);
      // Camera dolly + exit-flight springs.
      const spCamZ = makeSpring(8.6, 55, 22);
      const spExit = makeSpring(0, 90, 26); // 0 = on-stage, 1 = flown out
      // Texture-change "punch" — squashes scale briefly when the doc swaps.
      const spPunch = makeSpring(1, 240, 22);

      const sectionEls = Array.from(
        document.querySelectorAll<HTMLElement>("[data-paper-stage]"),
      );
      const visibility = new Map<HTMLElement, number>();
      const sectionStage = new Map<HTMLElement, StageKey>();
      const sectionHide = new Map<HTMLElement, boolean>();
      for (const el of sectionEls) {
        const k = el.dataset.paperStage as StageKey | undefined;
        if (k && k in STAGES) sectionStage.set(el, k);
        sectionHide.set(el, el.hasAttribute("data-paper-hide"));
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
      const EXIT_MS = 320;   // time spent flying off-screen
      const ENTER_MS = 380;  // time spent flying back in
      const pickActive = () => {
        let best: HTMLElement | null = null;
        let bestRatio = -1;
        let totalHide = 0;
        let totalShow = 0;
        let lastVisibleStageEl: HTMLElement | null = null;
        let lastVisibleStageRatio = -1;
        for (const [el, ratio] of visibility) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            best = el;
          }
          if (sectionHide.get(el)) totalHide += ratio;
          else {
            totalShow += ratio;
            if (ratio > lastVisibleStageRatio) {
              lastVisibleStageRatio = ratio;
              lastVisibleStageEl = el;
            }
          }
        }
        const target = lastVisibleStageEl ?? best;
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
        // Fade decision (rewrite). Two principles:
        //   1. If ANY visible-stage section is genuinely on screen
        //      (ratio > 0.15) the paper must be visible — don't let a
        //      lingering hide-section fade it out during transitions.
        //   2. Only fade when ALL visible-stage ratios are tiny AND a
        //      hide-section dominates (> 0.5). Otherwise stay at 1.
        // This fixes the "opacity is still low when you get to another
        // session" complaint — the transition between hide → visible
        // sections used to blend ratios additively and suppress the
        // fade-back-in.
        const visibleStageMax = lastVisibleStageRatio;
        let hideMax = 0;
        for (const [el, ratio] of visibility) {
          if (sectionHide.get(el) && ratio > hideMax) hideMax = ratio;
        }
        if (visibleStageMax > 0.05) {
          targetFade = 1;
        } else if (hideMax > 0.25 && visibleStageMax < 0.02) {
          // Hide sections are often taller than the viewport, so their
          // intersectionRatio caps below 1. Saturate the ramp early
          // (0.25 → 0.45) so the paper actually disappears once a hide
          // section dominates the viewport instead of stalling at 0.5.
          const k = Math.min(1, (hideMax - 0.25) / 0.2);
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

        const t = STAGES[activeStage];

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

        // Camera dolly: hero / kg2 / manifest pull the camera in close
        // (Z=8.0 — dramatic) while interstitial stages sit wider (Z=11)
        // so the paper has room to fly out without clipping.
        const dramatic =
          activeStage === "hero" ||
          activeStage === "kg2" ||
          activeStage === "manifest";
        const camTarget = dramatic ? 8.0 : 11.0;
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

        bendPaper(frontPosArr, frontRest, curl, wave, flap, slack, tSec, verlet);
        bendPaper(backPosArr, backRest, curl, wave, flap, slack, tSec, verlet);
        frontGeom.attributes.position.needsUpdate = true;
        backGeom.attributes.position.needsUpdate = true;
        const windActive = curl + flap + Math.abs(slack) + Math.abs(wave) > 0.005;

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
        delete root.dataset.paperSide;
      };
    };

    if (document.body.dataset.preloaderDone === "1") {
      boot();
    } else {
      const onPreloaderDone = () => {
        if (disposed) return;
        document.body.removeEventListener(
          "yuho:preloader-done",
          onPreloaderDone,
        );
        preloaderListener = null;
        boot();
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
  );
}
