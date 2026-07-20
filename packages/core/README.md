# @youp-grid/core

Framework-agnostic data grid core for Youp Grid.

Includes serializable state and models for pivot tables, chart datasets, and pluggable formula engines. Optional integrations live in `@youp-grid/formula` and `@youp-grid/charts-echarts`, so the core has no parser or chart runtime dependency.

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
- pinned row model output
- state persistence, row reorder, size-to-fit, and remote cache helpers
- synchronous/asynchronous column validators
- fixed and variable-size virtualization helpers
- cancellable server data source controller with LRU block cache, status, and retry
- clipboard, fill handle, history, CSV/TSV import, CSV/Excel export, and aggregation utilities

Delimited import returns parsed rows, source rows, headers, column mappings, and parser issues so UI adapters can render an import preview before applications persist data.

UI adapters should reuse this package instead of duplicating data semantics.

## License

MIT. See the repository license.
