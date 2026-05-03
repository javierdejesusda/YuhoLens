import { test, expect } from "@playwright/test";

test("hero loads, demo runs, citation flashes source", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.locator("#preloader")).toBeHidden({ timeout: 15_000 });

  await expect(page.locator("h1.hero-title")).toBeVisible();

  await page.locator("#demo").scrollIntoViewIfNeeded();

  const runButton = page.locator("#demo button", { hasText: /Read/ }).first();
  await expect(runButton).toBeVisible();
  await runButton.click();

  const firstCite = page.locator(".ld-output .cite-ref").first();
  await firstCite.waitFor({ state: "attached", timeout: 30_000 });
  await firstCite.scrollIntoViewIfNeeded();
  await expect(firstCite).toBeVisible({ timeout: 5_000 });

  await firstCite.click({ timeout: 10_000 });

  const flashedMark = page.locator(".ld-source mark.is-flash");
  const drawer = page.locator("#cite-drawer.is-open, [role=dialog].is-open");

  await expect(flashedMark.or(drawer).first()).toBeVisible({ timeout: 5_000 });
});
