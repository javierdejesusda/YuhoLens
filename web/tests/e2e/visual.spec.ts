import { test, expect } from "@playwright/test";

const SECTIONS: Array<{ name: string; id: string }> = [
  { name: "hero", id: "hero" },
  { name: "problem", id: "problem" },
  { name: "how", id: "how" },
  { name: "live-demo", id: "demo" },
  { name: "dag", id: "dag" },
  { name: "kg2-arc", id: "kg2" },
  { name: "failures", id: "failures" },
  { name: "manifest", id: "manifest" },
  { name: "access", id: "access" },
];

test.describe("visual baselines", () => {
  test.describe.configure({ timeout: 90_000 });

  for (const { name, id } of SECTIONS) {
    test(`${name} matches baseline`, async ({ page }) => {
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(page.locator("#preloader")).toBeHidden({ timeout: 10_000 });
      const target = page.locator(`#${id}, [data-section="${id}"]`).first();
      await target.waitFor({ state: "attached", timeout: 30_000 });
      await target.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await expect(page).toHaveScreenshot(`${name}.png`, {
        maxDiffPixelRatio: 0.04,
      });
    });
  }
});
