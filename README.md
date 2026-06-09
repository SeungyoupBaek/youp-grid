# Youp Grid

Framework-agnostic data grid core for building UI adapters such as React, Vue, Angular, Svelte, Vanilla JS, or Web Components.

This repository starts with the minimum reusable engine:

- column normalization
- typed row model generation
- sorting
- filtering
- pagination
- fixed-size virtualization range calculation
- serializable grid state helpers

The first goal is not to copy every AG Grid feature. The goal is to establish a small, stable core that adapters can render without owning data semantics.

## MVP API

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
  { field: "age", headerName: "Age" },
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

## Current Boundary

Implemented now:

- core package
- React adapter package
- row, column, and selection state helpers
- fixed-height virtualized React body renderer
- built-in header filters
- pagination controls
- column resize handles
- column chooser with visibility controls
- column menu for sort, pin, hide, and filter actions
- grouped headers
- density control
- checkbox selection column
- row click and double-click events
- custom cell and header renderers
- pinned left/right columns
- keyboard cell navigation and selection
- inline cell editing
- range selection
- TSV clipboard copy/paste
- fill handle for repeated cell values
- undo/redo for cell value changes
- CSV export
- loading and error overlays
- server-side row model contract
- cursor pagination adapter
- infinite scrolling contract
- request cancellation contract
- cache invalidation contract
- aggregation
- row grouping
- Vite React demo
- static HTML preview
- npm package publishing setup

## Installation

```sh
npm install @youp-grid/core @youp-grid/react
```

Next implementation step:

- add tree data

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased implementation plan.
See [docs/REACT_ADAPTER.md](docs/REACT_ADAPTER.md) for React usage.
