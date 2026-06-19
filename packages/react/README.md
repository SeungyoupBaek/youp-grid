# @youp-grid/react

React adapter for Youp Grid.

```sh
npm install @youp-grid/core @youp-grid/react
```

```ts
import { YoupGrid } from "@youp-grid/react";
import "@youp-grid/react/styles.css";
```

## What It Provides

- virtualized React grid UI
- keyboard navigation and inline editing
- built-in text, number, checkbox, and select editors
- clipboard paste, fill handle, delete, undo, and redo write paths
- cell edit commit callbacks with enter, tab, and blur reasons
- cell placeholders, column alignment, validation metadata, and rich tooltips
- column menus, resizing, auto-sizing, pinning, visibility, density, and row selection UI
- optional row number column and cell context menu
- controlled row insert/delete and row copy/paste callbacks through `createRow` and `onRowsChange`
- loading, empty, error, validation, pending, warning, and read-only states

The adapter emits changes through callbacks. Applications keep ownership of row data.
Row insert and row paste require `createRow`; row paste keeps the newly created row ID while copying field-backed column values from the copied row.

## Example

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
  onCellEditCommit={({ reason }) => {
    // "enter", "tab", or "blur"
  }}
  onCellValueChange={({ rowId, columnId, value }) => {
    // Update application-owned row state.
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

## License

MIT. See the repository license.
