import { useMemo, useState } from "react";
import type { ColumnDef, GridState } from "@youp-grid/core";
import { YoupGrid } from "@youp-grid/react";
import "@youp-grid/react/styles.css";
import rootPackage from "../../../package.json";
import "./style.css";

type Trade = {
  id: string;
  desk: string;
  symbol: string;
  strategy: string;
  quantity: number;
  price: number;
  status: "Open" | "Filled" | "Rejected";
  tags: string[];
};

const initialRows: Trade[] = Array.from({ length: 10000 }, (_, index) => ({
  id: `trade-${index + 1}`,
  desk: ["Equity", "Rates", "Credit", "FX"][index % 4],
  symbol: ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN"][index % 5],
  strategy: ["Momentum", "Hedge", "Rebalance", "Carry"][index % 4],
  quantity: 100 + index * 3,
  price: Number((92 + (index % 37) * 1.73).toFixed(2)),
  status: index % 9 === 0 ? "Rejected" : index % 3 === 0 ? "Filled" : "Open",
  tags: [
    index % 4 === 0 ? "priority" : "auto",
    index % 7 === 0 ? "review" : "desk",
  ],
}));

const packageVersion = rootPackage.version;
const deskOptions = [
  { value: "Equity", label: "Equity", color: "#2563eb" },
  { value: "Rates", label: "Rates", color: "#7c3aed" },
  { value: "Credit", label: "Credit", color: "#0891b2" },
  { value: "FX", label: "FX", color: "#059669" },
];
const symbolOptions = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META"];
const strategyOptions = ["Momentum", "Hedge", "Rebalance", "Carry", "Manual override"];
const statusOptions = [
  { value: "Open", label: "Open", color: "#2563eb", description: "Working order" },
  { value: "Filled", label: "Filled", color: "#16a34a", description: "Completed order" },
  { value: "Rejected", label: "Rejected", color: "#dc2626", description: "Rejected by venue" },
];
const tagOptions = [
  { value: "priority", label: "Priority", color: "#dc2626" },
  { value: "review", label: "Review", color: "#d97706" },
  { value: "auto", label: "Auto", color: "#2563eb" },
  { value: "desk", label: "Desk", color: "#64748b" },
  { value: "hedged", label: "Hedged", color: "#059669" },
];

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
      {
        field: "desk",
        headerName: "Desk",
        width: 140,
        editable: true,
        editor: "select",
        options: deskOptions,
      },
      {
        field: "symbol",
        headerName: "Symbol",
        width: 120,
        editable: true,
        editor: "combobox",
        options: symbolOptions,
        placeholder: "Ticker",
      },
      {
        field: "strategy",
        headerName: "Strategy",
        width: 160,
        editable: true,
        editor: "combobox",
        options: strategyOptions,
        placeholder: "Type strategy",
      },
      {
        field: "quantity",
        headerName: "Quantity",
        width: 140,
        minWidth: 110,
        editable: true,
        editor: "number",
        valueParser: (value) => Number(value),
      },
      {
        field: "price",
        headerName: "Price",
        width: 120,
        minWidth: 100,
        editable: true,
        editor: "number",
        valueFormatter: (value) => `$${Number(value).toFixed(2)}`,
        valueParser: (value) => Number(value),
      },
      {
        field: "status",
        headerName: "Status",
        width: 140,
        editable: true,
        editor: "select",
        options: statusOptions,
      },
      {
        field: "tags",
        headerName: "Tags",
        width: 190,
        minWidth: 150,
        editable: true,
        editor: "tags",
        options: tagOptions,
        placeholder: "Add tag",
      },
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
  const tradeSummary = useMemo(() => {
    const openRows = rows.filter((row) => row.status === "Open").length;
    const filledRows = rows.filter((row) => row.status === "Filled").length;
    const rejectedRows = rows.filter((row) => row.status === "Rejected").length;
    const notional = rows.reduce((total, row) => total + row.quantity * row.price, 0);

    return {
      rows: rows.length.toLocaleString(),
      openRows: openRows.toLocaleString(),
      filledRows: filledRows.toLocaleString(),
      rejectedRows: rejectedRows.toLocaleString(),
      notional: formatCurrencyCompact(notional),
    };
  }, [rows]);

  return (
    <main className="demo-page">
      <header className="site-header">
        <div className="site-header__brand">
          <p className="site-header__eyebrow">Open-source TypeScript data grid</p>
          <h1>Youp Grid</h1>
          <p className="site-header__copy">
            Fast, editable React and Vue grids for operational tools that need selection, grouping, export,
            and server-side row models.
          </p>
        </div>
        <div className="site-header__actions" aria-label="Package links">
          <a className="site-header__button site-header__button--primary" href="#demo">
            Try demo
          </a>
          <a
            className="site-header__button"
            href="https://www.npmjs.com/package/@youp-grid/react"
            rel="noreferrer"
            target="_blank"
          >
            npm React
          </a>
          <a
            className="site-header__button"
            href="https://github.com/SeungyoupBaek/youp-grid/releases"
            rel="noreferrer"
            target="_blank"
          >
            Releases
          </a>
        </div>
        <div className="install-strip" aria-label="Install command">
          <span>v{packageVersion}</span>
          <code>npm install @youp-grid/core @youp-grid/react</code>
        </div>
      </header>

      <section className="demo-shell" id="demo">
        <div className="demo-summary" aria-label="Trading grid summary">
          <div className="demo-stat">
            <span>Total rows</span>
            <strong>{tradeSummary.rows}</strong>
          </div>
          <div className="demo-stat">
            <span>Open</span>
            <strong>{tradeSummary.openRows}</strong>
          </div>
          <div className="demo-stat">
            <span>Filled</span>
            <strong>{tradeSummary.filledRows}</strong>
          </div>
          <div className="demo-stat">
            <span>Rejected</span>
            <strong>{tradeSummary.rejectedRows}</strong>
          </div>
          <div className="demo-stat">
            <span>Notional</span>
            <strong>{tradeSummary.notional}</strong>
          </div>
        </div>

        <div className="demo-toolbar">
          <div>
            <h2>Live trading grid</h2>
            <span className="demo-row-event" aria-live="polite">
              {rowEvent}
            </span>
          </div>
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
        </div>
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
          showCellContextMenu
          showFilters
          showPagination={!infiniteMode}
          showRowSelectionColumn
          detailRowHeight={88}
          renderRowDetail={({ row }) => (
            <div className="trade-detail">
              <strong>{row.symbol}</strong>
              <span>Desk {row.desk}</span>
              <span>{row.quantity.toLocaleString()} shares</span>
              <span>{row.status}</span>
              <span>{row.tags.join(", ")}</span>
            </div>
          )}
          height={520}
        />
      </section>
    </main>
  );
}

function getCursorStart(cursor: string | undefined): number {
  const start = Number(cursor ?? 0);

  return Number.isFinite(start) && start > 0 ? start : 0;
}

function formatCurrencyCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
    style: "currency",
    currency: "USD",
  }).format(value);
}
