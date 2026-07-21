# Public API

This page documents the shared contracts added after `0.4.4`. Package-specific usage remains in each package README.

## Pivot

`GridState.pivot` defines row dimensions, dynamic column dimensions, date buckets, value aggregations, totals, and collapsed row groups. `buildPivotModel` returns generated columns, grouped headers, subtotal rows, a grand-total row, truncation warnings, and source-row counts. `getPivotDrilldownRows` resolves any result cell back to application-owned rows.

```ts
const state: GridState = {
  pivot: {
    enabled: true,
    rows: [{ columnId: "desk" }],
    columns: [{ columnId: "settlement", bucket: "quarter" }],
    values: [{ columnId: "notional", function: "sum" }],
    rowTotals: "after",
    columnTotals: "after",
  },
};
```

Remote row requests include the same `pivot` object. A server may return a `PivotModel` in `ServerRowsResult.pivot` when aggregation must run against the full remote dataset.

## Formula engine

Install `@youp-grid/formula` and pass `createFormulaEngine()` to the adapter. Formulas support A1 references, ranges, structured references such as `=[quantity]*[price]`, named scalar expressions, custom synchronous functions, dependency tracking, fill-reference shifting, and typed errors. Formula values participate in filtering, sorting, grouping, aggregation, clipboard copy, CSV export, and Excel export.

```ts
import { createFormulaEngine } from "@youp-grid/formula";

const formulaEngine = createFormulaEngine({
  functions: { DOUBLE: (value) => Number(value) * 2 },
});
```

## Charts

`buildGridChartDataset` creates serializable datasets from filtered rows, the selected cell range, or pivot results. It supports bar, line, area, pie, and scatter specs; category grouping; numeric aggregation; stacking; dual axes; and a configurable data limit. The React chart panel exposes these settings along with legend, X-axis, and image-download controls.

```ts
import { createEChartsRenderer } from "@youp-grid/charts-echarts";

const chartRenderer = createEChartsRenderer({ renderer: "canvas" });

<YoupGrid
  showChartPanel
  chartRenderer={chartRenderer}
  defaultChartSpec={{
    type: "bar",
    source: "selection",
    categoryColumnId: "desk",
    series: [{ columnId: "notional", aggregation: "sum" }],
  }}
/>
```

The ECharts adapter registers only the required chart types, components, and canvas/SVG renderers. `mountYoupGridECharts` exposes resize, data-URL export, update, and destroy methods. `createEChartsRenderer` returns a render handle so the React panel can download the current chart as PNG.

Applications that load the chart renderer with `import()` can pass `chartLoading`, `chartError`, and `onChartRetry` to show an accurate loading or recovery state while `chartRenderer` is unavailable.

## Cell validation and asynchronous saving

Columns accept synchronous or asynchronous validators:

```ts
const columns: ColumnDef<Row>[] = [{
  field: "name",
  editable: true,
  validator: async (value) => String(value).trim() ? true : "Name is required",
}];
```

React and Vue accept `onCellValueSave(change, signal)`. The cell displays validating/saving state. A rejected save emits a second `cellValueChange` with `source: "rollback"`, restoring the previous value in controlled application state. Use `onCellValueSaveError` for notifications.

## Grid API

React exposes the API through `apiRef`; Vue exposes the same methods through the component ref:

```ts
type YoupGridApi = {
  getState(): GridState;
  focusCell(cell: { rowIndex: number; columnId?: string; columnIndex?: number }): boolean;
  startEditing(cell: { rowIndex: number; columnId?: string; columnIndex?: number }): boolean;
  scrollToRow(rowIndex: number, align?: "start" | "center" | "end" | "nearest"): boolean;
  selectRange(range: GridCellRange | undefined): void;
  exportCsv(): string;
  exportExcel(): string;
  resetState(): void;
};
```

## Remote rows

`ServerDataSource.getRows(query, signal)` is the standard remote contract. `createServerDataController` adds block caching, duplicate request coalescing, cancellation, block status, and retry:

```ts
const remote = createServerDataController({
  getRows: (query, signal) => fetchRows(query, signal),
}, { blockSize: 100, maxBlocks: 20 });

const result = await remote.load(cacheKey, blockIndex, gridState);
const status = remote.getStatus(cacheKey, blockIndex);
await remote.retry(cacheKey, blockIndex);
```

## Virtualization and row layout

- `getVariableVirtualRange` supports variable row and column sizes.
- React `columnVirtualization` virtualizes unpinned center columns and always renders pinned columns.
- React and Vue `getRowHeight` set per-row heights.
- Column `wrapText` enables wrapping; `autoHeight` marks cells that should stretch to the supplied row height.
- Header groups and master-detail rows intentionally fall back to full column rendering because their colspan layout must remain exact.

## Localization

React, Vue, and Vanilla accept `locale` and `localeText`. `localeText` overrides built-in labels and state messages. Application formatters should use the same `locale` when formatting domain values.

## Vanilla API

`createYoupGrid` now returns state, selection, focus, scrolling, range, export, and reset methods. It also supports loading/error text, row selection, per-row height, wrapped cells, and locale text.
