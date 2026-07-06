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
- built-in date and datetime editors plus a custom `renderEditor` fallback
- clipboard paste, fill handle, delete, undo, and redo write paths
- cell edit commit callbacks with enter, tab, and blur reasons
- cell placeholders, column alignment, validation metadata, and rich tooltips
- column menus, resizing, auto-sizing, drag reorder, order reset, pinning, visibility, density, and row selection UI
- advanced filter operators, column chooser search, column presets, and fit-to-width sizing
- expandable master-detail rows through `renderRowDetail`
- pinned top and bottom rows
- controlled row drag reorder through `onRowsChange`
- toolbar CSV and Excel export plus CSV/TSV import callbacks
- optional row number column and cell context menu
- controlled row insert/delete and row copy/paste callbacks through `createRow` and `onRowsChange`
- loading, empty, error, validation, pending, warning, and read-only states

The adapter emits changes through callbacks. Applications keep ownership of row data.
Row insert and row paste require `createRow`; row paste keeps the newly created row ID while copying field-backed column values from the copied row. TSV paste also uses `createRow` and `onRowsChange` to append missing rows when pasted data runs past the last visible row.

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
  filterMode="advanced"
  showSizeColumnsToFit
  columnPresets={[{ id: "ops", label: "Ops", columnIds: ["logicalName", "physicalName"] }]}
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
  showImport
  createImportRow={() => ({
    id: crypto.randomUUID(),
    logicalName: "",
    physicalName: "",
    length: "",
    nullable: true,
  })}
  onImportRows={({ rows, issues }) => {
    if (issues.length > 0) {
      // Show validation feedback before saving.
      return;
    }
    setRows((current) => [...current, ...rows]);
  }}
/>;
```

## License

MIT. See the repository license.
