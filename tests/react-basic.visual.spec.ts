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

test("react basic demo keeps header filters and pinned status column aligned", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("grid")).toBeVisible();

  const clippedHeaderControls = await page.locator(".youp-grid__row--header [data-youp-column-id]").evaluateAll((headers) =>
    headers.flatMap((header) => {
      const headerRect = header.getBoundingClientRect();

      return Array.from(header.querySelectorAll<HTMLElement>(".youp-grid__advanced-filter > *"))
        .filter((control) => {
          const controlRect = control.getBoundingClientRect();

          return controlRect.left < headerRect.left - 0.5 || controlRect.right > headerRect.right + 0.5;
        })
        .map((control) => ({
          columnId: (header as HTMLElement).dataset.youpColumnId,
          controlClass: control.className,
        }));
    }),
  );

  expect(clippedHeaderControls).toEqual([]);

  const statusRects = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".youp-grid__row--header [data-youp-column-id='status']");
    const bodyCell = document.querySelector<HTMLElement>("[role='gridcell'][data-youp-column-id='status']");

    if (!header || !bodyCell) {
      return undefined;
    }

    const headerRect = header.getBoundingClientRect();
    const bodyRect = bodyCell.getBoundingClientRect();

    return {
      headerLeft: headerRect.left,
      headerRight: headerRect.right,
      bodyLeft: bodyRect.left,
      bodyRight: bodyRect.right,
    };
  });

  expect(statusRects).toBeDefined();
  expect(Math.abs(statusRects!.headerLeft - statusRects!.bodyLeft)).toBeLessThanOrEqual(1);
  expect(Math.abs(statusRects!.headerRight - statusRects!.bodyRight)).toBeLessThanOrEqual(1);
});

test("react basic demo formats numeric totals and selected ranges", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.locator(".youp-grid__row--aggregation")).toContainText("Sum 150,985,000");
  await expect(page.locator(".youp-grid__row--aggregation")).toContainText("Rows 10,000");
  await expect(page.locator('[data-youp-row-index="-1"][data-youp-column-id="quantity"]')).toContainText("6,666");

  const firstQuantityCell = page.locator('[data-youp-row-index="0"][data-youp-column-id="quantity"]');
  const secondQuantityCell = page.locator('[data-youp-row-index="1"][data-youp-column-id="quantity"]');

  await firstQuantityCell.hover();
  await page.mouse.down();
  await secondQuantityCell.hover();
  await page.mouse.up();

  const selectedQuantityTexts = await page
    .locator(".youp-grid__cell--range-selected[data-youp-column-id='quantity']")
    .allTextContents();
  const selectedQuantitySum = selectedQuantityTexts
    .map((text) => Number(text.replace(/,/g, "")))
    .reduce((sum, value) => sum + value, 0);
  const selectionSummary = page.locator(".youp-grid__selection-summary");

  expect(selectedQuantityTexts).toHaveLength(2);
  await expect(selectionSummary).toBeVisible();
  await expect(selectionSummary).toContainText("Cells 2");
  await expect(selectionSummary).toContainText("Rows 2");
  await expect(selectionSummary).toContainText(`Sum ${selectedQuantitySum.toLocaleString("en-US")}`);
});
