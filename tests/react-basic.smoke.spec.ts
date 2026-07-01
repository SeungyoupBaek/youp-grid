import { expect, test } from "@playwright/test";

test("react basic demo supports grid interactions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Youp Grid" })).toBeVisible();
  await expect(page.getByRole("grid")).toBeVisible();

  const firstSymbolCell = page.locator('[data-youp-row-index="0"][data-youp-column-id="symbol"]');
  const secondQuantityCell = page.locator('[data-youp-row-index="1"][data-youp-column-id="quantity"]');

  await firstSymbolCell.hover();
  await page.mouse.down();
  await secondQuantityCell.hover();
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
    .toEqual(["symbol", "quantity"]);

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
