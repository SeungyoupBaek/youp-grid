import { expect, test } from "@playwright/test";

test("react basic demo supports grid interactions", async ({ page }) => {
  test.setTimeout(120_000);

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
  await expect(firstTagsCell.locator(".youp-grid__tag--overflow")).toHaveText("+1");
  await expect(firstTagsCell.locator(".youp-grid__tag-list")).toHaveAttribute("title", /Hedged/);

  const firstStatusCell = page.locator('[data-youp-row-index="0"][data-youp-column-id="status"]');
  await firstStatusCell.dblclick();
  const selectEditor = page.locator(".youp-grid__cell-editor--select");
  await expect(selectEditor).toBeVisible();
  await selectEditor.click();
  await expect(selectEditor).toBeVisible();
  await selectEditor.selectOption("Open");
  await page.keyboard.press("Enter");
  await expect(firstStatusCell).toContainText("Open");

  await page.locator(".youp-grid__body").evaluate((element) => {
    element.scrollLeft = 0;
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await page.locator(".youp-grid__header").evaluate((element) => {
    (element as HTMLElement).style.setProperty("--youp-grid-header-scroll-left", "0px");
  });
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
  await expect(page.locator(".trade-detail__summary").first()).toContainText("Order detail");
  await expect(page.locator(".trade-detail__metrics").first()).toContainText("Notional");

  await page.getByText("AAPL").first().click({ button: "right" });
  await expect(page.getByRole("menu").getByRole("menuitem", { name: "Copy", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Copy row" })).toBeVisible();
});

test("react basic demo keeps direct cell editing active through Korean IME composition", async ({ page }) => {
  await page.goto("/");

  const firstSymbolCell = page.locator('[data-youp-row-index="0"][data-youp-column-id="symbol"]');
  await firstSymbolCell.click();
  await page.keyboard.press("a");

  const editor = page.locator(".youp-grid__cell-editor");
  await expect(editor).toHaveValue("a");

  await editor.evaluate((node) => {
    const input = node as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) {
      throw new Error("Input value setter is unavailable");
    }

    input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    setValue.call(input, "한");
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "한",
      inputType: "insertCompositionText",
      isComposing: true,
    }));
    input.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      code: "Enter",
      isComposing: true,
      key: "Enter",
    }));
  });

  await expect(editor).toBeVisible();

  await editor.evaluate((node) => {
    const input = node as HTMLInputElement;
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "한" }));
  });
  await expect(editor).toHaveValue("한");

  await page.keyboard.press("Enter");
  await expect(firstSymbolCell).toContainText("한");
});

test("react basic demo forwards cell-owned Korean composition into the editor", async ({ page }) => {
  await page.goto("/");

  const firstSymbolCell = page.locator('[data-youp-row-index="0"][data-youp-column-id="symbol"]');
  await firstSymbolCell.click();
  await firstSymbolCell.evaluate((node) => {
    node.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    node.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "ㅎ" }));
    node.dispatchEvent(new CompositionEvent("compositionupdate", { bubbles: true, data: "하" }));
    node.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "한" }));
  });

  const editor = page.locator(".youp-grid__cell-editor");
  await expect(editor).toHaveValue("한");
  await page.keyboard.press("Enter");
  await expect(firstSymbolCell).toContainText("한");
});

test("react basic demo keeps tag option colors after edit blur", async ({ page }) => {
  await page.goto("/");

  const firstTagsCell = page.locator('[data-youp-row-index="0"][data-youp-column-id="tags"]');
  const tagColors = firstTagsCell.locator(".youp-grid__tag-color");
  await expect(tagColors.first()).toBeVisible();
  const initialTagColorCount = await tagColors.count();
  expect(initialTagColorCount).toBeGreaterThan(0);

  await firstTagsCell.dblclick();
  const tagInput = page.locator(".youp-grid__tag-input");
  await expect(tagInput).toBeVisible();
  await page.getByRole("heading", { name: "Youp Grid" }).click();
  await expect(tagInput).toBeHidden();
  await expect(tagColors).toHaveCount(initialTagColorCount);
});

test("react basic demo adds custom tags to the color controls", async ({ page }) => {
  await page.goto("/");

  const firstTagsCell = page.locator('[data-youp-row-index="0"][data-youp-column-id="tags"]');

  await firstTagsCell.dblclick();
  const tagInput = page.locator(".youp-grid__tag-input");
  await expect(tagInput).toBeVisible();
  await tagInput.fill("hello");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(firstTagsCell.locator(".youp-grid__tag-list")).toHaveAttribute("title", /Hello/);

  await expect(page.getByRole("button", { name: "Hello #7c3aed" })).toBeVisible();
  await page.getByRole("button", { name: "Hello #7c3aed" }).click();
  await page.getByRole("button", { name: "Expand detail row" }).first().click();

  const customDetailTag = page.locator(".trade-detail__tag").filter({ hasText: "Hello" }).first();
  await expect(customDetailTag).toBeVisible();
  await expect.poll(async () => customDetailTag.getAttribute("style")).toContain("#7c3aed");
});
