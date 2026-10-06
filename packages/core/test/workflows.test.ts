import assert from "node:assert/strict";
import test from "node:test";
import { applyGridAiPreview, applyGridView, buildRowModel, captureGridView, createGridAiPreview, createGridEditSession, createGridImportPreview, createGridState, createRemoteCacheKey, createServerRowsQuery, deleteGridView, exportGridCsv, getGridCellAppearance, getGridDraftKey, loadGridViews, matchGridImportHeaders, saveGridViews, setDefaultGridView, setGridQuery, undoGridAiPreview, updateGridView, validateFilterExpression, type ColumnDef, type GridFilterExpression, type GridViewCollection } from "../src/index.ts";

const rows = [{ id: "a", item: "Apple", status: "Open", quantity: 10 }, { id: "b", item: "Banana", status: "Closed", quantity: 20 }, { id: "c", item: "Cherry", status: "Open", quantity: 30 }];
const columns: ColumnDef<typeof rows[number]>[] = [{ field: "item" }, { field: "status" }, { field: "quantity", editor: "number", valueParser: Number, validator: (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 || "Nonnegative quantity required" }];
const expression: GridFilterExpression = { operator: "or", conditions: [{ columnId: "item", operator: "equals", value: "Banana" }, { operator: "and", conditions: [{ columnId: "status", operator: "equals", value: "Open" }, { columnId: "quantity", operator: "gt", value: 20 }] }] };
test("nested OR/AND filters affect sorting, aggregation, pagination and exported rows together", () => {
  const state = { filterExpression: expression, sort: [{ columnId: "quantity", direction: "desc" as const }], aggregation: [{ columnId: "quantity", function: "sum" as const }], pagination: { pageIndex: 0, pageSize: 1 } };
  const model = buildRowModel({ rows, columns, state, getRowId: (row) => row.id });
  assert.deepEqual(model.sortedRows.map((row) => row.id), ["c", "b"]);
  assert.deepEqual(model.visibleRows.map((row) => row.id), ["c"]);
  assert.equal(model.aggregation.find((result) => result.columnId === "quantity")!.value, 50);
  assert.match(exportGridCsv({ rows: model.sortedRows, columns: model.visibleColumns }), /Cherry/);
  assert.equal(buildRowModel({ rows, columns, state: { ...state, quickFilter: "banana closed" } }).filteredRowCount, 1);
  assert.equal(buildRowModel({ rows, columns, state: { quickFilter: "banana", columns: [{ columnId: "item", hidden: true }] } }).filteredRowCount, 0);
});
test("query resets remote navigation and uses distinct server cache keys without locally filtering server pages", () => {
  const original = createGridState({ pagination: { pageIndex: 9, pageSize: 20 }, cursorPagination: { pageSize: 20, cursor: "old", hasNextPage: true }, remoteCache: { version: 1 } });
  const next = setGridQuery(original, { quickFilter: "Apple", filterExpression: expression });
  assert.equal(next.pagination?.pageIndex, 0); assert.equal(next.cursorPagination?.cursor, undefined); assert.equal(next.cursorPagination?.hasNextPage, undefined); assert.equal(next.remoteCache?.stale, true);
  assert.notEqual(createRemoteCacheKey(original), createRemoteCacheKey(next));
  assert.notEqual(next.filterExpression, expression);
  assert.deepEqual(setGridQuery(next, { quickFilter: "Banana" }).filterExpression, expression);
  const query = createServerRowsQuery(next); assert.equal(query.quickFilter, "Apple"); assert.deepEqual(query.filterExpression, expression);
  assert.equal(buildRowModel({ rows, columns, state: next, rowModelType: "server", serverRowCount: 300 }).visibleRows.length, 3);
  assert.throws(() => validateFilterExpression({ columnId: "quantity", operator: "between", value: [1, NaN] }, [{ id: "quantity" }]));
  assert.throws(() => validateFilterExpression({ columnId: "missing", operator: "equals", value: "x" }, [{ id: "quantity" }]));
});
test("saved views detach configuration, persist a default and preserve live selection and formulas", () => {
  const original = createGridState({ quickFilter: "Open", filterExpression: expression, selectedRowIds: ["a"], columns: [{ columnId: "item", width: 180 }] });
  let collection: GridViewCollection = updateGridView({ version: 1, views: [] }, { id: "v", name: " Open ", settings: captureGridView(original) });
  original.columns![0].width = 300;
  collection = setDefaultGridView(collection, "v");
  let value: string | null = null; const storage = { getItem: () => value, setItem: (_key: string, next: string) => { value = next; } };
  saveGridViews(storage, "views", collection); const loaded = loadGridViews(storage, "views");
  const live = createGridState({ selectedRowIds: ["b"], formula: { cells: [] }, pagination: { pageIndex: 5, pageSize: 10 } });
  const restored = applyGridView(live, loaded.views[0], [{ id: "item" }, { id: "status" }, { id: "quantity" }]);
  assert.equal(restored.columns![0].width, 180); assert.deepEqual(restored.selectedRowIds, ["b"]); assert.deepEqual(restored.formula, live.formula); assert.equal(restored.pagination?.pageIndex, 0);
  assert.equal(loaded.views[0].name, "Open"); assert.equal(deleteGridView(loaded, "v").defaultViewId, undefined);
  value = '{"version":1,"views":[{"id":"bad","name":"Bad","settings":{"columns":[null]}}]}'; assert.equal(loadGridViews(storage, "views").views.length, 0);
});
test("edit sessions coalesce, undo, redo, discard and keep baseline null values and nested rows immutable", () => {
  const source = [{ id: "a", detail: { value: null as number | null }, untouched: { n: 1 } }];
  const session = createGridEditSession({ rows: source, columns: [{ field: "detail.value" }], getRowId: (row) => row.id, onSave: async () => {} });
  session.stage([{ rowId: "a", columnId: "detail.value", value: 1 }]); session.stage([{ rowId: "a", columnId: "detail.value", value: 2 }]);
  assert.equal(session.getSnapshot().changes[0].previousValue, null); assert.equal(source[0].detail.value, null); assert.equal(session.getSnapshot().rows[0].untouched, source[0].untouched);
  session.undo(); assert.equal(session.getSnapshot().rows[0].detail.value, 1); session.redo(); assert.equal(session.getSnapshot().rows[0].detail.value, 2);
  session.stage([{ rowId: "a", columnId: "detail.value", value: null }]); assert.equal(session.getSnapshot().changes.length, 0); session.undo(); session.discard(); assert.equal(session.getSnapshot().rows[0].detail.value, null);
});
test("failed saves retain every change, retry the same change set and lock concurrent edits", async () => {
  let reject = true; let complete: (() => void) | undefined; let calls = 0;
  const session = createGridEditSession({ rows, columns, getRowId: (row) => row.id, onSave: async (changes) => { calls++; assert.equal(changes.length, 2); if (reject) throw new Error("offline"); await new Promise<void>((resolve) => { complete = resolve; }); } });
  session.stage([{ rowId: "a", columnId: "quantity", value: 11 }, { rowId: "b", columnId: "quantity", value: 22 }]);
  await assert.rejects(session.save(), /offline/); assert.equal(session.getSnapshot().changes.length, 2); reject = false;
  const saving = session.save(); await new Promise((resolve) => setTimeout(resolve, 0));
  assert.throws(() => session.stage([{ rowId: "a", columnId: "quantity", value: 12 }]), /progress/); assert.throws(() => session.discard(), /progress/);
  complete!(); await saving; assert.equal(calls, 2); assert.equal(session.getSnapshot().changes.length, 0); assert.equal(session.getSnapshot().rows[0].quantity, 11); assert.equal(session.getSnapshot().canUndo, false);
});
test("validation rejects pasted or cleared drafts and validates dependent fields before atomic persistence", async () => {
  let calls = 0;
  const session = createGridEditSession({ rows, columns: columns.map((column) => column.field === "status" ? { ...column, validator: (_value, row) => row.quantity < 100 || "Too large for status" } : column), getRowId: (row) => row.id, onSave: async () => { calls++; } });
  session.stage([{ rowId: "a", columnId: "quantity", value: -1 }]); await assert.rejects(session.save(), /validation/);
  assert.match(session.getSnapshot().errors[getGridDraftKey("a", "quantity")], /Nonnegative/);
  session.stage([{ rowId: "a", columnId: "quantity", value: 110 }]); await assert.rejects(session.save()); assert.match(session.getSnapshot().errors[getGridDraftKey("a", "status")], /Too large/);
  session.stage([{ rowId: "a", columnId: "quantity", value: 12 }]); await session.save(); assert.equal(calls, 1);
});
test("refresh conflicts, invalid IDs and partial save responses preserve pending work", async () => {
  let calls = 0; const session = createGridEditSession({ rows, columns: [...columns, { field: "id" }], getRowId: (row) => row.id, onSave: async () => { calls++; return [rows[0]]; } });
  assert.throws(() => session.stage([{ rowId: "a", columnId: "id", value: "new" }]), /row ID/);
  session.stage([{ rowId: "a", columnId: "quantity", value: 11 }]); session.replaceRows(rows.map((row) => row.id === "a" ? { ...row, quantity: 15 } : row));
  await assert.rejects(session.save(), /validation/); assert.equal(calls, 0);
  session.discard(); session.stage([{ rowId: "a", columnId: "quantity", value: 16 }]); await assert.rejects(session.save(), /incomplete/); assert.equal(session.getSnapshot().changes.length, 1);
});
test("disposing a save aborts its signal and prevents a late response from clearing drafts", async () => {
  let finish: (() => void) | undefined; let signal: AbortSignal | undefined;
  const session = createGridEditSession({ rows, columns, getRowId: (row) => row.id, onSave: async (_changes, current) => { signal = current; await new Promise<void>((resolve) => { finish = resolve; }); } });
  session.stage([{ rowId: "a", columnId: "quantity", value: 11 }]); const saving = session.save(); await new Promise((resolve) => setTimeout(resolve, 0)); session.dispose(); assert.equal(signal!.aborted, true); finish!(); await saving; assert.equal(session.getSnapshot().changes.length, 1);
});
test("a multi-cell operation cannot change composite row identity and is rejected atomically", () => {
  const session = createGridEditSession({ rows: [{ first: false, second: false }], columns: [{ field: "first" }, { field: "second" }], getRowId: (row) => row.first && row.second ? "changed" : "stable", onSave: async () => {} });
  assert.throws(() => session.stage([{ rowId: "stable", columnId: "first", value: true }, { rowId: "stable", columnId: "second", value: true }]), /row ID/);
  assert.equal(session.getSnapshot().changes.length, 0);
  assert.deepEqual(session.getSnapshot().rows, [{ first: false, second: false }]);
});
test("import preview maps by header, validates the complete row and never changes source defaults", async () => {
  const table = { name: "orders", headers: ["quantity", "Item", "Status"], rows: [[12, "Dates", "Open"], [-2, "Fig", "Closed"]] };
  const defaults = { id: "import", item: "", status: "Open", quantity: 0 };
  const preview = await createGridImportPreview({ table, columns, mappings: matchGridImportHeaders(columns, table.headers), createRow: (index) => ({ ...defaults, id: String(index) }), getRowId: (row) => row.id });
  assert.equal(preview.rows[0].quantity, 12); assert.equal(preview.rows[0].item, "Dates"); assert.equal(preview.valid, false); assert.equal(preview.issues[0].rowIndex, 1); assert.equal(defaults.quantity, 0);
  assert.deepEqual(matchGridImportHeaders(columns, ["Unrelated", "headers"]), []);
  const duplicate = await createGridImportPreview({ table: { ...table, rows: [table.rows[0]] }, columns, mappings: [{ columnId: "quantity", sourceIndex: 0 }], createRow: () => defaults, getRowId: (row) => row.id, existingRowIds: ["import"] }); assert.equal(duplicate.valid, false);
});
test("conditional rules apply only matching cells and clamp data bars", () => {
  const rule = { id: "r", columnId: "quantity", operator: "isNotEmpty" as const, color: "red", icon: "▲", dataBar: { min: 0, max: 100 } };
  assert.equal(getGridCellAppearance(120, "quantity", [rule]).backgroundImage, "linear-gradient(to right, #dbeafe 100%, transparent 100%)"); assert.equal(getGridCellAppearance(-1, "quantity", [rule]).backgroundImage, "linear-gradient(to right, #dbeafe 0%, transparent 0%)"); assert.deepEqual(getGridCellAppearance(12, "item", [rule]), {});
});
test("AI preview leaves state unchanged; confirmation and undo preserve later selection and widths", () => {
  const state = createGridState({ selectedRowIds: ["a"], columns: [{ columnId: "quantity", width: 140 }] });
  const response = { actions: [{ type: "setFilter", columnId: "status", operator: "equals", value: "Open" }, { type: "setColumnHidden", columnId: "quantity", hidden: true }], explanation: "Open only" };
  const preview = createGridAiPreview(response, columns, state); assert.equal(state.filters!.length, 0);
  const applied = applyGridAiPreview(preview, columns, { ...state, selectedRowIds: ["b"] });
  const restored = undoGridAiPreview(preview, columns, { ...applied, selectedRowIds: ["c"], columns: applied.columns!.map((column) => ({ ...column, width: 240 })) });
  assert.deepEqual(restored.selectedRowIds, ["c"]); assert.equal(restored.columns![0].width, 240); assert.equal(restored.columns![0].hidden, false); assert.equal(restored.filters!.length, 0);
  assert.throws(() => applyGridAiPreview(preview, columns, { ...state, sort: [{ columnId: "item", direction: "asc" }] }), /changed/);
  assert.throws(() => undoGridAiPreview(preview, columns, { ...applied, filters: [] }), /changed/);
});
