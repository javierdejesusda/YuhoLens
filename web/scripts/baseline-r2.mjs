// Baseline screenshot + WebVitals capture for the r2 pass.
// Run from web/: node scripts/baseline-r2.mjs --prefix=pre-r2 [--port=3001]
// Saves JPEGs and a vitals JSON at the *repo* root (..).

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const PREFIX = args.prefix ?? "pre-r2";
const PORT = args.port ?? "3001";
const BASE = `http://localhost:${PORT}`;
const REPO_ROOT = resolve(import.meta.dirname, "..", "..");

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
  { name: "768", width: 768, height: 1024 },
  { name: "390", width: 390, height: 844 },
];

const SECTIONS = [
  { name: "01-hero", id: "hero" },
  { name: "02-problem", id: "problem" },
  { name: "03-how", id: "how" },
  { name: "04-repro", id: "repro" },
  { name: "05-demo", id: "demo" },
  { name: "06-hardware", id: "hardware" },
  { name: "07-dag", id: "dag" },
  { name: "08-readalong", id: "readalong" },
  { name: "09-kg2", id: "kg2" },
  { name: "10-reports", id: "reports" },
  { name: "11-failures", id: "failures" },
  { name: "12-manifest", id: "manifest" },
  { name: "13-faq", id: "faq" },
  { name: "14-access", id: "access" },
];

async function captureVitals(page) {
  return await page.evaluate(() => {
    return new Promise((res) => {
      const out = { lcp: null, fcp: null, cls: 0, ttfb: null, longTasksMs: 0 };
      try {
        const nav = performance.getEntriesByType("navigation")[0];
        if (nav) {
          out.ttfb = nav.responseStart - nav.requestStart;
          out.domContentLoaded = nav.domContentLoadedEventEnd - nav.startTime;
          out.loadEvent = nav.loadEventEnd - nav.startTime;
        }
        const lcpObs = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length) out.lcp = entries[entries.length - 1].startTime;
        });
        lcpObs.observe({ type: "largest-contentful-paint", buffered: true });
        const fcpObs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (e.name === "first-contentful-paint") out.fcp = e.startTime;
        });
        fcpObs.observe({ type: "paint", buffered: true });
        const clsObs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) out.cls += e.value;
        });
        clsObs.observe({ type: "layout-shift", buffered: true });
        const longObs = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) out.longTasksMs += e.duration;
        });
        longObs.observe({ type: "longtask", buffered: true });
        setTimeout(() => {
          lcpObs.disconnect();
          fcpObs.disconnect();
          clsObs.disconnect();
          longObs.disconnect();
          res(out);
        }, 4500);
      } catch (e) {
        res({ ...out, error: String(e) });
      }
    });
  });
}

async function settleSection(page, id) {
  await page.evaluate(({ id }) => {
    const el = document.getElementById(id) || document.querySelector(`[data-section="${id}"]`);
    if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
  }, { id });
  await page.waitForTimeout(900);
}

async function captureViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const pre = document.getElementById("preloader");
    return !pre || getComputedStyle(pre).visibility === "hidden" || pre.classList.contains("is-hidden");
  }, null, { timeout: 15_000 }).catch(() => {});

  const fullPath = resolve(REPO_ROOT, `${PREFIX}-${viewport.name}-fullpage.jpeg`);
  await page.screenshot({ path: fullPath, type: "jpeg", quality: 80, fullPage: true });

  for (const section of SECTIONS) {
    await settleSection(page, section.id);
    const path = resolve(REPO_ROOT, `${PREFIX}-${viewport.name}-${section.name}.jpeg`);
    await page.screenshot({ path, type: "jpeg", quality: 80, fullPage: false });
  }

  let vitals = null;
  if (viewport.name === "1440") {
    const fresh = await context.newPage();
    fresh.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(`vitals: ${msg.text()}`);
    });
    await fresh.goto(BASE, { waitUntil: "load" });
    vitals = await captureVitals(fresh);
    await fresh.close();
  }

  await context.close();
  return { vitals, consoleErrors };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const t0 = Date.now();
  const results = {};
  for (const viewport of VIEWPORTS) {
    const t = Date.now();
    const r = await captureViewport(browser, viewport);
    results[viewport.name] = { elapsedMs: Date.now() - t, ...r };
    process.stdout.write(`viewport ${viewport.name}: ${Date.now() - t}ms, errors=${r.consoleErrors.length}\n`);
  }
  await browser.close();
  const summary = {
    prefix: PREFIX,
    base: BASE,
    capturedAt: new Date().toISOString(),
    elapsedMs: Date.now() - t0,
    viewports: results,
  };
  writeFileSync(
    resolve(REPO_ROOT, `${PREFIX}-vitals.json`),
    JSON.stringify(summary, null, 2),
  );
  process.stdout.write(`done in ${Date.now() - t0}ms\n`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
