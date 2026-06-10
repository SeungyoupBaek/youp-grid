# @youp-grid/core

Framework-agnostic data grid core for Youp Grid.

```sh
npm install @youp-grid/core
```

```ts
import { buildRowModel, type ColumnDef } from "@youp-grid/core";
```

## What It Owns

- column normalization
- row model generation
- sorting, filtering, and pagination helpers
- selection and column state helpers
- tree data and row grouping helpers
- clipboard, fill handle, history, CSV, and aggregation utilities

UI adapters should reuse this package instead of duplicating data semantics.

## License

MIT. See the repository license.
