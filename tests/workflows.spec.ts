import { expect, test, type Locator } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";

const details = (scope: Locator, name: string) => scope.locator("details").filter({ has: scope.page().locator("summary", { hasText: new RegExp(`^${name}$`) }) });
const cell = (scope: Locator, row: number, column: string) => scope.locator(`[role="gridcell"][data-youp-row-index="${row}"][data-youp-column-id="${column}"]`);
for (const adapter of ["react", "vue"]) {
  test(`${adapter}: views persist, restore search and preserve selection`, async ({ page }) => {
    await page.goto("/?workflows=1"); const scope = page.locator(`[data-adapter="${adapter}"]`);
    await expect(scope.getByRole("grid")).toBeVisible();
    await scope.getByRole("checkbox", { name: /Select row 1|Select row 0/ }).first().check();
    await scope.getByLabel("Search all visible columns").fill("Apple"); await expect(cell(scope, 0, "item")).toHaveText("Apple"); await expect(scope.locator('[role="gridcell"][data-youp-column-id="item"]')).toHaveCount(1);
    const views = details(scope, "Saved views"); await views.locator("summary").click(); await views.getByLabel("View name").fill("Apple view"); await views.getByRole("button", { name: "Save view", exact: true }).click(); await views.getByRole("button", { name: "Set default" }).click();
    await scope.getByLabel("Search all visible columns").fill(""); await expect(scope.locator('[role="gridcell"][data-youp-column-id="item"]')).toHaveCount(3);
    await views.getByLabel("Saved views").selectOption({ label: "Apple view ★" }); await expect(scope.getByRole("checkbox", { name: /Select row/ }).first()).toBeChecked();
    await page.reload(); await expect(page.locator(`[data-adapter="${adapter}"]`).getByLabel("Search all visible columns")).toHaveValue("Apple");
  });
  test(`${adapter}: staged edits, save failure and retry, undo and discard`, async ({ page }) => {
    await page.goto("/?workflows=1"); const scope = page.locator(`[data-adapter="${adapter}"]`);
    const edits = details(scope, "Pending changes"); await edits.locator("summary").click();
    await cell(scope, 0, "quantity").dblclick(); const editor = cell(scope, 0, "quantity").locator("input:visible").first(); await editor.fill("15"); await editor.press("Enter");
    await expect(edits.getByRole("status")).toContainText("1 Pending changes"); await expect(cell(scope, 0, "quantity")).toContainText("15");
    await scope.getByRole("button", { name: "Fail next save" }).click(); await edits.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(edits.getByRole("alert")).toContainText("Changes kept"); await expect(edits.getByRole("status")).toContainText("1 Pending changes");
    await edits.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(scope.getByTestId("saved-count")).toHaveText("Successful saves: 1"); await expect(edits.getByRole("status")).toContainText("0 Pending changes");
    await cell(scope, 0, "quantity").dblclick(); await editor.fill("25"); await editor.press("Enter"); await edits.getByRole("button", { name: "Undo", exact: true }).click(); await expect(cell(scope, 0, "quantity")).toContainText("15"); await edits.getByRole("button", { name: "Redo", exact: true }).click(); await expect(cell(scope, 0, "quantity")).toContainText("25"); await edits.getByRole("button", { name: "Discard changes" }).click(); await expect(cell(scope, 0, "quantity")).toContainText("15");
  });
  test(`${adapter}: rejected row identity edits show an error and preserve pending work`, async ({ page }) => {
    const errors: string[] = []; page.on("pageerror", (cause) => errors.push(cause.message));
    await page.goto("/?workflows=1"); const scope = page.locator(`[data-adapter="${adapter}"]`);
    const edits = details(scope, "Pending changes"); await edits.locator("summary").click();
    await cell(scope, 0, "quantity").dblclick(); const quantity = cell(scope, 0, "quantity").locator("input:visible").first(); await quantity.fill("15"); await quantity.press("Enter");
    await scope.getByRole("button", { name: "Columns", exact: true }).click(); await scope.getByRole("checkbox", { name: "ID", exact: true }).check(); await scope.getByRole("button", { name: "Columns", exact: true }).click();
    const id = cell(scope, 0, "id"); await id.dblclick(); const editor = id.locator("input:visible").first(); await editor.fill("changed"); await editor.press("Enter");
    await expect(id).toHaveAttribute("title", /cannot change a row ID/);
    await expect(edits.getByRole("status")).toContainText("1 Pending changes");
    await editor.press("Escape"); await expect(id).toContainText("a");
    await edits.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(scope.getByTestId("saved-count")).toHaveText("Successful saves: 1"); await expect(id).toContainText("a");
    expect(errors).toEqual([]);
  });
  test(`${adapter}: nested OR filters and conditional colors/icons/data bars render`, async ({ page }) => {
    await page.goto("/?workflows=1"); const scope = page.locator(`[data-adapter="${adapter}"]`);
    const filters = details(scope, "Compound filters"); await filters.locator("summary").click(); await filters.getByLabel("Match conditions").selectOption("or"); await filters.getByRole("button", { name: "Add condition", exact: true }).click(); await filters.getByLabel("Value", { exact: true }).fill("Banana"); await filters.getByRole("button", { name: "Add group", exact: true }).click(); await filters.getByLabel("Match conditions").nth(1).selectOption("and"); await filters.getByLabel("Column", { exact: true }).nth(1).selectOption("quantity"); await filters.getByLabel("Operator", { exact: true }).nth(1).selectOption("gt"); await filters.getByLabel("Value", { exact: true }).nth(1).fill("20"); await filters.getByRole("button", { name: "Apply filters" }).click();
    await expect(scope.locator('[role="gridcell"][data-youp-column-id="item"]')).toHaveCount(2); await expect(cell(scope, 0, "item")).toHaveText("Banana"); await expect(cell(scope, 1, "item")).toHaveText("Cherry");
    const formatting = details(scope, "Conditional formatting"); await formatting.locator("summary").click(); await formatting.getByLabel("Column", { exact: true }).selectOption("quantity"); await formatting.getByLabel("Operator", { exact: true }).selectOption("gt"); await formatting.getByLabel("Value", { exact: true }).fill("20"); await formatting.getByLabel("Icon").fill("▲"); await formatting.getByLabel("Data bar").check(); await formatting.getByRole("button", { name: "Add formatting rule" }).click();
    await expect(cell(scope, 1, "quantity")).toHaveCSS("color", "rgb(220, 38, 38)"); await expect(cell(scope, 1, "quantity")).toContainText("▲"); expect(await cell(scope, 1, "quantity").evaluate((node) => getComputedStyle(node).backgroundImage)).toContain("30%"); await expect(cell(scope, 0, "quantity")).not.toContainText("▲");
  });
  test(`${adapter}: paste, fill and delete share pending history and validation`, async ({ page }) => {
    await page.goto("/?workflows=1");
    const scope = page.locator(`[data-adapter="${adapter}"]`);
    const edits = details(scope, "Pending changes");
    await edits.locator("summary").click();
    const first = cell(scope, 0, "quantity");
    await first.click();
    await first.evaluate((node) => {
      const data = new DataTransfer(); data.setData("text/plain", "11\n21");
      node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(edits.getByRole("status")).toContainText("2 Pending changes");
    await expect(cell(scope, 1, "quantity")).toContainText("21");
    await edits.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(first).toContainText("10");
    await expect(cell(scope, 1, "quantity")).toContainText("20");
    await first.click();
    await first.getByRole("button", { name: "Fill selection" }).hover();
    await page.mouse.down(); await cell(scope, 2, "quantity").hover(); await page.mouse.up();
    await expect(cell(scope, 1, "quantity")).toContainText("11");
    await expect(cell(scope, 2, "quantity")).toContainText("12");
    await expect(edits.getByRole("status")).toContainText("2 Pending changes");
    await edits.getByRole("button", { name: "Discard changes" }).click();
    await cell(scope, 0, "item").click(); await page.keyboard.press("Delete");
    await expect(edits.getByRole("status")).toContainText("1 Pending changes");
    await edits.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(edits.getByRole("alert")).toContainText("Item is required");
    await expect(scope.getByTestId("saved-count")).toHaveText("Successful saves: 0");
    await edits.getByRole("button", { name: "Discard changes" }).click();
    await expect(cell(scope, 0, "item")).toContainText("Apple");
  });
  test(`${adapter}: AI preview confirms, undoes, and rejects stale settings`, async ({ page }) => {
    await page.goto("/?workflows=1"); const scope = page.locator(`[data-adapter="${adapter}"]`); const ai = scope.getByRole("form", { name: "AI grid instruction" });
    await ai.getByRole("textbox").fill("Open orders sorted by quantity"); await ai.getByRole("button", { name: "Preview", exact: true }).click(); await expect(ai.getByLabel("AI preview")).toBeVisible(); await expect(cell(scope, 0, "item")).toHaveText("Apple"); await ai.getByRole("button", { name: "Apply AI changes" }).click(); await expect(cell(scope, 0, "item")).toHaveText("Cherry"); await expect(scope.locator('[role="gridcell"][data-youp-column-id="item"]')).toHaveCount(2); await ai.getByRole("button", { name: "Undo AI changes" }).click(); await expect(cell(scope, 0, "item")).toHaveText("Apple");
    await ai.getByRole("button", { name: "Preview", exact: true }).click(); await expect(ai.getByLabel("AI preview")).toBeVisible(); await scope.getByRole("columnheader", { name: /Quantity/ }).getByRole("button", { name: "Quantity", exact: true }).click(); await ai.getByRole("button", { name: "Apply AI changes" }).click(); await expect(ai.getByRole("alert")).toContainText("changed"); await expect(scope.locator('[role="gridcell"][data-youp-column-id="item"]')).toHaveCount(3);
  });
  test(`${adapter}: XLSX sheet mapping and validation precede explicit import, export is binary`, async ({ page }) => {
    await page.goto("/?workflows=1"); const scope = page.locator(`[data-adapter="${adapter}"]`); await scope.getByRole("button", { name: "Enable XLSX" }).click(); const importing = details(scope, "Import CSV / XLSX"); await importing.locator("summary").click(); await expect(importing.getByRole("button", { name: "Export XLSX" })).toBeVisible();
    const workbook = new ExcelJS.Workbook(); const bad = workbook.addWorksheet("Invalid"); bad.addRow(["Quantity", "Item", "Status"]); bad.addRow([-1, "Dates", "Open"]); const good = workbook.addWorksheet("Valid"); good.addRow(["Quantity", "Item", "Status"]); good.addRow([40, "Dates", "Open"]);
    await importing.locator('input[type="file"]').setInputFiles({ name: "orders.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await workbook.xlsx.writeBuffer()) });
    await expect(importing.getByLabel("Sheet", { exact: true })).toBeVisible(); await importing.getByRole("button", { name: "Preview import" }).click(); await expect(importing.getByRole("alert")).toContainText("Quantity"); await expect(importing.getByRole("button", { name: "Apply import" })).toBeDisabled(); await expect(scope.locator('[role="gridcell"][data-youp-column-id="item"]')).toHaveCount(3);
    await importing.getByLabel("Sheet", { exact: true }).selectOption("1"); await importing.getByRole("button", { name: "Preview import" }).click(); await expect(importing.getByRole("button", { name: "Apply import" })).toBeEnabled(); await expect(scope.locator('[role="gridcell"][data-youp-column-id="item"]')).toHaveCount(3); await importing.getByRole("button", { name: "Apply import" }).click(); await expect(scope.locator('[role="gridcell"][data-youp-column-id="item"]')).toHaveCount(4);
    const download = page.waitForEvent("download"); await importing.getByRole("button", { name: "Export XLSX" }).click(); const file = await download; expect(file.suggestedFilename()).toBe("youp-grid.xlsx"); const exported = new ExcelJS.Workbook(); await exported.xlsx.load(await readFile((await file.path())!)); expect(exported.worksheets[0].getCell("A5").value).toBe("Dates"); expect(exported.worksheets[0].getCell("C5").value).toBe(40);
  });
}
