# @youp-grid/vanilla

Framework-free DOM adapter for Youp Grid.

```sh
npm install @youp-grid/core @youp-grid/vanilla
```

```ts
import { createYoupGrid } from "@youp-grid/vanilla";
import "@youp-grid/vanilla/styles.css";

const grid = createYoupGrid(root, {
  rows,
  columns,
  getRowId: (row) => row.id,
  showRowSelectionColumn: true,
  onStateChange: (state) => console.log(state),
});

grid.focusCell({ rowIndex: 0, columnIndex: 0 });
grid.selectRow(rows[0].id, true);
grid.selectRange({
  anchor: { rowIndex: 0, columnIndex: 0 },
  focus: { rowIndex: 2, columnIndex: 1 },
});
```

The returned API supports state get/set/reset, row and range selection, cell focus, row scrolling, CSV/Excel export, option updates, and teardown. Rendering supports pinned rows, loading/error/empty text, per-row heights, wrapped cells, and locale text overrides.

## License

MIT. See the repository license.
