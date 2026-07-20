import assert from "node:assert/strict";
import test from "node:test";

import type { ColumnDef, GridChartDataset } from "@youp-grid/core";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { YoupGrid } from "../src/YoupGrid.ts";
import { YoupChartPanel } from "../src/YoupChartPanel.ts";

type Row = {
  id: string;
  name: string;
};

const columns: ColumnDef<Row>[] = [
  { field: "name", headerName: "Name", wrapText: true, autoHeight: true },
];

test("YoupGrid renders locale text and wrapped variable-height rows", () => {
  const html = renderToString(createElement(YoupGrid<Row>, {
    rows: [{ id: "1", name: "A long value" }],
    columns,
    getRowId: (row) => row.id,
    getRowHeight: () => 64,
    localeText: { noRows: "데이터 없음" },
    showColumnChooser: false,
    showCsvExport: false,
    showExcelExport: false,
    showDensityControl: false,
  }));

  assert.match(html, /height:64px/);
  assert.match(html, /youp-grid__cell--wrap-text/);
  assert.match(html, /youp-grid__cell--auto-height/);
});

test("YoupGrid renders localized empty, loading, and error states", () => {
  const baseProps = {
    rows: [] as Row[],
    columns,
    localeText: {
      noRows: "데이터 없음",
      loadingRows: "불러오는 중",
      loadError: "불러오기 실패",
    },
    showColumnChooser: false,
    showCsvExport: false,
    showExcelExport: false,
    showDensityControl: false,
  };

  assert.match(renderToString(createElement(YoupGrid<Row>, baseProps)), /데이터 없음/);
  assert.match(renderToString(createElement(YoupGrid<Row>, { ...baseProps, loading: true })), /불러오는 중/);
  assert.match(renderToString(createElement(YoupGrid<Row>, { ...baseProps, error: true })), /불러오기 실패/);
});

test("YoupChartPanel exposes advanced chart controls", () => {
  const dataset: GridChartDataset = {
    dimensions: ["category", "series_0"],
    source: [{ category: "A", series_0: 1 }],
    categoryKey: "category",
    series: [{ columnId: "value", dataKey: "series_0", label: "Value", axis: "right" }],
    sourceRowCount: 1,
    truncated: false,
  };
  const html = renderToString(createElement(YoupChartPanel, {
    dataset,
    spec: {
      type: "scatter",
      source: "rows",
      categoryColumnId: "name",
      xColumnId: "value",
      series: [{ columnId: "value", aggregation: "sum", axis: "right" }],
      dataLimit: 500,
    },
    columns: [{ id: "name", label: "Name" }, { id: "value", label: "Value" }],
  }));

  assert.match(html, /aria-label="X axis column"/);
  assert.match(html, /aria-label="Aggregation for value"/);
  assert.match(html, /aria-label="Axis for value"/);
  assert.match(html, /aria-label="Chart data limit"/);
  assert.match(html, /value="500"/);
});
