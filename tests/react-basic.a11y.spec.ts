import { expect, test } from "@playwright/test";

test("react basic demo exposes accessible grid controls and keyboard navigation", async ({ page }) => {
  await page.goto("/");

  const grid = page.getByRole("grid");
  await expect(grid).toBeVisible();
  await expect(page.getByRole("columnheader", { name: /Desk/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Select visible rows" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try demo" }).locator(".demo-button-icon")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save state" }).locator(".demo-button-icon")).toBeVisible();
  await expect(page.getByRole("button", { name: "Columns", exact: true }).locator(".youp-grid__button-icon")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true }).locator(".youp-grid__button-icon")).toBeVisible();

  const firstSymbolCell = page.locator('[data-youp-row-index="0"][data-youp-column-id="symbol"]');
  const secondSymbolCell = page.locator('[data-youp-row-index="1"][data-youp-column-id="symbol"]');

  await firstSymbolCell.click();
  await page.keyboard.press("ArrowDown");
  await expect(secondSymbolCell).toHaveClass(/youp-grid__cell--focused/);
});
