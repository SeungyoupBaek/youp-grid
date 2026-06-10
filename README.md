# Youp Grid

Framework-agnostic data grid core for building UI adapters such as React, Vue, Angular, Svelte, Vanilla JS, or Web Components.

Youp Grid is an MIT-licensed open-source project maintained in public on GitHub.

This repository starts with the minimum reusable engine:

- column normalization
- typed row model generation
- sorting
- filtering
- pagination
- fixed-size virtualization range calculation
- serializable grid state helpers

The first goal is not to copy every AG Grid feature. The goal is to establish a small, stable core that adapters can render without owning data semantics.

## Packages

| Package | Purpose |
| --- | --- |
| `@youp-grid/core` | Framework-agnostic grid state, row model, sorting, filtering, pagination, selection, and data helpers. |
| `@youp-grid/react` | React adapter, virtualized grid UI, inline editing, keyboard behavior, and bundled styles. |

## Installation

```sh
npm install @youp-grid/core @youp-grid/react
```

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
- tree data
- Vite React demo
- static HTML preview
- npm package publishing setup

Next implementation step:

- add expandable rows

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
