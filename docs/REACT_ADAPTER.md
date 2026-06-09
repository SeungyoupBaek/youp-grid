# React Adapter

`@youp-grid/react` is a thin renderer over `@youp-grid/core`.

The adapter should not own data semantics. Sorting, filtering, pagination, row selection, column state, and virtualization ranges must stay in core so other adapters can reuse the same behavior.

## Public API

- `useYoupGrid(options)`
- `YoupGrid(props)`
- `@youp-grid/react/styles.css`

## Current Features

- controlled and uncontrolled state
- sortable headers
- contains filter helper through `useYoupGrid`
- built-in header filter inputs
- pagination controls
- row selection
- cell focus navigation
- inline cell editing
- range selection
- TSV clipboard copy/paste
- fill handle
- undo/redo for cell value changes
- CSV export
- loading and error overlays
- column width and visibility state helpers
- column resize handles
- column menu
- grouped headers
- density control
- checkbox selection column
- row click and double-click events
- column chooser panel
- pinned left and right columns
- fixed-height virtualized body
- keyboard cell navigation with `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Home`, `End`, and `Tab`
- range extension with `Shift` + navigation keys
- edit mode with `Enter`, `F2`, printable keys, `Escape`, and blur commit
- committed cell changes undo with `Cmd/Ctrl` + `Z`
- committed cell changes redo with `Cmd/Ctrl` + `Y` or `Cmd/Ctrl` + `Shift` + `Z`
- keyboard row selection with `Space`
- custom cell renderer
- custom header renderer
- server-side row model
- cursor pagination adapter
- infinite scrolling contract
- aggregation footer
- row grouping
- request cancellation contract
- cache invalidation contract
- empty state

## Example

```tsx
import type { ColumnDef, GridState } from "@youp-grid/core";
import { YoupGrid } from "@youp-grid/react";
import "@youp-grid/react/styles.css";

type Trade = {
  id: string;
  symbol: string;
  quantity: number;
};

const columns: ColumnDef<Trade>[] = [
  { field: "symbol", headerGroup: "Trade", width: 120 },
  {
    field: "quantity",
    headerGroup: "Position",
    width: 140,
    editable: true,
    valueParser: (value) => Number(value),
  },
];

function TradeGrid({ rows }: { rows: Trade[] }) {
  const [state, setState] = useState<GridState>({
    pagination: { pageIndex: 0, pageSize: 100 },
  });

  return (
    <YoupGrid
      rows={rows}
      columns={columns}
      state={state}
      getRowId={(row) => row.id}
      rowModelType="client"
      onStateChange={({ state }) => setState(state)}
      onCellValueChange={({ rowId, column, value }) => {
        // Update application state here. The grid does not mutate row data.
      }}
      onRowClick={({ rowId }) => {
        // React to row click here.
      }}
      onRowDoubleClick={({ rowId }) => {
        // React to row double click here.
      }}
      editable
      showColumnChooser
      showColumnMenu
      showCsvExport
      showDensityControl
      showFilters
      showPagination
      showRowSelectionColumn
      defaultDensity="standard"
      loading={false}
      error={false}
      height={520}
    />
  );
}
```

## Local Demo

`examples/react-basic` is scaffolded as a Vite app. It needs package installation before it can run:

```sh
cd examples/react-basic
npm install
npm run dev
```

`examples/static-preview/index.html` can be opened directly without installing dependencies. It is only a visual preview, not the React adapter runtime.

## Column State

Visibility and pinning are stored in serializable core state:

```ts
const [state, setState] = useState<GridState>({
  columns: [
    { columnId: "symbol", pinned: "left" },
    { columnId: "status", pinned: "right" },
    { columnId: "quantity", hidden: true },
  ],
});
```

The React adapter renders pinned columns with sticky left/right positioning, but the state contract stays in `@youp-grid/core`.

## Column Menu

Each header can show a column menu for common column actions.

- `showColumnMenu` controls whether header menu buttons are shown.
- The menu can sort ascending, sort descending, or clear the active sort.
- The menu can pin left, pin right, unpin, hide the column, or clear that column's filter.

## Grouped Headers

Columns with the same adjacent `headerGroup` value render under one group header.

```ts
const columns: ColumnDef<Trade>[] = [
  { field: "symbol", headerGroup: "Trade" },
  { field: "quantity", headerGroup: "Position" },
  { field: "price", headerGroup: "Position" },
];
```

## Density Control

Density is React adapter presentation state. It changes the default row height and cell spacing without changing the core row model.

- `density` controls the current density.
- Supported values are `"compact"`, `"standard"`, and `"comfortable"`.
- `defaultDensity` sets the uncontrolled initial density.
- `onDensityChange` is called when the toolbar selector changes.
- `showDensityControl` controls whether the toolbar selector is shown.
- `rowHeight` still takes priority over the density default row height.

## Checkbox Selection Column

The React adapter can render a pinned checkbox column for row selection.

- `showRowSelectionColumn` controls whether the checkbox column is shown.
- Row checkbox changes update `GridState.selectedRowIds`.
- The header checkbox selects or clears the current visible rows.
- Keyboard row selection with `Space` still works without the checkbox column.

## Row Events

Rows can emit click and double-click callbacks without changing core data semantics.

- `onRowClick` is called when a body row is clicked.
- `onRowDoubleClick` is called when a body row is double-clicked.
- The callback includes `row`, `rowNode`, `rowId`, `rowIndex`, and the original React mouse event.
- Interactive controls inside a row, such as checkboxes and cell editors, do not emit row click callbacks.

## Server-Side Row Model

`rowModelType="server"` tells the grid that `rows` already came from a remote query.

- The core still applies column state, visibility, and pinning.
- The core does not apply local filtering, sorting, or pagination to `rows`.
- `serverRowCount` is the total remote row count.
- `serverFilteredRowCount` is the remote count after server-side filters.
- Pagination page count is derived from `serverFilteredRowCount` and `state.pagination.pageSize`.
- Consumers fetch data in `onStateChange`; the grid does not own network requests.

```tsx
<YoupGrid
  rows={currentPageRows}
  columns={columns}
  state={state}
  rowModelType="server"
  serverRowCount={totalRowCount}
  serverFilteredRowCount={filteredRowCount}
  onStateChange={({ state }) => {
    setState(state);
    fetchRows(state);
  }}
/>
```

## Cursor Pagination

Cursor pagination is represented in serializable state under `cursorPagination`.

- `cursorPagination.cursor` is the cursor used for the current remote page.
- `nextCursor` and `previousCursor` are server-provided page tokens.
- `hasNextPage` and `hasPreviousPage` control the cursor Previous and Next buttons.
- `pageSize` controls the remote page size and resets the cursor when changed.
- Consumers update `rows` and cursor metadata in response to `onStateChange`.

```tsx
const [state, setState] = useState<GridState>({
  cursorPagination: { pageSize: 100 },
});

<YoupGrid
  rows={currentRows}
  columns={columns}
  state={state}
  rowModelType="server"
  serverFilteredRowCount={filteredCount}
  onStateChange={({ state }) => {
    setState(state);
    fetchRows({
      cursor: state.cursorPagination?.cursor,
      pageSize: state.cursorPagination?.pageSize,
      sort: state.sort,
      filters: state.filters,
    });
  }}
/>
```

## Infinite Scrolling

Infinite scrolling is exposed as an end-of-loaded-rows signal. The grid does not fetch or append rows itself.

- `getInfiniteScrollTrigger(options)` is the framework-agnostic core helper.
- `infiniteScroll` enables the React adapter callback.
- `infiniteScrollThreshold` controls how many loaded rows can remain before the callback fires.
- `hasMoreRows={false}` suppresses the callback when the remote source is exhausted.
- `infiniteScrollLoading` suppresses duplicate callbacks while the app is already loading more rows.
- `onRowsEndReached` receives the current state, row model, loaded row count, last visible row index, threshold, and remaining row count.

```tsx
const [rows, setRows] = useState<Trade[]>([]);
const [loadingMore, setLoadingMore] = useState(false);
const [hasMoreRows, setHasMoreRows] = useState(true);

<YoupGrid
  rows={rows}
  columns={columns}
  rowModelType="server"
  infiniteScroll
  infiniteScrollThreshold={30}
  infiniteScrollLoading={loadingMore}
  hasMoreRows={hasMoreRows}
  onRowsEndReached={async ({ rowCount }) => {
    setLoadingMore(true);
    const result = await fetchRows({ offset: rowCount, limit: 100 });

    setRows((current) => [...current, ...result.rows]);
    setHasMoreRows(result.hasMoreRows);
    setLoadingMore(false);
  }}
/>
```

## Aggregation

Aggregation rules are stored in serializable state under `aggregation`.

- Supported functions are `"sum"`, `"avg"`, `"min"`, `"max"`, and `"count"`.
- Client row models aggregate filtered rows before pagination.
- Server row models aggregate the loaded rows passed to the grid, not the remote total dataset.
- Numeric functions ignore non-number values. `count` counts input rows.
- `showAggregationFooter` controls the React footer row. It defaults to visible when aggregation results exist.

```tsx
const [state, setState] = useState<GridState>({
  aggregation: [
    { columnId: "quantity", function: "sum" },
    { columnId: "price", function: "avg" },
    { columnId: "status", function: "count", label: "Rows" },
  ],
});

<YoupGrid
  rows={rows}
  columns={columns}
  state={state}
  onStateChange={({ state }) => setState(state)}
  showAggregationFooter
/>
```

## Row Grouping

Row grouping rules are stored in serializable state under `rowGrouping`.

- `rowGrouping.columnIds` defines the grouping columns in order.
- Group rows are added to `rowModel.displayRows`; `rowModel.visibleRows` remains data rows only.
- React renders group rows as non-editable headers with expand/collapse buttons.
- Collapsed group ids are stored in `rowGrouping.collapsedGroupIds`.
- Client row models group the current visible page after filtering, sorting, and pagination.
- Server row models group the loaded rows passed to the grid.

```tsx
const [state, setState] = useState<GridState>({
  rowGrouping: { columnIds: ["desk", "status"] },
});

<YoupGrid
  rows={rows}
  columns={columns}
  state={state}
  onStateChange={({ state }) => setState(state)}
/>
```

## Request Cancellation

Remote request state is represented in serializable state under `remoteRequest`.

- `startRemoteRequest(state, requestId)` marks a request as loading and increments `sequence`.
- `finishRemoteRequest(state, requestId)` only marks success when `requestId` is still active.
- `failRemoteRequest(state, requestId, error)` only marks error when `requestId` is still active.
- `cancelRemoteRequest(state, requestId)` marks the active request as cancelled.
- `isActiveRemoteRequest(state, requestId)` lets consumers ignore stale responses.
- The React controller exposes matching methods.
- `remoteRequest.status === "loading"` drives the default loading overlay unless `loading` is explicitly provided.

```tsx
let activeAbort: AbortController | undefined;

function fetchRowsForState(nextState: GridState) {
  activeAbort?.abort();

  const requestId = crypto.randomUUID();
  const abort = new AbortController();
  activeAbort = abort;

  setState((current) => {
    return startRemoteRequest(
      { ...nextState, remoteRequest: current.remoteRequest },
      requestId,
    );
  });

  fetchRows(nextState, { signal: abort.signal })
    .then((result) => {
      setRows(result.rows);
      setState((current) => {
        if (!isActiveRemoteRequest(current, requestId)) {
          return current;
        }

        return finishRemoteRequest(current, requestId);
      });
    })
    .catch((error) => {
      setState((current) => {
        if (abort.signal.aborted) {
          return cancelRemoteRequest(current, requestId);
        }

        return failRemoteRequest(current, requestId, String(error));
      });
    });
}
```

## Cache Invalidation

Remote cache metadata is represented in serializable state under `remoteCache`.

- `createRemoteCacheKey(state)` derives a stable key from sort, filters, pagination, and cursor pagination.
- `setRemoteCache(state, cache)` stores normalized metadata without storing row data.
- `invalidateRemoteCache(state, key)` increments `version`, marks the cache stale, and records the invalidated key.
- `acknowledgeRemoteCache(state, key)` clears an invalidated key after a fresh remote result is accepted.
- Sort, filter, pagination, and cursor helper changes mark an existing `remoteCache` as stale.
- The React controller exposes matching methods for stateful consumers.

```tsx
import {
  acknowledgeRemoteCache,
  createRemoteCacheKey,
  invalidateRemoteCache,
  isActiveRemoteRequest,
  startRemoteRequest,
  finishRemoteRequest,
  type GridState,
} from "@youp-grid/core";

function fetchRowsForState(nextState: GridState) {
  const cacheKey = createRemoteCacheKey(nextState);
  const requestId = crypto.randomUUID();

  setState((current) => {
    return startRemoteRequest(invalidateRemoteCache(nextState, cacheKey), requestId);
  });

  fetchRows(nextState).then((result) => {
    setRows(result.rows);
    setState((current) => {
      if (!isActiveRemoteRequest(current, requestId)) {
        return current;
      }

      return acknowledgeRemoteCache(finishRemoteRequest(current, requestId), cacheKey);
    });
  });
}
```

## Cell Editing

Cells are keyboard-focusable and editable when both the grid and column allow it:

- `editable` on `YoupGrid` enables editing globally.
- `editable: true` or `editable: false` on a column controls individual columns.
- `valueParser` converts editor text into the row value type.
- `onCellValueChange` is the only write path; consumers update their own row state.
- `onCellValueChange.source` is `edit`, `paste`, `fill`, `undo`, or `redo`.
- Undo/redo replays through `onCellValueChange`; the adapter does not mutate row objects.

## Clipboard

The adapter copies and pastes tab-separated values:

- Copy uses the current range selection, or the focused cell when no range is active.
- Paste starts at the current range's top-left cell, or the focused cell when no range is active.
- Pasting one value into a selected range fills the whole range.
- Paste writes through `onCellValueChange`; row objects are never mutated by the grid.
- A paste operation is stored as one undoable history entry.

## Fill Handle

The focused cell or active range shows a small fill handle in the bottom-right corner.

- Dragging down repeats source values into the same columns below the range.
- Dragging right repeats source values into columns to the right.
- Fill writes through `onCellValueChange` with `source: "fill"`.
- A fill operation is stored as one undoable history entry.

## CSV Export

The built-in toolbar can export the currently visible rows and visible columns as CSV.

- `showCsvExport` controls whether the toolbar button is shown.
- `csvFileName` controls the downloaded file name.
- Values use `valueFormatter` when a column provides one.
- Hidden columns are excluded because export uses the visible column model.

## Loading And Error

The body can show non-mutating overlays while preserving the current grid layout.

- `loading` shows a status overlay.
- `loadingContent` overrides the default loading message.
- `error` shows an alert overlay and takes priority over loading.
- `errorContent` overrides the default error message.
