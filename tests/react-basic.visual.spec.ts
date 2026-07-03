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
