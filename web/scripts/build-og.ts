#!/usr/bin/env tsx
/**
 * Generate the 1200×630 Open Graph card via headless Playwright.
 * Output: web/public/og.png
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const HTML = `<!DOCTYPE html><html><head>
<style>
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400&family=Noto+Serif+JP:wght@700&display=swap');
* { box-sizing: border-box; }
body {
  margin: 0; width: 1200px; height: 630px;
  background: #0A0A0C; color: #E8E5DC;
  font-family: 'Geist', -apple-system, system-ui, sans-serif; font-style: normal;
  padding: 80px;
  display: flex; flex-direction: column; justify-content: space-between;
}
h1 { font-size: 80px; line-height: 1.05; margin: 0; letter-spacing: -0.02em; font-weight: 500; }
.accent { color: #E8503A; font-family: 'Noto Serif JP', serif; font-style: normal; font-weight: 700; }
.metric {
  display: flex; gap: 0; margin-top: 40px;
  border-top: 1px solid rgba(232,80,58,0.2);
  border-bottom: 1px solid rgba(232,80,58,0.2);
}
.cell { flex: 1; padding: 18px 16px; border-left: 1px solid rgba(232,80,58,0.08); }
.cell:first-child { border-left: none; }
.v { color: #E8503A; font-size: 36px; font-variant-numeric: tabular-nums; }
.k {
  font-family: 'JetBrains Mono', monospace; font-style: normal;
  font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase;
  color: #A29C8A; margin-top: 6px;
}
.foot {
  font-family: 'JetBrains Mono', monospace; font-style: normal;
  font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase;
  color: #A29C8A;
}
</style></head><body>
<div>
  <h1>Read every <span class="accent">有価証券報告書</span>.<br/>Cite every claim.</h1>
  <div class="metric">
    <div class="cell"><div class="v">1.000</div><div class="k">Citation rate</div></div>
    <div class="cell"><div class="v">3.88</div><div class="k">KG-2 coherence</div></div>
    <div class="cell"><div class="v">14B</div><div class="k">Parameters</div></div>
    <div class="cell"><div class="v">1×</div><div class="k">MI300X</div></div>
    <div class="cell"><div class="v">~$80</div><div class="k">All-in cost</div></div>
  </div>
</div>
<div class="foot">YUHOLENS · <span class="accent" style="font-size:18px">朱</span> · MIT · NEKOMATA-QFIN · YUHOLENS.SITE</div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await page.setContent(HTML, { waitUntil: "networkidle" });
  const buf = await page.screenshot({ type: "png" });
  const outPath = resolve(__dirname, "..", "public", "og.png");
  writeFileSync(outPath, buf);
  await browser.close();
  console.log(`✓ wrote ${outPath} (${buf.length} bytes)`);
})();
