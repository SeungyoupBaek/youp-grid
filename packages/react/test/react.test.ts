import assert from "node:assert/strict";
import test from "node:test";

import type { ColumnDef } from "@youp-grid/core";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { YoupGrid } from "../src/YoupGrid.ts";

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
