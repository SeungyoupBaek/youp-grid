import assert from "node:assert/strict";
import test from "node:test";
import {
  applyGridAiResponse, buildRowModel, createGridAiRequest,
  type ColumnDef, type GridAiAction, type GridState,
} from "../src/index.ts";

const rows = [
  { id: "1", city: "서울", sales: 20 },
  { id: "2", city: "부산", sales: 90 },
  { id: "3", city: "서울", sales: 40 },
];
const columns: ColumnDef<typeof rows[number]>[] = [
  { field: "city", headerName: "지역" },
  { field: "sales", headerName: "매출", editor: "number" },
];
const actions: GridAiAction[] = [
  { type: "setFilter", columnId: "city", operator: "equals", value: "서울" },
  { type: "setSort", columnId: "sales", direction: "desc", multi: false },
];
const apply = (actions: unknown[], state: GridState = {}) => applyGridAiResponse({
  columns, state, response: { actions, explanation: "완료" },
});

test("AI actions produce Seoul sales descending, preserving unrelated state and row data", () => {
  const state: GridState = {
    pagination: { pageIndex: 4, pageSize: 10 },
    selectedRowIds: ["2"],
    columns: [{ columnId: "city", pinned: "left", width: 180 }],
    aggregation: [{ columnId: "sales", function: "sum" }],
  };
  const before = structuredClone({ state, rows });
  const result = apply(actions, state);
  const model = buildRowModel({ rows, columns, state: result.state, getRowId: (row) => row.id });
  assert.deepEqual(model.visibleRows.map((row) => row.id), ["3", "1"]);
  assert.deepEqual(result.state.selectedRowIds, ["2"]);
  assert.deepEqual(result.state.columns, state.columns);
  assert.deepEqual(result.state.aggregation, state.aggregation);
  assert.deepEqual({ state, rows }, before);
});

test("AI filtering resets server pagination/cursor and invalidates cached rows", () => {
  const state: GridState = {
    pagination: { pageIndex: 8, pageSize: 20 },
    cursorPagination: { cursor: "old-cursor", pageSize: 20 },
    remoteCache: { version: 4, stale: false },
    remoteRequest: { requestId: "request-1", status: "loading" },
  };
  const result = apply(actions, state).state;
  assert.equal(result.pagination?.pageIndex, 0);
  assert.equal(result.cursorPagination?.cursor, undefined);
  assert.equal(result.remoteCache?.stale, true);
  assert.deepEqual(result.remoteRequest, state.remoteRequest);
  const server = buildRowModel({ rows: [], columns, state: result, rowModelType: "server", serverRowCount: 100 });
  assert.equal(server.totalRowCount, 100);
});

test("AI request exposes detached metadata and supported state without row/selection/formula payloads", () => {
  const state: GridState = {
    selectedRowIds: ["secret-row"],
    formula: { cells: [{ rowId: "secret-row", columnId: "sales", formula: "=2+2" }] },
    filters: [{ columnId: "city", operator: "in", value: ["서울"] }],
  };
  const request = createGridAiRequest({ prompt: " 서울만 보여줘 ", columns, state });
  assert.equal(request.prompt, "서울만 보여줘");
  assert.deepEqual(Object.keys(request.context.state), ["sort", "filters", "columns"]);
  assert.equal(JSON.stringify(request).includes("secret-row"), false);
  assert.equal(JSON.stringify(request).includes("accessor"), false);
  (request.context.state.filters![0].value as string[]).push("부산");
  assert.deepEqual(state.filters![0].value, ["서울"]);
  assert.throws(() => createGridAiRequest({ prompt: " ", columns, state }));
  assert.throws(() => createGridAiRequest({ prompt: "sort", columns: [], state }));
});

test("invalid actions reject the entire response without partially changing existing state", () => {
  const state: GridState = { sort: [{ columnId: "city", direction: "asc" }], pagination: { pageIndex: 3, pageSize: 10 } };
  const before = structuredClone(state);
  for (const invalid of [
    { type: "setSort", columnId: "missing", direction: "asc", multi: false },
    { type: "deleteRows", columnId: "city" },
    { type: "setSort", columnId: "sales", direction: "up", multi: false },
    { type: "setSort", columnId: "sales", direction: "asc" },
    { type: "setColumnHidden", columnId: "city", hidden: "true" },
    { type: "clearFilter", columnId: "city", script: "alert(1)" },
    { type: "setFilter", columnId: "sales", operator: "between", value: [1] },
    { type: "setFilter", columnId: "sales", operator: "between", value: [1, "2"] },
    { type: "setFilter", columnId: "sales", operator: "gt", value: Infinity },
    { type: "setFilter", columnId: "city", operator: "in", value: [] },
    { type: "setFilter", columnId: "city", operator: "isEmpty" },
    { type: "setFilter", columnId: "city", operator: "equals", value: {} },
    { type: "setFilter", columnId: "city", operator: "execute", value: "anything" },
    null,
  ]) {
    assert.throws(() => apply([...actions, invalid], state));
    assert.deepEqual(state, before);
  }
  assert.throws(() => apply(Array.from({ length: 101 }, () => actions[0]), state));
  for (const response of ["not JSON", "```json\n{}\n```", null, [], { actions: [] }, { actions: [], explanation: "", rows: [] }]) {
    assert.throws(() => applyGridAiResponse({ columns, state, response }));
  }
});

test("AI honors disabled sort/filter capabilities in both validation and generated schema", () => {
  const restricted = [{ field: "city", sortable: false, filterable: false }] satisfies ColumnDef<typeof rows[number]>[];
  const request = createGridAiRequest({ prompt: "sort", columns: restricted, state: {} });
  const schema = JSON.stringify(request.responseSchema);
  assert.equal(schema.includes('"setSort"'), false);
  assert.equal(schema.includes('"setFilter"'), false);
  for (const action of [actions[0], { type: "clearSort", columnId: "city" }, { type: "clearFilter", columnId: "city" }]) {
    assert.throws(() => applyGridAiResponse({ columns: restricted, state: {}, response: { actions: [action], explanation: "" } }));
  }
});

test("retrying a response is idempotent and clearing restores the normal row model", () => {
  const once = apply(actions).state;
  const twice = apply(actions, once).state;
  assert.deepEqual(twice, once);
  const hidden = apply([{ type: "setColumnHidden", columnId: "sales", hidden: true }], twice).state;
  assert.deepEqual(buildRowModel({ rows, columns, state: hidden }).visibleColumns.map((column) => column.id), ["city"]);
  const restored = apply([
    { type: "clearFilter", columnId: "city" },
    { type: "clearSort", columnId: "sales" },
    { type: "setColumnHidden", columnId: "sales", hidden: false },
  ], hidden).state;
  assert.deepEqual(buildRowModel({ rows, columns, state: restored }).visibleRows.map((row) => row.original.id), ["1", "2", "3"]);
});

test("AI supports compound sort, ranges, alternatives, and empty filters", () => {
  const result = apply([
    { type: "setSort", columnId: "city", direction: "asc", multi: false },
    { type: "setSort", columnId: "sales", direction: "desc", multi: true },
    { type: "setFilter", columnId: "sales", operator: "between", value: [20, 50] },
    { type: "setFilter", columnId: "city", operator: "in", value: ["서울", "부산"] },
  ]).state;
  assert.equal(result.sort?.length, 2);
  assert.deepEqual(buildRowModel({ rows, columns, state: result }).visibleRows.map((row) => row.original.id), ["3", "1"]);
  const empty = apply([{ type: "setFilter", columnId: "city", operator: "isEmpty", value: null }]).state;
  assert.equal(buildRowModel({ rows, columns, state: empty }).filteredRowCount, 0);
});

test("provider mutation cannot modify applied state and an unsupported request is a no-op", () => {
  const response = { actions: [{ type: "setFilter", columnId: "city", operator: "in", value: ["서울"] }], explanation: "" };
  const result = applyGridAiResponse({ columns, state: {}, response });
  response.actions[0].value.push("부산");
  assert.deepEqual(result.state.filters?.[0].value, ["서울"]);
  const state = result.state;
  assert.equal(apply([], state).state, state);
  assert.deepEqual(applyGridAiResponse({ columns, state: {}, response: JSON.stringify({ actions, explanation: "완료" }) }).state, apply(actions).state);
});

test("adapting a schema for one provider cannot change future requests or validation", () => {
  const make = () => createGridAiRequest({ prompt: "filter", columns, state: {} });
  const original = JSON.stringify(make().responseSchema);
  const mutateArrays = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(mutateArrays);
      value.push("provider-specific");
    } else if (value && typeof value === "object") Object.values(value).forEach(mutateArrays);
  };
  mutateArrays(make().responseSchema);
  assert.equal(JSON.stringify(make().responseSchema), original);
  assert.throws(() => apply([{ type: "setFilter", columnId: "city", operator: "provider-specific", value: "서울" }]));
});
