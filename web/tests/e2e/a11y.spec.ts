import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("axe a11y", () => {
  test.describe.configure({ timeout: 90_000 });

  test("homepage default motion is axe-clean", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    await expect(page.locator("#preloader")).toBeHidden({ timeout: 10_000 });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("homepage with prefers-reduced-motion is axe-clean", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    try {
      await page.goto("/", { waitUntil: "networkidle" });
      await expect(page.locator("#preloader")).toBeHidden({ timeout: 10_000 });
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("404 page is axe-clean", async ({ page }) => {
    await page.goto("/this-page-does-not-exist-yuholens", { waitUntil: "networkidle" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
