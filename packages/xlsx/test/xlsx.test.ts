import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { buildRowModel } from "@youp-grid/core";
import { createXlsxAdapter } from "../src/index.ts";

test("exports an actual XLSX workbook and round-trips numbers, booleans, strings and visible columns", async () => {
  const adapter = createXlsxAdapter();
  const model = buildRowModel({ rows: [{ code: "0012", count: 42, active: true, secret: "hidden" }], columns: [{ field: "code" }, { field: "count" }, { field: "active" }, { field: "secret", hidden: true }] });
  const bytes = await adapter.write({ rows: model.sortedRows, columns: model.visibleColumns, sheetName: "Orders" });
  assert.equal(new TextDecoder().decode(bytes.slice(0, 2)), "PK");
  const tables = await adapter.read(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  assert.equal(tables[0].name, "Orders"); assert.deepEqual(tables[0].rows, [["0012", 42, true]]); assert.equal(tables[0].headers.length, 3);
});
test("reads separate sheets, typed dates and cached formulas and rejects formulas without results", async () => {
  const adapter = createXlsxAdapter(); const workbook = new ExcelJS.Workbook();
  const first = workbook.addWorksheet("One"); first.addRow(["value", "date"]); first.addRow([{ formula: "1+2", result: 3 }, new Date("2026-10-06T00:00:00Z")]);
  const second = workbook.addWorksheet("Two"); second.addRow(["label"]); second.addRow(["text"]);
  const buffer = await workbook.xlsx.writeBuffer(); const tables = await adapter.read(new Uint8Array(buffer).buffer);
  assert.equal(tables.length, 2); assert.equal(tables[0].rows[0][0], 3); assert.equal(tables[0].rows[0][1], "2026-10-06T00:00:00.000Z");
  first.getCell("A2").value = { formula: "1+2" }; await assert.rejects(adapter.read(new Uint8Array(await workbook.xlsx.writeBuffer()).buffer), /cached result/);
});
