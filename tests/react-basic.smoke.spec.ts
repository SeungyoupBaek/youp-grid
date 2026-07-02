import { expect, test } from "@playwright/test";

test("react basic demo supports grid interactions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Youp Grid" })).toBeVisible();
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.locator(".youp-grid__option-badge").first()).toBeVisible();
  await expect(page.locator(".youp-grid__tag").first()).toBeVisible();

  const firstSymbolCell = page.locator('[data-youp-row-index="0"][data-youp-column-id="symbol"]');
  const secondStrategyCell = page.locator('[data-youp-row-index="1"][data-youp-column-id="strategy"]');

  await firstSymbolCell.hover();
  await page.mouse.down();
  await secondStrategyCell.hover();
  await page.mouse.up();
  await expect(page.locator(".youp-grid__cell--range-selected")).toHaveCount(4);

  await firstSymbolCell.click();
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
  await expect
    .poll(async () =>
      page.locator('[data-youp-row-index="0"].youp-grid__cell--range-selected').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-youp-column-id")),
      ),
    )
    .toEqual(["symbol", "strategy"]);

  await firstSymbolCell.click();
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.up("Shift");
  await expect
    .poll(async () =>
      page.locator('[data-youp-column-id="symbol"].youp-grid__cell--range-selected').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-youp-row-index")),
      ),
    )
    .toEqual(["0", "1"]);

  const firstStrategyCell = page.locator('[data-youp-row-index="0"][data-youp-column-id="strategy"]');
  await firstStrategyCell.dblclick();
  const comboboxEditor = page.locator(".youp-grid__cell-editor--combobox");
  await expect(comboboxEditor).toBeVisible();
  await comboboxEditor.fill("Manual override");
  await page.keyboard.press("Enter");
  await expect(firstStrategyCell).toContainText("Manual override");

  const firstTagsCell = page.locator('[data-youp-row-index="0"][data-youp-column-id="tags"]');
  await firstTagsCell.dblclick();
  const tagInput = page.locator(".youp-grid__tag-input");
  await expect(tagInput).toBeVisible();
  await tagInput.fill("hedged");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(firstTagsCell).toContainText("Hedged");

  await page.getByRole("button", { name: "Desk column menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Move right" })).toBeEnabled();
  await page.getByRole("menuitem", { name: "Move right" }).click();
  await expect
    .poll(async () =>
      page.locator(".youp-grid__row--header [data-youp-column-id]").evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-youp-column-id")).slice(0, 2),
      ),
    )
    .toEqual(["symbol", "desk"]);

  await page.getByRole("button", { name: "Expand detail row" }).first().click();
  await expect(page.locator(".trade-detail").first()).toContainText("Desk");

  await page.getByText("AAPL").first().click({ button: "right" });
  await expect(page.getByRole("menu").getByRole("menuitem", { name: "Copy", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Copy row" })).toBeVisible();
});
