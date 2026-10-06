# @youp-grid/xlsx

Optional ExcelJS-backed `.xlsx` reader/writer. Pass `createXlsxAdapter()` to the workbench. The core and grid adapters do not load ExcelJS.

```sh
npm install @youp-grid/xlsx
```

```ts
import { createXlsxAdapter } from "@youp-grid/xlsx";
const adapter = createXlsxAdapter();
const sheets = await adapter.read(arrayBuffer);
const bytes = await adapter.write({ rows: rowModel.sortedRows, columns: rowModel.visibleColumns });
```

Numeric and boolean values retain their types. Dates read as ISO strings. Formula cells require cached results; formulas are not executed. Export returns binary XLSX, with a header row, frozen header, and autofilter.

See [grid workflows](../../docs/WORKFLOWS.md) for sheet selection, explicit mappings, validators, and import confirmation. Applications can lazy-load this adapter or implement the core `GridWorkbookAdapter` contract with another library.

ExcelJS 4.4.0 depends on UUID 8. Applications using npm can apply `"overrides": { "uuid": "^11.1.1" }` in their root manifest to use the patched UUID version. This repository and its demo use that override; ExcelJS uses UUID's compatible `v4` API.
