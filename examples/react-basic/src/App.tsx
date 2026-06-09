import { useMemo, useState } from "react";
import type { ColumnDef, GridState } from "@youp-grid/core";
import { YoupGrid } from "@youp-grid/react";
import "@youp-grid/react/styles.css";
import "./style.css";

type Trade = {
  id: string;
  desk: string;
  symbol: string;
  quantity: number;
  price: number;
  status: "Open" | "Filled" | "Rejected";
};

const initialRows: Trade[] = Array.from({ length: 10000 }, (_, index) => ({
  id: `trade-${index + 1}`,
  desk: ["Equity", "Rates", "Credit", "FX"][index % 4],
  symbol: ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN"][index % 5],
  quantity: 100 + index * 3,
  price: Number((92 + (index % 37) * 1.73).toFixed(2)),
  status: index % 9 === 0 ? "Rejected" : index % 3 === 0 ? "Filled" : "Open",
}));

export function App() {
  const [rows, setRows] = useState(initialRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [serverMode, setServerMode] = useState(false);
  const [cursorMode, setCursorMode] = useState(false);
  const [infiniteMode, setInfiniteMode] = useState(false);
  const [infiniteRowLimit, setInfiniteRowLimit] = useState(300);
  const [rowEvent, setRowEvent] = useState("Idle");
  const [state, setState] = useState<GridState>({
    columns: [
      { columnId: "desk", pinned: "left" },
      { columnId: "symbol", pinned: "left" },
      { columnId: "status", pinned: "right" },
    ],
    aggregation: [
      { columnId: "quantity", function: "sum" },
      { columnId: "price", function: "avg" },
      { columnId: "status", function: "count", label: "Rows" },
    ],
    rowGrouping: { columnIds: ["desk"] },
    pagination: { pageIndex: 0, pageSize: 100 },
  });
  const columns = useMemo<ColumnDef<Trade>[]>(
    () => [
      { field: "desk", headerGroup: "Trade", width: 140, editable: true },
      { field: "symbol", headerGroup: "Trade", width: 120, editable: true },
      {
        field: "quantity",
        headerGroup: "Position",
        width: 140,
        minWidth: 110,
        editable: true,
        valueParser: (value) => Number(value),
      },
      {
        field: "price",
        headerGroup: "Position",
        width: 120,
        minWidth: 100,
        editable: true,
        valueFormatter: (value) => `$${Number(value).toFixed(2)}`,
        valueParser: (value) => Number(value),
      },
      { field: "status", headerGroup: "Workflow", width: 140, editable: true },
    ],
    [],
  );
  const cursorPagination = useMemo(() => {
    const pageSize = state.cursorPagination?.pageSize ?? state.pagination?.pageSize ?? 100;
    const start = getCursorStart(state.cursorPagination?.cursor);
    const previousStart = Math.max(0, start - pageSize);
    const nextStart = start + pageSize;

    return {
      cursor: start === 0 ? undefined : String(start),
      pageSize,
      previousCursor: previousStart === 0 ? undefined : String(previousStart),
      nextCursor: nextStart < rows.length ? String(nextStart) : undefined,
      hasPreviousPage: start > 0,
      hasNextPage: nextStart < rows.length,
    };
  }, [rows.length, state.cursorPagination, state.pagination]);
  const gridState = useMemo<GridState>(() => {
    return cursorMode
      ? { ...state, cursorPagination }
      : { ...state, cursorPagination: undefined };
  }, [cursorMode, cursorPagination, state]);
  const gridRows = useMemo(() => {
    if (infiniteMode) {
      return rows.slice(0, infiniteRowLimit);
    }

    if (cursorMode) {
      const start = getCursorStart(cursorPagination.cursor);

      return rows.slice(start, start + cursorPagination.pageSize);
    }

    if (!serverMode) {
      return rows;
    }

    const pagination = state.pagination ?? { pageIndex: 0, pageSize: 100 };
    const start = pagination.pageIndex * pagination.pageSize;

    return rows.slice(start, start + pagination.pageSize);
  }, [cursorMode, cursorPagination, infiniteMode, infiniteRowLimit, rows, serverMode, state.pagination]);
  const hasMoreInfiniteRows = infiniteMode && infiniteRowLimit < rows.length;

  return (
    <main className="demo-shell">
      <section className="demo-toolbar">
        <h1>Youp Grid</h1>
        <span className="demo-row-event" aria-live="polite">
          {rowEvent}
        </span>
        <div className="demo-actions">
          <button
            type="button"
            aria-pressed={loading}
            onClick={() => setLoading((current) => !current)}
          >
            Loading
          </button>
          <button
            type="button"
            aria-pressed={error}
            onClick={() => setError((current) => !current)}
          >
            Error
          </button>
          <button
            type="button"
            aria-pressed={serverMode}
            onClick={() => {
              setCursorMode(false);
              setInfiniteMode(false);
              setServerMode((current) => !current);
            }}
          >
            Server rows
          </button>
          <button
            type="button"
            aria-pressed={cursorMode}
            onClick={() => {
              setServerMode(false);
              setInfiniteMode(false);
              setCursorMode((current) => !current);
            }}
          >
            Cursor rows
          </button>
          <button
            type="button"
            aria-pressed={infiniteMode}
            onClick={() => {
              setServerMode(false);
              setCursorMode(false);
              setInfiniteRowLimit(300);
              setInfiniteMode((current) => !current);
            }}
          >
            Infinite rows
          </button>
        </div>
      </section>
      <YoupGrid
        rows={gridRows}
        columns={columns}
        state={gridState}
        getRowId={(row) => row.id}
        rowModelType={serverMode || cursorMode || infiniteMode ? "server" : "client"}
        serverRowCount={serverMode || cursorMode || infiniteMode ? rows.length : undefined}
        serverFilteredRowCount={serverMode || cursorMode || infiniteMode ? rows.length : undefined}
        onStateChange={({ state: nextState }) => setState(nextState)}
        onCellValueChange={({ rowId, column, value }) => {
          if (!column.field) {
            return;
          }

          setRows((currentRows) => {
            return currentRows.map((row) => {
              if (row.id !== rowId) {
                return row;
              }

              return {
                ...row,
                [column.field as keyof Trade]: value,
              };
            });
          });
        }}
        onRowClick={({ rowId }) => {
          setRowEvent(`Click ${rowId}`);
        }}
        onRowDoubleClick={({ rowId }) => {
          setRowEvent(`Double ${rowId}`);
        }}
        infiniteScroll={infiniteMode}
        infiniteScrollThreshold={30}
        hasMoreRows={hasMoreInfiniteRows}
        onRowsEndReached={({ rowCount }) => {
          setInfiniteRowLimit((current) => {
            return Math.min(rows.length, Math.max(current, rowCount) + 300);
          });
          setRowEvent(`Load more after ${rowCount} rows`);
        }}
        editable
        loading={loading}
        loadingContent="Loading trades"
        error={error}
        errorContent="Unable to load trades"
        showColumnChooser
        showFilters
        showPagination={!infiniteMode}
        showRowSelectionColumn
        height={520}
      />
    </main>
  );
}

function getCursorStart(cursor: string | undefined): number {
  const start = Number(cursor ?? 0);

  return Number.isFinite(start) && start > 0 ? start : 0;
}
