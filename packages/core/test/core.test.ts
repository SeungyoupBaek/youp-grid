import assert from "node:assert/strict";
import test from "node:test";

import {
  acknowledgeRemoteCache,
  applyAggregation,
  applyRowGrouping,
  buildRowModel,
  cancelRemoteRequest,
  clearFilter,
  clearSelection,
  createGridState,
  createRemoteCacheKey,
  createValueHistoryState,
  exportGridCsv,
  failRemoteRequest,
  finishRemoteRequest,
  getFillHandleCells,
  getFillHandleTargetRange,
  getClipboardPasteCells,
  getInfiniteScrollTrigger,
  getVirtualRange,
  invertValueHistoryEntry,
  isRowGroupNode,
  isActiveRemoteRequest,
  isCellInRange,
  normalizeCellRange,
  parseClipboardText,
  pushValueHistoryEntry,
  redoValueHistory,
  clearSort,
  serializeGridRange,
  invalidateRemoteCache,
  setColumnHidden,
  setColumnOrder,
  setColumnPinned,
  setColumnWidth,
  setCursorPage,
  setCursorPageSize,
  setCursorPagination,
  setAggregation,
  setFilter,
  setPagination,
  setRemoteCache,
  setRowGrouping,
  setRowSelected,
  setSort,
  setTreeExpandedRows,
  startRemoteRequest,
  toggleRowGroupExpanded,
  toggleTreeRowExpanded,
  toggleSort,
  undoValueHistory,
  type ColumnDef,
  type GridState,
} from "../src/index.ts";

type Person = {
  id: string;
  name: string;
  age: number;
  city: string;
  profile: {
    tier: string;
  };
};

const rows: Person[] = [
  { id: "a", name: "Kim", age: 35, city: "Seoul", profile: { tier: "gold" } },
  { id: "b", name: "Lee", age: 20, city: "Busan", profile: { tier: "silver" } },
  { id: "c", name: "Park", age: 29, city: "Seoul", profile: { tier: "bronze" } },
  { id: "d", name: "Choi", age: 35, city: "Daegu", profile: { tier: "gold" } },
];

const columns: ColumnDef<Person>[] = [
  { field: "name" },
  { field: "age" },
  { field: "city" },
  { field: "profile.tier", headerName: "Tier" },
];

test("buildRowModel filters, sorts, and paginates rows", () => {
  const state: GridState = {
    filters: [{ columnId: "city", operator: "contains", value: "seo" }],
    sort: [{ columnId: "age", direction: "desc" }],
    pagination: { pageIndex: 0, pageSize: 1 },
  };

  const model = buildRowModel({
    rows,
    columns,
    state,
    getRowId: (row) => row.id,
  });

  assert.equal(model.totalRowCount, 4);
  assert.equal(model.filteredRowCount, 2);
  assert.equal(model.visibleRowCount, 1);
  assert.equal(model.pageCount, 2);
  assert.equal(model.visibleRows[0]?.id, "a");
});

test("buildRowModel supports nested field access", () => {
  const model = buildRowModel({
    rows,
    columns,
    state: {
      filters: [{ columnId: "profile.tier", operator: "equals", value: "gold" }],
    },
  });

  assert.deepEqual(
    model.visibleRows.map((row) => row.original.name),
    ["Kim", "Choi"],
  );
});

test("buildRowModel preserves column header group metadata", () => {
  const model = buildRowModel({
    rows,
    columns: [
      { field: "name", headerGroup: "Identity" },
      { field: "age", headerGroup: "Identity" },
      { field: "city" },
    ],
  });

  assert.deepEqual(
    model.columns.map((column) => column.headerGroup),
    ["Identity", "Identity", undefined],
  );
});

test("buildRowModel supports server-side row model counts", () => {
  const model = buildRowModel({
    rows: [rows[1]!, rows[0]!],
    columns,
    state: {
      filters: [{ columnId: "city", operator: "contains", value: "seoul" }],
      sort: [{ columnId: "age", direction: "asc" }],
      pagination: { pageIndex: 2, pageSize: 2 },
    },
    getRowId: (row) => row.id,
    rowModelType: "server",
    serverRowCount: 25,
    serverFilteredRowCount: 7,
  });

  assert.deepEqual(
    model.visibleRows.map((row) => row.id),
    ["b", "a"],
  );
  assert.equal(model.totalRowCount, 25);
  assert.equal(model.filteredRowCount, 7);
  assert.equal(model.visibleRowCount, 2);
  assert.equal(model.pageCount, 4);
});

test("buildRowModel aggregates filtered rows before pagination", () => {
  const model = buildRowModel({
    rows,
    columns,
    state: {
      filters: [{ columnId: "city", operator: "equals", value: "Seoul" }],
      pagination: { pageIndex: 0, pageSize: 1 },
      aggregation: [
        { columnId: "age", function: "sum" },
        { columnId: "age", function: "avg" },
        { columnId: "age", function: "min" },
        { columnId: "age", function: "max" },
        { columnId: "name", function: "count" },
      ],
    },
  });

  assert.equal(model.visibleRowCount, 1);
  assert.deepEqual(model.aggregation, [
    { columnId: "age", function: "sum", label: "Sum", value: 64, rowCount: 2, valueCount: 2 },
    { columnId: "age", function: "avg", label: "Avg", value: 32, rowCount: 2, valueCount: 2 },
    { columnId: "age", function: "min", label: "Min", value: 29, rowCount: 2, valueCount: 2 },
    { columnId: "age", function: "max", label: "Max", value: 35, rowCount: 2, valueCount: 2 },
    { columnId: "name", function: "count", label: "Count", value: 2, rowCount: 2, valueCount: 0 },
  ]);
});

test("buildRowModel aggregates loaded rows in server row model", () => {
  const model = buildRowModel({
    rows: [rows[1]!, rows[0]!],
    columns,
    rowModelType: "server",
    serverRowCount: 25,
    state: {
      aggregation: [{ columnId: "age", function: "sum" }],
    },
  });

  assert.equal(model.totalRowCount, 25);
  assert.deepEqual(model.aggregation, [
    { columnId: "age", function: "sum", label: "Sum", value: 55, rowCount: 2, valueCount: 2 },
  ]);
});

test("buildRowModel creates grouped display rows without changing visible data rows", () => {
  const model = buildRowModel({
    rows,
    columns,
    state: {
      rowGrouping: { columnIds: ["city"] },
      pagination: { pageIndex: 0, pageSize: 4 },
    },
    getRowId: (row) => row.id,
  });

  assert.deepEqual(
    model.visibleRows.map((row) => row.id),
    ["a", "b", "c", "d"],
  );
  assert.deepEqual(
    model.displayRows.map((row) => isRowGroupNode(row) ? `${row.label}:${row.rowCount}` : row.id),
    ["Seoul:2", "a", "c", "Busan:1", "b", "Daegu:1", "d"],
  );
});

test("row grouping supports collapsed groups and unknown columns", () => {
  const model = buildRowModel({
    rows,
    columns,
    state: {
      rowGrouping: {
        columnIds: ["unknown", "city"],
        collapsedGroupIds: ["group:city:Seoul"],
      },
    },
    getRowId: (row) => row.id,
  });

  assert.deepEqual(
    model.displayRows.map((row) => isRowGroupNode(row) ? `${row.label}:${row.expanded}` : row.id),
    ["Seoul:false", "Busan:true", "b", "Daegu:true", "d"],
  );
});

test("applyRowGrouping supports nested groups", () => {
  const model = buildRowModel({ rows, columns, getRowId: (row) => row.id });
  const groupedRows = applyRowGrouping(model.visibleRows, model.columns, {
    columnIds: ["city", "profile.tier"],
  });

  assert.deepEqual(
    groupedRows.map((row) => isRowGroupNode(row) ? `${row.depth}:${row.label}:${row.rowCount}` : row.id),
    ["0:Seoul:2", "1:gold:1", "a", "1:bronze:1", "c", "0:Busan:1", "1:silver:1", "b", "0:Daegu:1", "1:gold:1", "d"],
  );
});

test("row grouping state helpers keep collapsed ids serializable", () => {
  let state: GridState = {};

  state = setRowGrouping(state, { columnIds: ["city"] });
  assert.deepEqual(state.rowGrouping, { columnIds: ["city"], collapsedGroupIds: undefined });

  state = toggleRowGroupExpanded(state, "group:city:Seoul");
  assert.deepEqual(state.rowGrouping, {
    columnIds: ["city"],
    collapsedGroupIds: ["group:city:Seoul"],
  });

  state = toggleRowGroupExpanded(state, "group:city:Seoul");
  assert.deepEqual(state.rowGrouping, { columnIds: ["city"], collapsedGroupIds: undefined });

  const cloned = createGridState({
    rowGrouping: { columnIds: ["city"], collapsedGroupIds: ["group:city:Seoul"] },
  });

  cloned.rowGrouping?.collapsedGroupIds?.push("group:city:Busan");

  assert.deepEqual(
    createGridState({
      rowGrouping: { columnIds: ["city"], collapsedGroupIds: ["group:city:Seoul"] },
    }).rowGrouping?.collapsedGroupIds,
    ["group:city:Seoul"],
  );
});

type TreeRow = {
  id: string;
  parentId?: string;
  name: string;
};

const treeRows: TreeRow[] = [
  { id: "root", name: "Root" },
  { id: "child", parentId: "root", name: "Child" },
  { id: "grandchild", parentId: "child", name: "Grandchild" },
  { id: "sibling", name: "Sibling" },
];

const treeColumns: ColumnDef<TreeRow>[] = [{ field: "name" }];

test("tree data keeps rows collapsed until expanded", () => {
  const collapsed = buildRowModel({
    rows: treeRows,
    columns: treeColumns,
    state: {},
    treeData: true,
    getRowId: (row) => row.id,
    getParentRowId: (row) => row.parentId,
  });

  assert.deepEqual(collapsed.displayRows.map((row) => row.id), ["root", "sibling"]);
  assert.equal(collapsed.displayRows[0]?.depth, 0);
  assert.equal(collapsed.displayRows[0]?.hasChildren, true);
  assert.equal(collapsed.displayRows[0]?.expanded, false);

  const expandedRoot = buildRowModel({
    rows: treeRows,
    columns: treeColumns,
    state: { treeData: { expandedRowIds: ["root"] } },
    treeData: true,
    getRowId: (row) => row.id,
    getParentRowId: (row) => row.parentId,
  });

  assert.deepEqual(expandedRoot.displayRows.map((row) => row.id), ["root", "child", "sibling"]);
  assert.equal(expandedRoot.displayRows[1]?.depth, 1);
  assert.equal(expandedRoot.displayRows[1]?.hasChildren, true);
  assert.equal(expandedRoot.displayRows[1]?.expanded, false);

  const expandedNested = buildRowModel({
    rows: treeRows,
    columns: treeColumns,
    state: { treeData: { expandedRowIds: ["root", "child"] } },
    treeData: true,
    getRowId: (row) => row.id,
    getParentRowId: (row) => row.parentId,
  });

  assert.deepEqual(
    expandedNested.displayRows.map((row) => row.id),
    ["root", "child", "grandchild", "sibling"],
  );
  assert.equal(expandedNested.displayRows[2]?.depth, 2);
});

test("tree data state helpers keep expanded ids serializable", () => {
  let state: GridState = {};

  state = setTreeExpandedRows(state, ["root"]);
  assert.deepEqual(state.treeData, { expandedRowIds: ["root"] });

  state = toggleTreeRowExpanded(state, "child");
  assert.deepEqual(state.treeData?.expandedRowIds, ["root", "child"]);

  state = toggleTreeRowExpanded(state, "root");
  assert.deepEqual(state.treeData?.expandedRowIds, ["child"]);

  const cloned = createGridState({ treeData: { expandedRowIds: ["root"] } });
  cloned.treeData?.expandedRowIds?.push("child");

  assert.deepEqual(
    createGridState({ treeData: { expandedRowIds: ["root"] } }).treeData?.expandedRowIds,
    ["root"],
  );
});

test("applyAggregation ignores unknown columns and empty numeric values", () => {
  const model = buildRowModel({ rows, columns });

  assert.deepEqual(
    applyAggregation(model.allRows, model.columns, [
      { columnId: "unknown", function: "sum" },
      { columnId: "name", function: "avg" },
    ]),
    [
      {
        columnId: "name",
        function: "avg",
        label: "Avg",
        value: undefined,
        rowCount: 4,
        valueCount: 0,
      },
    ],
  );
});

test("state helpers update serializable state", () => {
  let state = toggleSort({}, "age");
  assert.deepEqual(state.sort, [{ columnId: "age", direction: "asc" }]);

  state = toggleSort(state, "age");
  assert.deepEqual(state.sort, [{ columnId: "age", direction: "desc" }]);

  state = setPagination(state, { pageIndex: 3, pageSize: 50 });
  state = setFilter(state, { columnId: "name", operator: "contains", value: "k" });

  assert.equal(state.pagination?.pageIndex, 0);
  assert.equal(state.filters?.length, 1);

  state = clearFilter(state, "name");
  assert.deepEqual(state.filters, []);
});

test("aggregation state helper keeps rules serializable", () => {
  let state: GridState = {
    remoteCache: { key: "trades", version: 1, stale: false },
  };

  state = setAggregation(state, [
    { columnId: "age", function: "sum" },
    { columnId: "name", function: "count", label: "Rows" },
  ]);

  assert.deepEqual(state.aggregation, [
    { columnId: "age", function: "sum" },
    { columnId: "name", function: "count", label: "Rows" },
  ]);
  assert.equal(state.remoteCache?.stale, true);

  const cloned = createGridState(state);
  cloned.aggregation?.push({ columnId: "city", function: "count" });

  assert.equal(state.aggregation?.length, 2);
});

test("cursor pagination helpers keep cursor state serializable", () => {
  let state: GridState = {};

  state = setCursorPagination(state, {
    cursor: "page-2",
    pageSize: 0,
    previousCursor: "page-1",
    nextCursor: "page-3",
    hasPreviousPage: true,
    hasNextPage: true,
  });

  assert.deepEqual(state.cursorPagination, {
    cursor: "page-2",
    pageSize: 1,
    previousCursor: "page-1",
    nextCursor: "page-3",
    hasPreviousPage: true,
    hasNextPage: true,
  });

  state = setCursorPage(state, "page-3");
  assert.equal(state.cursorPagination?.cursor, "page-3");

  state = setCursorPageSize(state, 25);
  assert.equal(state.cursorPagination?.cursor, undefined);
  assert.equal(state.cursorPagination?.pageSize, 25);

  state = setFilter(state, { columnId: "name", operator: "contains", value: "kim" });
  assert.equal(state.cursorPagination?.cursor, undefined);
});

test("remote request helpers ignore stale responses", () => {
  let state: GridState = {};

  state = startRemoteRequest(state, "req-1");
  assert.equal(state.remoteRequest?.requestId, "req-1");
  assert.equal(state.remoteRequest?.sequence, 1);
  assert.equal(state.remoteRequest?.status, "loading");
  assert.equal(isActiveRemoteRequest(state, "req-1"), true);

  state = startRemoteRequest(state, "req-2");
  assert.equal(state.remoteRequest?.requestId, "req-2");
  assert.equal(state.remoteRequest?.sequence, 2);
  assert.equal(isActiveRemoteRequest(state, "req-1"), false);

  const staleFinished = finishRemoteRequest(state, "req-1");
  assert.equal(staleFinished, state);

  state = failRemoteRequest(state, "req-2", "network");
  assert.equal(state.remoteRequest?.status, "error");
  assert.equal(state.remoteRequest?.error, "network");

  state = startRemoteRequest(state, "req-3");
  state = cancelRemoteRequest(state);
  assert.equal(state.remoteRequest?.status, "cancelled");
  assert.equal(isActiveRemoteRequest(state, "req-3"), false);
});

test("remote cache helpers track keys, versions, and stale state", () => {
  let state: GridState = {
    filters: [{ columnId: "city", operator: "equals", value: "Seoul" }],
    pagination: { pageIndex: 2, pageSize: 25 },
  };
  const key = createRemoteCacheKey(state);

  assert.equal(
    key,
    createRemoteCacheKey({
      ...state,
      remoteRequest: { requestId: "req-1", sequence: 1, status: "loading" },
      remoteCache: { key: "other", version: 3, stale: true },
      selectedRowIds: ["a"],
    }),
  );

  state = setRemoteCache(state, {
    key,
    version: -2,
    invalidatedKeys: [key, key],
  });

  assert.deepEqual(state.remoteCache, {
    key,
    version: 0,
    invalidatedKeys: [key],
  });

  state = invalidateRemoteCache(state, key);

  assert.equal(state.remoteCache?.version, 1);
  assert.equal(state.remoteCache?.stale, true);
  assert.deepEqual(state.remoteCache?.invalidatedKeys, [key]);

  state = acknowledgeRemoteCache(state, key);

  assert.equal(state.remoteCache?.key, key);
  assert.equal(state.remoteCache?.version, 1);
  assert.equal(state.remoteCache?.stale, false);
  assert.equal(state.remoteCache?.invalidatedKeys, undefined);
});

test("query state helpers mark remote cache stale without storing rows", () => {
  const cacheKey = "trades:page-3";
  let state: GridState = {
    pagination: { pageIndex: 3, pageSize: 50 },
    cursorPagination: { cursor: "page-3", pageSize: 50 },
    remoteCache: { key: cacheKey, version: 4, stale: false },
  };

  state = setFilter(state, { columnId: "name", operator: "contains", value: "kim" });

  assert.equal(state.pagination?.pageIndex, 0);
  assert.equal(state.cursorPagination?.cursor, undefined);
  assert.deepEqual(state.remoteCache, {
    key: cacheKey,
    version: 4,
    stale: true,
  });

  const originalState: GridState = {
    remoteCache: { key: cacheKey, version: 4, invalidatedKeys: ["a"] },
  };
  const cloned = createGridState(originalState);

  cloned.remoteCache?.invalidatedKeys?.push("b");

  assert.deepEqual(originalState.remoteCache?.invalidatedKeys, ["a"]);
});

test("sort helpers set and clear deterministic sort rules", () => {
  let state: GridState = {
    sort: [{ columnId: "name", direction: "desc" }],
  };

  state = setSort(state, "age", "asc");
  assert.deepEqual(state.sort, [{ columnId: "age", direction: "asc" }]);

  state = setSort(state, "city", "desc", { multi: true });
  assert.deepEqual(state.sort, [
    { columnId: "age", direction: "asc" },
    { columnId: "city", direction: "desc" },
  ]);

  state = clearSort(state, "age");
  assert.deepEqual(state.sort, [{ columnId: "city", direction: "desc" }]);
});

test("column state controls visibility, order, and width", () => {
  let state: GridState = {};
  state = setColumnHidden(state, "city", true);
  state = setColumnWidth(state, "age", 12);
  state = setColumnPinned(state, "name", "left");
  state = setColumnOrder(state, ["age", "name", "city", "profile.tier"]);

  const model = buildRowModel({
    rows,
    columns,
    state,
  });

  assert.equal(model.columns[0]?.id, "age");
  assert.equal(model.columns[0]?.width, 24);
  assert.equal(model.columns[1]?.pinned, "left");
  assert.deepEqual(
    model.visibleColumns.map((column) => column.id),
    ["age", "name", "profile.tier"],
  );
});

test("selection helpers keep selected row ids serializable", () => {
  let state: GridState = {};
  state = setRowSelected(state, "a", true);
  state = setRowSelected(state, "b", true);
  state = setRowSelected(state, "a", false);

  assert.deepEqual(state.selectedRowIds, ["b"]);

  state = clearSelection(state);

  assert.deepEqual(state.selectedRowIds, []);
});

test("getVirtualRange returns overscanned fixed-size items", () => {
  const range = getVirtualRange({
    itemCount: 100,
    itemSize: 32,
    viewportSize: 96,
    scrollOffset: 320,
    overscan: 2,
  });

  assert.equal(range.totalSize, 3200);
  assert.equal(range.startIndex, 8);
  assert.equal(range.endIndex, 14);
  assert.equal(range.beforeSize, 256);
  assert.equal(range.items.length, 7);
  assert.deepEqual(range.items[0], { index: 8, start: 256, size: 32, end: 288 });
});

test("getInfiniteScrollTrigger detects end-of-loaded-rows threshold", () => {
  assert.deepEqual(
    getInfiniteScrollTrigger({
      rowCount: 100,
      lastVisibleRowIndex: 74,
      threshold: 20,
    }),
    {
      shouldLoadMore: false,
      rowCount: 100,
      lastVisibleRowIndex: 74,
      threshold: 20,
      remainingRows: 25,
    },
  );

  assert.deepEqual(
    getInfiniteScrollTrigger({
      rowCount: 100,
      lastVisibleRowIndex: 80,
      threshold: 20,
    }),
    {
      shouldLoadMore: true,
      rowCount: 100,
      lastVisibleRowIndex: 80,
      threshold: 20,
      remainingRows: 19,
    },
  );

  assert.equal(
    getInfiniteScrollTrigger({
      rowCount: 100,
      lastVisibleRowIndex: 99,
      hasMoreRows: false,
    }).shouldLoadMore,
    false,
  );

  assert.equal(
    getInfiniteScrollTrigger({
      rowCount: 100,
      lastVisibleRowIndex: 99,
      loading: true,
    }).shouldLoadMore,
    false,
  );

  assert.deepEqual(
    getInfiniteScrollTrigger({
      rowCount: 0,
      lastVisibleRowIndex: 10,
    }),
    {
      shouldLoadMore: false,
      rowCount: 0,
      lastVisibleRowIndex: -1,
      threshold: 20,
      remainingRows: 0,
    },
  );
});

test("clipboard utilities serialize and parse TSV ranges", () => {
  const model = buildRowModel({
    rows,
    columns,
    getRowId: (row) => row.id,
  });
  const range = {
    anchor: { rowIndex: 1, columnIndex: 2 },
    focus: { rowIndex: 0, columnIndex: 0 },
  };

  assert.deepEqual(normalizeCellRange(range), {
    startRowIndex: 0,
    endRowIndex: 1,
    startColumnIndex: 0,
    endColumnIndex: 2,
  });
  assert.equal(isCellInRange(1, 1, range), true);
  assert.equal(isCellInRange(2, 1, range), false);

  const serialized = serializeGridRange({
    rows: model.visibleRows,
    columns: model.visibleColumns,
    range,
  });

  assert.equal(serialized, "Kim\t35\tSeoul\nLee\t20\tBusan");
  assert.deepEqual(parseClipboardText("A\tB\r\nC\\tD\tE\\nF\n"), [["A", "B"], ["C\tD", "E\nF"]]);
  assert.deepEqual(
    getClipboardPasteCells({
      values: [["X"]],
      startCell: { rowIndex: 1, columnIndex: 1 },
      rowCount: 4,
      columnCount: 4,
      fillRange: normalizeCellRange({
        anchor: { rowIndex: 1, columnIndex: 1 },
        focus: { rowIndex: 2, columnIndex: 2 },
      }),
    }),
    [
      { rowIndex: 1, columnIndex: 1, value: "X" },
      { rowIndex: 1, columnIndex: 2, value: "X" },
      { rowIndex: 2, columnIndex: 1, value: "X" },
      { rowIndex: 2, columnIndex: 2, value: "X" },
    ],
  );
});

test("value history tracks undo and redo entries", () => {
  let state = createValueHistoryState();

  state = pushValueHistoryEntry(
    state,
    {
      changes: [
        {
          rowId: "a",
          rowIndex: 0,
          columnId: "name",
          previousValue: "Kim",
          value: "Kang",
        },
      ],
    },
    { maxEntries: 1 },
  );
  state = pushValueHistoryEntry(
    state,
    {
      changes: [
        {
          rowId: "b",
          rowIndex: 1,
          columnId: "city",
          previousValue: "Busan",
          value: "Seoul",
        },
      ],
    },
    { maxEntries: 1 },
  );

  assert.equal(state.undoStack.length, 1);
  assert.equal(state.redoStack.length, 0);

  const undo = undoValueHistory(state);

  assert.equal(undo.entry?.changes[0]?.rowId, "b");
  assert.equal(undo.state.undoStack.length, 0);
  assert.equal(undo.state.redoStack.length, 1);
  assert.deepEqual(invertValueHistoryEntry(undo.entry!), {
    changes: [
      {
        rowId: "b",
        rowIndex: 1,
        columnId: "city",
        previousValue: "Seoul",
        value: "Busan",
      },
    ],
  });

  const redo = redoValueHistory(undo.state);

  assert.equal(redo.entry?.changes[0]?.value, "Seoul");
  assert.equal(redo.state.undoStack.length, 1);
  assert.equal(redo.state.redoStack.length, 0);
});

test("fill handle utilities calculate target ranges and repeated cells", () => {
  const sourceRange = {
    startRowIndex: 0,
    endRowIndex: 1,
    startColumnIndex: 0,
    endColumnIndex: 1,
  };

  assert.deepEqual(
    getFillHandleTargetRange({
      sourceRange,
      targetCell: { rowIndex: 3, columnIndex: 0 },
      rowCount: 5,
      columnCount: 4,
    }),
    {
      startRowIndex: 2,
      endRowIndex: 3,
      startColumnIndex: 0,
      endColumnIndex: 1,
    },
  );
  assert.deepEqual(
    getFillHandleTargetRange({
      sourceRange,
      targetCell: { rowIndex: 0, columnIndex: 3 },
      rowCount: 5,
      columnCount: 4,
    }),
    {
      startRowIndex: 0,
      endRowIndex: 1,
      startColumnIndex: 2,
      endColumnIndex: 3,
    },
  );
  assert.equal(
    getFillHandleTargetRange({
      sourceRange,
      targetCell: { rowIndex: 1, columnIndex: 1 },
      rowCount: 5,
      columnCount: 4,
    }),
    undefined,
  );

  assert.deepEqual(
    getFillHandleCells({
      sourceRange,
      targetRange: {
        startRowIndex: 2,
        endRowIndex: 3,
        startColumnIndex: 0,
        endColumnIndex: 1,
      },
      getValue: ({ rowIndex, columnIndex }) => `${rowIndex}:${columnIndex}`,
    }),
    [
      { rowIndex: 2, columnIndex: 0, sourceRowIndex: 0, sourceColumnIndex: 0, value: "0:0" },
      { rowIndex: 2, columnIndex: 1, sourceRowIndex: 0, sourceColumnIndex: 1, value: "0:1" },
      { rowIndex: 3, columnIndex: 0, sourceRowIndex: 1, sourceColumnIndex: 0, value: "1:0" },
      { rowIndex: 3, columnIndex: 1, sourceRowIndex: 1, sourceColumnIndex: 1, value: "1:1" },
    ],
  );
});

test("CSV export serializes visible rows and columns", () => {
  const model = buildRowModel({
    rows: [
      { id: "e", name: "Kim, \"A\"", age: 41, city: "Seoul\nGangnam", profile: { tier: "gold" } },
      { id: "f", name: "Han", age: 31, city: "Incheon", profile: { tier: "silver" } },
    ],
    columns: [
      { field: "name" },
      { field: "age", valueFormatter: (value) => `${value} years` },
      { field: "city" },
    ],
    getRowId: (row) => row.id,
  });

  assert.equal(
    exportGridCsv({
      rows: model.visibleRows,
      columns: model.visibleColumns,
    }),
    'name,age,city\n"Kim, ""A""",41 years,"Seoul\nGangnam"\nHan,31 years,Incheon',
  );
  assert.equal(
    exportGridCsv({
      rows: model.visibleRows,
      columns: model.visibleColumns,
      includeHeaders: false,
      delimiter: ";",
      formatCell: ({ value }) => value,
    }),
    '"Kim, ""A""";41;"Seoul\nGangnam"\nHan;31;Incheon',
  );
});

test("duplicate column ids fail fast", () => {
  assert.throws(() => {
    buildRowModel({
      rows,
      columns: [{ field: "name" }, { field: "name" }],
    });
  }, /Duplicate grid column id/);
});
