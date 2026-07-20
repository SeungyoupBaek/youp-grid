# Youp Grid

[![npm core](https://img.shields.io/npm/v/@youp-grid/core?label=@youp-grid/core&cacheSeconds=300)](https://www.npmjs.com/package/@youp-grid/core)
[![npm react](https://img.shields.io/npm/v/@youp-grid/react?label=@youp-grid/react&cacheSeconds=300)](https://www.npmjs.com/package/@youp-grid/react)
[![npm vue](https://img.shields.io/npm/v/@youp-grid/vue?label=@youp-grid/vue&cacheSeconds=300)](https://www.npmjs.com/package/@youp-grid/vue)
[![npm vanilla](https://img.shields.io/npm/v/@youp-grid/vanilla?label=@youp-grid/vanilla&cacheSeconds=300)](https://www.npmjs.com/package/@youp-grid/vanilla)
[![npm formula](https://img.shields.io/npm/v/@youp-grid/formula?label=@youp-grid/formula&cacheSeconds=300)](https://www.npmjs.com/package/@youp-grid/formula)
[![npm charts](https://img.shields.io/npm/v/@youp-grid/charts-echarts?label=@youp-grid/charts-echarts&cacheSeconds=300)](https://www.npmjs.com/package/@youp-grid/charts-echarts)

Framework-agnostic TypeScript data grid with React, Vue, and Vanilla adapters plus optional pivot, formula, and chart integrations.

Youp Grid is an MIT-licensed open-source project maintained in public on GitHub.

Try the live demo at [seungyoupbaek.github.io/youp-grid](https://seungyoupbaek.github.io/youp-grid/).

This repository includes a reusable engine, React and Vue UI adapters, a small Vanilla DOM adapter, and optional analytics packages:

- column normalization
- typed row model generation
- sorting
- filtering
- pagination
- fixed and variable-size virtualization range calculation
- cancellable server data source, block cache, and retry controller
- serializable grid state helpers
- pivot tables with dynamic columns, totals, date buckets, collapse, and drilldown
- spreadsheet formulas with computed columns, dependency tracking, and cycle detection
- chart datasets plus an optional ECharts renderer
- reusable React editing, selection, tooltip, and row operation UI
- reusable React CSV/TSV import callbacks and CSV/Excel export toolbar actions
- reusable Vue 3 component and composable for grid editing, state, and row-model integration
- reusable Vanilla DOM renderer for framework-free screens

The first goal is not to copy every AG Grid feature. The goal is to keep reusable grid behavior small and stable so application screens can adopt it incrementally.

## Packages

| Package | Purpose |
| --- | --- |
| `@youp-grid/core` | Framework-agnostic grid state, row model, sorting, filtering, pagination, selection, tree data, and data helpers. |
| `@youp-grid/formula` | Optional spreadsheet formula engine with A1 ranges, structured references, custom functions, and cycle detection. |
| `@youp-grid/charts-echarts` | Optional Apache ECharts renderer for grid, selection, and pivot chart datasets. |
| `@youp-grid/react` | React adapter, virtualized grid UI, inline editing, keyboard behavior, row actions, tooltips, and bundled styles. |
| `@youp-grid/vue` | Vue 3 adapter with a basic editable grid component plus reactive state, row model, sorting, filtering, pagination, selection, grouping, and tree helpers. |
| `@youp-grid/vanilla` | Vanilla DOM adapter for framework-free rendering with the core row model. |

## Installation

```sh
npm install @youp-grid/core @youp-grid/react
```

```tsx
import { YoupGrid } from "@youp-grid/react";
import "@youp-grid/react/styles.css";
```

```sh
npm install @youp-grid/core @youp-grid/vue
```

```ts
import { YoupGrid, useYoupGrid } from "@youp-grid/vue";
import "@youp-grid/vue/styles.css";
```

```sh
npm install @youp-grid/core @youp-grid/vanilla
```

```ts
import { createYoupGrid } from "@youp-grid/vanilla";
import "@youp-grid/vanilla/styles.css";
```

Install the optional formula and ECharts integrations only when the application needs them:

```sh
npm install @youp-grid/formula @youp-grid/charts-echarts echarts
```

## Core API

```ts
import {
  buildRowModel,
  normalizeColumns,
  getVirtualRange,
  type ColumnDef,
  type GridState,
} from "@youp-grid/core";

type User = {
  id: string;
  name: string;
  age: number;
};

const columns: ColumnDef<User>[] = [
  { field: "name", headerName: "Name" },
  { field: "age", headerName: "Age", editor: "number" },
];

const state: GridState = {
  sort: [{ columnId: "age", direction: "desc" }],
  filters: [{ columnId: "name", operator: "contains", value: "kim" }],
  pagination: { pageIndex: 0, pageSize: 20 },
};

const model = buildRowModel({
  rows,
  columns,
  state,
  getRowId: (row) => row.id,
});
```

## React Usage

```tsx
import type { ColumnDef } from "@youp-grid/core";
import { YoupGrid } from "@youp-grid/react";
import "@youp-grid/react/styles.css";

type SqlColumn = {
  id: string;
  logicalName: string;
  physicalName: string;
  length: number | "";
  nullable: boolean;
};

const columns: ColumnDef<SqlColumn>[] = [
  { field: "logicalName", headerName: "Logical", editable: true, editor: "text" },
  { field: "physicalName", headerName: "Physical", editable: true, placeholder: "Auto suggestion" },
  { field: "length", headerName: "Length", editable: true, editor: "number", align: "right" },
  { field: "nullable", headerName: "Nullable", editable: true, editor: "checkbox", align: "center" },
];

<YoupGrid
  rows={rows}
  columns={columns}
  getRowId={(row) => row.id}
  editable={canEdit}
  readOnly={!canEdit}
  showRowNumberColumn
  showCellContextMenu
  cellTooltip={{ mode: "rich", autoOpenCellKey }}
  onCellEditCommit={({ rowId, columnId, value, reason }) => {
    // Commit reason is "enter", "tab", or "blur".
  }}
  onCellValueChange={({ rowId, columnId, value }) => {
    // Keep row data controlled in the application.
  }}
  createRow={() => ({
    id: crypto.randomUUID(),
    logicalName: "",
    physicalName: "",
    length: "",
    nullable: true,
  })}
  onRowsChange={({ rows }) => setRows(rows)}
/>;
```

## Pivot, Formula, and Chart Usage

```tsx
import type { ColumnDef, GridState } from "@youp-grid/core";
import { createFormulaEngine } from "@youp-grid/formula";
import { createEChartsRenderer } from "@youp-grid/charts-echarts";
import { YoupGrid } from "@youp-grid/react";

const columns: ColumnDef<Trade>[] = [
  { field: "desk", headerName: "Desk" },
  { field: "quantity", headerName: "Quantity", editor: "number" },
  { field: "price", headerName: "Price", editor: "number" },
  { id: "notional", headerName: "Notional", formula: "=[quantity]*[price]" },
];

const state: GridState = {
  pivot: {
    enabled: true,
    rows: [{ columnId: "desk" }],
    values: [{ columnId: "notional", function: "sum" }],
    rowTotals: "after",
  },
};

const formulaEngine = createFormulaEngine();
const chartRenderer = createEChartsRenderer({ renderer: "canvas" });

<YoupGrid
  rows={rows}
  columns={columns}
  state={state}
  getRowId={(row) => row.id}
  formulaEngine={formulaEngine}
  showPivotPanel
  showChartPanel
  chartRenderer={chartRenderer}
/>;
```

Charts can use filtered rows, the selected cell range, or pivot results. The React chart panel supports bar, line, area, pie, and scatter charts with aggregation, stacking, dual axes, legends, and PNG export. See [docs/API.md](docs/API.md) for the shared contracts and server-side pivot model.

## Vue Usage

```vue
<script setup lang="ts">
import type { ColumnDef, GridState } from "@youp-grid/core";
import { ref } from "vue";
import { YoupGrid } from "@youp-grid/vue";
import "@youp-grid/vue/styles.css";

type User = {
  id: string;
  name: string;
  age: number;
};

const rows = ref<User[]>([]);
const state = ref<GridState>({});

const columns: ColumnDef<User>[] = [
  { field: "name", headerName: "Name" },
  { field: "age", headerName: "Age", editor: "number" },
];

function handleStateChange({ state: nextState }: { state: GridState }) {
  state.value = nextState;
}

function handleRowsChange({ rows: nextRows }: { rows: User[] }) {
  rows.value = nextRows;
}
</script>

<template>
  <YoupGrid
    :rows="rows"
    :columns="columns"
    :state="state"
    :get-row-id="(row) => row.id"
    :show-row-number-column="true"
    :show-row-selection-column="true"
    :pin-row-selection-column="true"
    :show-cell-context-menu="true"
    :cell-meta="{ '1:name': { status: 'warning', message: 'Check spelling' } }"
    :cell-tooltip="{ mode: 'rich', autoOpenCellKey: '1:name' }"
    :pagination="{ pageSizeOptions: [10, 20, 50] }"
    @state-change="handleStateChange"
    @rows-change="handleRowsChange"
  />
</template>
```

The Vue adapter includes basic `text`, `number`, `select`, and `checkbox` editing with row number and selection columns, keyboard cell focus and range selection, a cell context menu for copy, paste, clear contents, row selection, row copy/paste, row insert/delete, and auto-size, `cell-edit-commit`, `cell-value-change`, `cells-value-change`, `rows-change`, cell metadata, native/rich cell tooltips, and pagination footer controls. Row insert, row paste, and TSV paste auto-append require `createRow`; pasted rows keep newly created row IDs while copying field-backed column values.

## Current Boundary

Implemented now:

- core package
- React adapter package
- Vue adapter package
- Vanilla DOM adapter package
- row, column, and selection state helpers
- grid state persistence helpers
- fixed-height and master-detail virtualized React body renderers
- opt-in center-column virtualization and variable row heights
- synchronous/asynchronous validation with save rollback events
- imperative React/Vue Grid API and locale text overrides
- built-in header filters
- advanced filter operator UI
- pagination controls
- column resize handles and double-click auto-size
- size columns to fit helper and toolbar action
- column drag reorder within the same pin group
- column chooser with visibility controls
- column chooser search and presets
- column menu for sort, pin, order, reset order, hide, and filter actions
- grouped headers
- density control
- checkbox selection column
- row number column
- cell context menu for copy, paste, clear, row selection, row copy/paste, row insert/delete, and auto-size
- row click and double-click events
- custom cell and header renderers
- pinned left/right columns
- keyboard cell navigation and selection
- inline cell editing
- edit commit events with enter, tab, and blur reasons
- text, number, checkbox, and select editors
- date and datetime editors
- custom React editor render prop and Vue editor slots
- cell placeholders and column alignment
- cell status metadata with native or rich tooltips
- read-only and per-cell edit guards
- range selection
- TSV clipboard copy/paste
- TSV paste auto-appends missing rows with `createRow`
- fill handle for repeated cell values
- undo/redo for cell value changes
- CSV and Excel export
- delimited CSV/TSV import helper
- loading and error overlays
- server-side row model contract
- cursor pagination adapter
- infinite scrolling contract
- request cancellation contract
- cache invalidation contract
- remote block loading, status, retry, and cancellation controller
- aggregation
- pivot rows, dynamic columns, date buckets, totals, collapse, and drilldown
- optional spreadsheet formula engine with computed columns and cycle detection
- selection, filtered-row, and pivot chart datasets
- optional ECharts renderer with bar, line, area, pie, and scatter charts
- row grouping
- tree data
- expandable master-detail rows
- pinned top and bottom rows
- controlled row drag reorder
- Vanilla state, selection, focus, range, scrolling, and export API
- basic editable Vue grid component
- Vue cell metadata and native/rich cell tooltips
- Vite React demo
- GitHub Pages live demo
- Playwright interaction smoke test
- accessibility and visual smoke tests
- React/Vue adapter parity check script
- static HTML preview
- npm package publishing setup

## Development

```sh
npm install
npm test
npm run test:smoke
npm run build
npm run pack:dry-run
npm run release:check
```

## Project Maintenance

- Issues and feature requests are tracked in GitHub Issues.
- Pull requests should include focused changes and a short validation note.
- Releases follow semantic versioning while the public API stabilizes.
- Security reports should follow [SECURITY.md](SECURITY.md).

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased implementation plan.
See [docs/REACT_ADAPTER.md](docs/REACT_ADAPTER.md) for React usage.
See [docs/EXAMPLES.md](docs/EXAMPLES.md) for local demo and smoke test usage.
See [docs/RELEASE.md](docs/RELEASE.md) for the release checklist.
See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and contribution rules.

## License

MIT. See [LICENSE](LICENSE).
