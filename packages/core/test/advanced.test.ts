import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGridChartDataset,
  buildRowModel,
  getPivotDisplayRows,
  getPivotDrilldownRows,
  togglePivotRowExpanded,
  type ColumnDef,
  type GridState,
} from "../src/index.ts";

type Trade = {
  id: string;
  desk: string;
  status: string;
  settlement: string;
  quantity: number;
};

const rows: Trade[] = [
  { id: "1", desk: "Equity", status: "Open", settlement: "2026-01-03", quantity: 10 },
  { id: "2", desk: "Equity", status: "Filled", settlement: "2026-02-04", quantity: 20 },
  { id: "3", desk: "Rates", status: "Open", settlement: "2026-04-05", quantity: 30 },
];
const columns: ColumnDef<Trade>[] = [
  { field: "desk", headerName: "Desk" },
  { field: "status", headerName: "Status" },
  { field: "settlement", headerName: "Settlement" },
  { field: "quantity", headerName: "Quantity" },
];

test("pivot builds dynamic columns, subtotals, totals, date buckets, and drilldown", () => {
  const state: GridState = {
    pivot: {
      enabled: true,
      rows: [{ columnId: "desk" }, { columnId: "status" }],
      columns: [{ columnId: "settlement", bucket: "quarter" }],
      values: [{ columnId: "quantity", function: "sum" }],
      rowTotals: "after",
      columnTotals: "after",
    },
  };
  const model = buildRowModel({ rows, columns, state, getRowId: (row) => row.id });
  const pivot = model.pivot;
  assert.ok(pivot);
  assert.deepEqual(pivot.columns.filter((column) => !column.isTotal).map((column) => column.headerName), [
    "2026-Q1",
    "2026-Q2",
  ]);
  assert.equal(pivot.rows.find((row) => row.label === "Equity")?.isSubtotal, true);
  assert.equal(pivot.grandTotalRow?.values[pivot.columns[0].id], 30);
  assert.equal(pivot.grandTotalRow?.values[pivot.columns[1].id], 30);
  assert.equal(pivot.grandTotalRow?.values[pivot.columns[2].id], 60);
  assert.equal(getPivotDisplayRows(pivot).at(-1)?.isGrandTotal, true);

  const equity = pivot.rows.find((row) => row.label === "Equity");
  assert.ok(equity);
  assert.deepEqual(getPivotDrilldownRows({
    rows: model.filteredRows,
    columns: model.columns,
    state: state.pivot!,
    pivotRow: equity,
    pivotColumn: pivot.columns[0],
  }).map((row) => row.id), ["1", "2"]);

  const collapsed = togglePivotRowExpanded(state, equity.id);
  const collapsedModel = buildRowModel({ rows, columns, state: collapsed, getRowId: (row) => row.id });
  assert.equal(collapsedModel.pivot?.rows.some((row) => row.path.length === 2 && row.path[0].label === "Equity"), false);
});

test("pivot honors grand-total placement and server-provided models", () => {
  const local = buildRowModel({
    rows,
    columns,
    getRowId: (row) => row.id,
    state: {
      pivot: {
        enabled: true,
        rows: [{ columnId: "desk" }],
        columns: [],
        values: [{ columnId: "quantity", function: "sum" }],
        columnTotals: "before",
      },
    },
  });
  assert.ok(local.pivot);
  assert.equal(getPivotDisplayRows(local.pivot)[0]?.isGrandTotal, true);

  const serverPivot = { ...local.pivot, warnings: ["calculated by server"] };
  const server = buildRowModel({
    rows: rows.slice(0, 1),
    columns,
    rowModelType: "server",
    serverPivotModel: serverPivot,
  });
  assert.equal(server.pivot, serverPivot);
});

test("chart datasets support selected ranges and pivot results", () => {
  const model = buildRowModel({ rows, columns, getRowId: (row) => row.id });
  const selected = buildGridChartDataset({
    rows: model.filteredRows,
    columns: model.columns,
    selectionRange: { anchor: { rowIndex: 0, columnIndex: 0 }, focus: { rowIndex: 1, columnIndex: 3 } },
    spec: {
      type: "bar",
      source: "selection",
      categoryColumnId: "desk",
      series: [{ columnId: "quantity", aggregation: "sum" }],
    },
  });
  assert.equal(selected.source.length, 1);
  assert.equal(selected.source[0]?.series_0, 30);

  const pivotModel = buildRowModel({
    rows,
    columns,
    getRowId: (row) => row.id,
    state: { pivot: { enabled: true, rows: [{ columnId: "desk" }], columns: [], values: [{ columnId: "quantity", function: "sum" }] } },
  });
  const pivotDataset = buildGridChartDataset({
    rows: pivotModel.filteredRows,
    columns: pivotModel.columns,
    pivot: pivotModel.pivot,
    spec: { type: "pie", source: "pivot", series: [] },
  });
  assert.equal(pivotDataset.source.length, 2);
  assert.equal(pivotDataset.series.length, 2);
});
