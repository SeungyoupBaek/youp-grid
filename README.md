# Youp Grid

[![npm core](https://img.shields.io/npm/v/@youp-grid/core?label=@youp-grid/core)](https://www.npmjs.com/package/@youp-grid/core)
[![npm react](https://img.shields.io/npm/v/@youp-grid/react?label=@youp-grid/react)](https://www.npmjs.com/package/@youp-grid/react)

Framework-agnostic data grid core for building UI adapters such as React, Vue, Angular, Svelte, Vanilla JS, or Web Components.

Youp Grid is an MIT-licensed open-source project maintained in public on GitHub.

This repository starts with a reusable engine and a React adapter:

- column normalization
- typed row model generation
- sorting
- filtering
- pagination
- fixed-size virtualization range calculation
- serializable grid state helpers
- reusable React editing, selection, tooltip, and row operation UI

The first goal is not to copy every AG Grid feature. The goal is to keep reusable grid behavior small and stable so application screens can adopt it incrementally.

## Packages

| Package | Purpose |
| --- | --- |
| `@youp-grid/core` | Framework-agnostic grid state, row model, sorting, filtering, pagination, selection, tree data, and data helpers. |
| `@youp-grid/react` | React adapter, virtualized grid UI, inline editing, keyboard behavior, row actions, tooltips, and bundled styles. |

## Installation

```sh
npm install @youp-grid/core @youp-grid/react
```

```tsx
import { YoupGrid } from "@youp-grid/react";
import "@youp-grid/react/styles.css";
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

## Current Boundary

Implemented now:

- core package
- React adapter package
- row, column, and selection state helpers
- fixed-height virtualized React body renderer
- built-in header filters
- pagination controls
- column resize handles and double-click auto-size
- column chooser with visibility controls
- column menu for sort, pin, hide, and filter actions
- grouped headers
- density control
- checkbox selection column
- row number column
- cell context menu for copy, paste, clear, row selection, row insert/delete, and auto-size
- row click and double-click events
- custom cell and header renderers
- pinned left/right columns
- keyboard cell navigation and selection
- inline cell editing
- edit commit events with enter, tab, and blur reasons
- text, number, checkbox, and select editors
- cell placeholders and column alignment
- cell status metadata with native or rich tooltips
- read-only and per-cell edit guards
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
- tree data
- Vite React demo
- static HTML preview
- npm package publishing setup

## Development

```sh
npm install
npm test
npm run build
npm run pack:dry-run
```

## Project Maintenance

- Issues and feature requests are tracked in GitHub Issues.
- Pull requests should include focused changes and a short validation note.
- Releases follow semantic versioning while the public API stabilizes.
- Security reports should follow [SECURITY.md](SECURITY.md).

See [docs/ROADMAP.md](docs/ROADMAP.md) for the phased implementation plan.
See [docs/REACT_ADAPTER.md](docs/REACT_ADAPTER.md) for React usage.
See [docs/RELEASE.md](docs/RELEASE.md) for the release checklist.
See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and contribution rules.

## License

MIT. See [LICENSE](LICENSE).
