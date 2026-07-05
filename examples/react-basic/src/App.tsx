import { useMemo, useState } from "react";
import {
  importGridDelimitedText,
  loadGridState,
  saveGridState,
  type ColumnDef,
  type GridState,
} from "@youp-grid/core";
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
  settlementDate: string;
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
  settlementDate: `2026-07-${String((index % 20) + 1).padStart(2, "0")}`,
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

function parseTagValues(value: unknown): string[] {
  return String(value)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tagOptions.find((option) => option.value === tag || option.label === tag)?.value ?? tag);
}

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
        valueFormatter: (value) => formatInteger(Number(value)),
        valueParser: (value) => Number(value),
      },
      {
        field: "price",
        headerName: "Price",
        width: 120,
        minWidth: 100,
        editable: true,
        editor: "number",
        valueFormatter: (value) => formatCurrency(Number(value)),
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
        field: "settlementDate",
        headerName: "Settlement",
        width: 150,
        editable: true,
        editor: "date",
      },
      {
        field: "tags",
        headerName: "Tags",
        width: 190,
        minWidth: 150,
        editable: true,
        editor: "tags",
        options: tagOptions,
        valueParser: parseTagValues,
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
  const pinnedTopRows = useMemo<Trade[]>(() => [
    {
      id: "summary-open",
      desk: "Pinned",
      symbol: "OPEN",
      strategy: "Live summary",
      quantity: rows.filter((row) => row.status === "Open").length,
      price: 0,
      status: "Open",
      settlementDate: "2026-07-03",
      tags: ["priority"],
    },
  ], [rows]);
  const pinnedBottomRows = useMemo<Trade[]>(() => [
    {
      id: "summary-total",
      desk: "Pinned",
      symbol: "TOTAL",
      strategy: "All trades",
      quantity: rows.length,
      price: 0,
      status: "Filled",
      settlementDate: "2026-07-03",
      tags: ["desk"],
    },
  ], [rows.length]);
  const importSampleCsv = () => {
    const imported = importGridDelimitedText<Trade>({
      text: [
        "desk,symbol,strategy,quantity,price,status,settlementDate,tags",
        "FX,KRW,Manual override,240,103.21,Open,2026-07-24,\"priority,review\"",
      ].join("\n"),
      columns,
      createRow: ({ rowIndex }) => ({
        id: `imported-${Date.now()}-${rowIndex}`,
        desk: "",
        symbol: "",
        strategy: "",
        quantity: 0,
        price: 0,
        status: "Open",
        settlementDate: "2026-07-03",
        tags: [],
      }),
    });

    setRows((currentRows) => [...imported.rows, ...currentRows]);
    setRowEvent(`Imported ${imported.rows.length} row`);
  };

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
            <button
              type="button"
              onClick={() => {
                saveGridState(window.localStorage, "youp-grid-demo-state", state);
                setRowEvent("Saved state");
              }}
            >
              Save state
            </button>
            <button
              type="button"
              onClick={() => {
                setState(loadGridState(window.localStorage, "youp-grid-demo-state", state));
                setRowEvent("Loaded state");
              }}
            >
              Load state
            </button>
            <button type="button" onClick={importSampleCsv}>
              Import CSV
            </button>
          </div>
        </div>
        <YoupGrid
          rows={gridRows}
          columns={columns}
          state={gridState}
          getRowId={(row) => row.id}
          pinnedTopRows={pinnedTopRows}
          pinnedBottomRows={pinnedBottomRows}
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
          onRowsChange={({ rows: nextRows, source }) => {
            if (source === "row-drag") {
              setRows(nextRows);
              setRowEvent("Reordered rows");
            }
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
          rowDragReorder={!serverMode && !cursorMode && !infiniteMode}
          loading={loading}
          loadingContent="Loading trades"
          error={error}
          errorContent="Unable to load trades"
          showColumnChooser
          showSizeColumnsToFit
          showCellContextMenu
          showFilters
          filterMode="advanced"
          columnPresets={[
            { id: "ops", label: "Ops", columnIds: ["desk", "symbol", "status", "settlementDate"] },
            { id: "risk", label: "Risk", columnIds: ["desk", "strategy", "quantity", "price", "status"] },
          ]}
          showPagination={!infiniteMode}
          showRowSelectionColumn
          detailRowHeight={132}
          renderRowDetail={({ row }) => (
            <div className="trade-detail">
              <section className="trade-detail__summary" aria-label={`${row.symbol} order summary`}>
                <span className="trade-detail__eyebrow">Order detail</span>
                <div className="trade-detail__title">
                  <strong>{row.symbol}</strong>
                  <span className={`trade-status trade-status--${row.status.toLowerCase()}`}>{row.status}</span>
                </div>
                <span>{row.strategy}</span>
              </section>
              <dl className="trade-detail__metrics">
                <div className="trade-detail__metric">
                  <dt>Desk</dt>
                  <dd>{row.desk}</dd>
                </div>
                <div className="trade-detail__metric">
                  <dt>Quantity</dt>
                  <dd>{formatInteger(row.quantity)} shares</dd>
                </div>
                <div className="trade-detail__metric">
                  <dt>Notional</dt>
                  <dd>{formatCurrency(row.quantity * row.price)}</dd>
                </div>
                <div className="trade-detail__metric">
                  <dt>Settlement</dt>
                  <dd>{row.settlementDate}</dd>
                </div>
                <div className="trade-detail__metric trade-detail__metric--wide">
                  <dt>Tags</dt>
                  <dd className="trade-detail__tags">
                    {row.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </dd>
                </div>
              </dl>
            </div>
          )}
          renderEditor={({ columnId, draftValue, setDraftValue, commit, cancel }) => {
            if (columnId !== "desk") {
              return undefined;
            }

            return (
              <input
                className="custom-strategy-editor"
                autoFocus
                value={draftValue}
                onChange={(event) => setDraftValue(event.currentTarget.value.toUpperCase())}
                onBlur={() => commit(undefined, "blur")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commit(event.currentTarget.value, "enter");
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    cancel();
                  }
                }}
              />
            );
          }}
          height={520}
        />
      </section>
      <section className="feature-gallery" aria-label="Feature gallery">
        {[
          "Date and datetime editors",
          "Advanced filter operators",
          "State persistence helpers",
          "CSV import and export",
          "Pinned top and bottom rows",
          "Row drag reorder",
          "Selection summary with totals",
          "Column presets, search, and fit",
          "Custom editor extension point",
          "React, Vue, and Vanilla adapters",
        ].map((feature) => (
          <article className="feature-gallery__item" key={feature}>
            <strong>{feature}</strong>
          </article>
        ))}
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}
