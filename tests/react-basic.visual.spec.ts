import { expect, test } from "@playwright/test";

test("react basic demo renders a non-empty visual grid", async ({ page }) => {
  await page.goto("/");

  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();

  const box = await grid.boundingBox();
  const screenshot = await grid.screenshot();

  expect(box?.width).toBeGreaterThan(900);
  expect(box?.height).toBeGreaterThan(400);
  expect(screenshot.byteLength).toBeGreaterThan(20_000);
});
