# @youp-grid/vanilla

Vanilla DOM adapter for Youp Grid.

```sh
npm install @youp-grid/core @youp-grid/vanilla
```

```ts
import { createYoupGrid } from "@youp-grid/vanilla";
import "@youp-grid/vanilla/styles.css";

const grid = createYoupGrid(document.querySelector("#grid")!, {
  rows,
  columns,
  getRowId: (row) => row.id,
});

grid.update({ rows: nextRows });
grid.destroy();
```

The adapter renders sorting, filtering, selection state, pinned rows, and the core row model without requiring a framework.
