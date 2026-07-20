# Public API

This page documents the shared contracts added after `0.4.4`. Package-specific usage remains in each package README.

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
