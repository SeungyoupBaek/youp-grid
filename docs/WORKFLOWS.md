# Grid workflows

These features are opt-in. Existing grid editing, import, and export callbacks retain their behavior when the companion controls and edit session are absent.

## React

```tsx
import { useEffect, useState } from "react";
import { createGridEditSession, type GridState } from "@youp-grid/core";
import { YoupGrid, YoupGridWorkbench } from "@youp-grid/react";
import "@youp-grid/react/styles.css";

function Orders({ initialRows, columns, saveChanges }) {
  const [rows, setRows] = useState(initialRows);
  const [state, setState] = useState<GridState>({});
  const [session] = useState(() => createGridEditSession({
    rows: initialRows, columns, getRowId: row => row.id,
    onSave: async (changes, signal) => {
      // Persist all changes in one transaction. Return the complete canonical row set.
      const savedRows = await saveChanges(changes, signal);
      setRows(savedRows);
      return savedRows;
    },
  }));
  useEffect(() => () => session.dispose(), [session]);
  return <>
    <YoupGridWorkbench rows={rows} columns={columns} state={state}
      getRowId={row => row.id} onStateChange={setState} editSession={session}
      viewStorage={window.localStorage} viewStorageKey="orders-views" />
    <YoupGrid rows={rows} columns={columns} state={state}
      getRowId={row => row.id} onStateChange={({ state }) => setState(state)}
      editSession={session} />
  </>;
}
```

Keep the session stable across renders. Recreate it when its column schema or edit permissions change. On an external data refresh, call `session.replaceRows(latestRows)` and update the application's rows. Do not call it during a save; edits and source replacement are locked until saving settles. A session can display refreshed rows while preserving drafts, but conflicting source values require discard and a fresh edit before saving. A stable unique string or finite numeric row ID is required; edits cannot change that ID.

`viewStorage` accepts any synchronous `getItem`/`setItem` storage adapter. Omit it for in-memory views. Browser storage should only be passed from client code; use application, user, and grid-specific keys when several grids share storage.

## Vue and Vanilla

Vue exports the same `YoupGridWorkbench` and `YoupGridAiPanel` names. Pass the workbench's controlled options as one object:

```vue
<YoupGridWorkbench :options="{
  rows, columns, state, getRowId, onStateChange: changeState,
  editSession: session, viewStorage, viewStorageKey: 'orders-views'
}" />
<YoupGrid :rows="rows" :columns="columns" :state="state"
  :get-row-id="getRowId" :edit-session="session"
  @state-change="({ state: next }) => changeState(next)" />
```

Dispose the session in the application's unmount handler. React and Vue use shared Vanilla workbench controls, so saved views, filtering, import previews, and batch actions have the same interaction contract. For framework-free screens, call `createGridWorkbench(host, options)` from `@youp-grid/vanilla`, call `update(nextOptions)` on controlled changes, and `destroy()` on removal. Import the adapter's `styles.css`.

## Saved views

Save a named view, switch views, rename or delete a view, and select or clear its default. The default is restored when the workbench mounts. Views include column order/width/visibility/pinning, sorting, filters, global search, compound filters, aggregation, grouping, and pivot configuration. They exclude rows, selection, formulas, edit drafts, and runtime caches. Applying a view preserves those live values and resets query pagination/cursors.

Core APIs: `captureGridView`, `applyGridView`, `updateGridView`, `deleteGridView`, `setDefaultGridView`, `loadGridViews`, and `saveGridViews`. Persistence uses a versioned collection. Malformed stored collections fall back to an empty collection. Applying a view with an unsupported compound filter reports an error instead of silently broadening its result.

## Global search and compound filters

```ts
import { setGridQuery } from "@youp-grid/core";

state = setGridQuery(state, {
  quickFilter: "open apple",
  filterExpression: {
    operator: "or",
    conditions: [
      { columnId: "quantity", operator: "gt", value: 100 },
      { operator: "and", conditions: [
        { columnId: "status", operator: "equals", value: "Open" },
        { columnId: "item", operator: "contains", value: "Apple" },
      ] },
    ],
  },
});
```

Every search token must match some visible, filterable column, without case sensitivity. Standard column filters, global search, and the compound expression are combined with AND. Empty groups impose no restriction. Expressions support existing filter operators and custom column predicates; text, numeric, `between`, and `in` values retain their types. The builder accepts JSON arrays for `between` and `in`. Invalid expressions, excessive depth, or more than 100 nodes are rejected.

Filtering happens before sorting, aggregation, grouping, pivoting, pagination, and export. React/Vue controllers expose `setQuickFilter` and `setFilterExpression`. Server queries and cache keys include both properties; the application server must implement their semantics and refetch. Server pages are not locally filtered. Workbench XLSX export is disabled for server row models because one loaded page is not a complete export.

## Batch editing

Pass one `editSession` to the grid and workbench. Inline edits, checkboxes, paste, fill, and delete stage field values in the session. The grid shows draft rows, and the workbench shows before/after values with save, discard, undo, and redo. Repeated changes coalesce per cell; undo groups one paste/fill operation. Formula expressions remain part of grid state, outside the field-value session.

Before saving, the session validates every column validator on each affected complete draft row, including dependent fields. Validation or persistence failure keeps drafts and reports errors for retry. Saving locks further writes and source replacement. Disposing a session aborts its signal and ignores late successful responses. An application must propagate that signal and provide its own server transaction/idempotency policy.

`onSave(changes, signal)` must atomically persist the whole set or reject. It may return the complete canonical row set, or return nothing to accept the materialized drafts. A partial row-set response is rejected. Change events still fire for application observers, but the grid's per-cell `onCellValueSave` is bypassed while a session is attached. Do not persist each observer event as well as the batch callback. Row insert/delete/reorder callbacks remain application-owned; reflect accepted changes with `replaceRows`.

## Import preview and real XLSX

```sh
npm install @youp-grid/xlsx
```

```tsx
import { createXlsxAdapter } from "@youp-grid/xlsx";

<YoupGridWorkbench {...options}
  workbookAdapter={createXlsxAdapter()}
  createImportRow={() => ({ id: crypto.randomUUID(), item: "", quantity: 0 })}
  onImportRows={async importedRows => {
    // Atomically append or replace according to the application's policy.
    const nextRows = await saveImportedRows(importedRows);
    session.replaceRows(nextRows);
    setRows(nextRows);
  }} />
```

Keep the adapter stable or lazy-load it when needed. The XLSX package is separate; the core and grid renderers do not load ExcelJS.

Import supports CSV/TSV and actual `.xlsx` files. Select a sheet, inspect or change source-to-column mappings, then preview. Headers match column ID, field, or display name without case sensitivity; unrelated headers do not map by position. Parsers run before validators, all non-formula validators inspect the complete row, and duplicate/invalid row IDs block application. Only a valid preview enables **Apply import**. Changing rows, columns, mappings, file, or sheet invalidates the preview. Preview never mutates source/default rows. A failed apply keeps its preview for retry; duplicate clicks are locked while it is pending.

`createGridImportPreview` and `matchGridImportHeaders` support custom interfaces. Applications can inject their own `GridWorkbookAdapter` instead of ExcelJS. XLSX reads typed numeric/boolean cells, rich text, dates as ISO strings, and cached formula results. It rejects formula cells without cached results. It does not evaluate workbook formulas. Export writes binary XLSX with typed values, visible columns, and the current filtered/sorted rows, including draft values and calculated cell values. Existing **Export Excel** remains the legacy HTML spreadsheet action; **Export XLSX** is the new binary action.

## Conditional formatting

Pass controlled `conditionalFormats` to the grid and `onConditionalFormatsChange` to the workbench to edit rules. Rules use existing filter operators and can specify text color, background color, an icon, and a data bar. Later matching rules override earlier properties. Data bars require finite bounds with maximum greater than minimum and clamp the filled width to 0–100%.

```ts
const conditionalFormats = [{
  id: "low-stock", columnId: "quantity", operator: "lt" as const, value: 20,
  color: "#b91c1c", backgroundColor: "#fef2f2", icon: "⚠",
  dataBar: { min: 0, max: 100, color: "#fecaca" },
}];
```

React, Vue, and Vanilla use `getGridCellAppearance` from core, so the same value produces the same appearance. Formatting changes presentation, preserving cell values, sorting, filtering, and export types. Icons are decorative; continue to express business status in the cell value or tooltip.

## Verification and demo

Run `npm run verify` for package builds, unit tests, parity checks, benchmarks, package checks, and browser tests. The `tests/workflows.spec.ts` suite runs the same saved-view, edit/retry/history, paste/fill/delete, nested-filter/formatting, AI-preview, and XLSX round-trip behaviors against React and Vue.

Run `npm run dev --prefix examples/react-basic` and open `/?workflows=1` for the comparison demo. Its AI provider and save failure/retry example run locally; wire application providers and persistence callbacks for production use.
