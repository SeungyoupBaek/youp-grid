# @youp-grid/vue

Vue 3 adapter for Youp Grid.

This package exposes a basic editable `YoupGrid` component and `useYoupGrid`, a Vue composable that connects reactive Vue state to the framework-agnostic `@youp-grid/core` row model and state helpers.

## Installation

```sh
npm install @youp-grid/core @youp-grid/vue
```

## Usage

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
    :pagination="{ pageSizeOptions: [10, 20, 50] }"
    @state-change="handleStateChange"
    @rows-change="handleRowsChange"
  />
</template>
```

## Editing

The component supports `text`, `number`, `select`, `combobox`, `tags`, `date`, `datetime`, and `checkbox` editors.

```ts
const columns: ColumnDef<User>[] = [
  { field: "name", headerName: "Name", editor: "text" },
  { field: "age", headerName: "Age", editor: "number" },
  { field: "role", headerName: "Role", editor: "select", options: ["Admin", "User"] },
];
```

Use `editable`, `readOnly`, or `canEditCell` to guard editing. `cell-edit-commit` reports the commit reason as `"enter"`, `"tab"`, or `"blur"`; `cell-value-change` and `cells-value-change` report committed edits, paste, and fill-style batches.

Use the `editor` or `editor-{columnId}` slot to provide a custom editor for a specific column while keeping the built-in editors as the default.

## Row Number and Selection Columns

Enable Excel-style row numbers and checkbox row selection with `showRowNumberColumn` and `showRowSelectionColumn`. `pinRowSelectionColumn` keeps the selection column aligned while horizontally scrolling.

Cells support keyboard focus with `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, and `Tab`. Hold `Shift` while using arrow, Home, or End navigation to extend the active cell range. Press `Space` on a focused cell to toggle the row selection state.

## Pagination Footer

Enable the standard footer with `pagination`. The footer uses the core `state.pagination` model, emits page changes through `state-change`, and supports client or server row models.

```vue
<YoupGrid
  :rows="rows"
  :columns="columns"
  :state="state"
  :pagination="{ pageSizeOptions: [10, 20, 50, 100] }"
  :row-model-type="'server'"
  :server-row-count="totalCount"
  :server-filtered-row-count="filteredCount"
  @state-change="handleStateChange"
/>
```

## Cell Context Menu

Enable `showCellContextMenu` to expose right-click actions for copy, paste, clear contents, select row, clear row selection, row copy, row paste below, row insert, and row delete. Cell paste and clear use the same edit guards as inline editing. Row insert and row paste require `createRow`; row paste keeps the newly created row ID while copying field-backed column values from the copied row. TSV paste also uses `createRow` and `rows-change` to append missing rows when pasted data runs past the last visible row.

## CSV and Excel Export

The toolbar can export currently visible rows and visible columns as CSV or Excel-compatible `.xls`. Use `showCsvExport`, `showExcelExport`, `csvFileName`, and `excelFileName` to control the export buttons and file names.

## Cell Meta and Tooltips

Use `cellMeta` or `getCellMeta` to mark individual cells with loading, error, warning, or success state. The cell key format is `${rowId}:${columnId}`.

```vue
<template>
  <YoupGrid
    :rows="rows"
    :columns="columns"
    :get-row-id="(row) => row.id"
    :cell-meta="{
      '3:logicalName': { status: 'error', message: 'Forbidden term' },
      '3:physicalName': { status: 'loading' }
    }"
    :cell-tooltip="{
      mode: 'rich',
      autoOpenCellKey: '3:logicalName',
      autoOpenDurationMs: 2000
    }"
  />
</template>
```

`cellTooltip.mode` defaults to `"native"`. Use `"rich"` for the custom tooltip shown on hover/focus or by `autoOpenCellKey`, and `"none"` to suppress tooltip messages.

## Headless Usage

```ts
import type { ColumnDef, GridState } from "@youp-grid/core";
import { ref } from "vue";
import { useYoupGrid } from "@youp-grid/vue";

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

const grid = useYoupGrid(() => ({
  rows: rows.value,
  columns,
  state: state.value,
  getRowId: (row) => row.id,
  onStateChange: ({ state: nextState }) => {
    state.value = nextState;
  },
}));

grid.setSort("age", "desc");
```

## Boundary

The Vue component provides row rendering, row number and selection columns, keyboard cell focus and range selection, a cell context menu, inline editing, synchronous/asynchronous validation and save rollback, header sorting, advanced filters, column controls, variable row heights, wrapped cells, locale text, expandable detail slots, metadata/tooltips, pagination, grouping/tree expansion, and header/cell/editor slots. Component refs expose focus, editing, scrolling, range, export, state, and reset methods.

The headless composable provides state, row model, sorting, filtering, pagination, column state, row selection, tree expansion, grouping, aggregation, and remote-cache helpers through Vue `computed` refs.
