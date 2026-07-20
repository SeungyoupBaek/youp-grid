import { useMemo, useState, type CSSProperties } from "react";
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

type TagOption = {
  value: string;
  label: string;
  color: string;
};

type DemoButtonIconName =
  | "alert"
  | "cursor"
  | "file-import"
  | "infinity"
  | "loader"
  | "package"
  | "play"
  | "release"
  | "save"
  | "server"
  | "upload";

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
const tagOptions: TagOption[] = [
  { value: "priority", label: "Priority", color: "#dc2626" },
  { value: "review", label: "Review", color: "#d97706" },
  { value: "auto", label: "Auto", color: "#2563eb" },
  { value: "desk", label: "Desk", color: "#64748b" },
  { value: "hedged", label: "Hedged", color: "#059669" },
];
const tagColorChoices = ["#dc2626", "#d97706", "#2563eb", "#64748b", "#059669", "#7c3aed"] as const;
const customTagColor = "#64748b";
const initialTagColors = Object.fromEntries(
  tagOptions.map((option) => [option.value, option.color]),
) as Record<string, string>;

function findTagOption(options: readonly TagOption[], tag: string) {
  const normalizedTag = tag.toLowerCase();

  return options.find((option) =>
    String(option.value).toLowerCase() === normalizedTag ||
    option.label.toLowerCase() === normalizedTag,
  );
}

function createCustomTagLabel(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseTagValues(value: unknown, options: readonly TagOption[] = tagOptions): string[] {
  return String(value)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => String(findTagOption(options, tag)?.value ?? tag));
}

function createTagOptions(rows: readonly Trade[], colors: Record<string, string>) {
  const options = new Map<string, TagOption>();

  tagOptions.forEach((option) => {
    options.set(option.value, {
      ...option,
      color: colors[option.value] ?? option.color,
    });
  });

  rows.forEach((row) => {
    row.tags.forEach((tag) => {
      const value = String(tag ?? "").trim();

      if (value.length === 0) {
        return;
      }

      const option = findTagOption(tagOptions, value);

      if (option) {
        return;
      }

      if (!options.has(value)) {
        options.set(value, {
          value,
          label: createCustomTagLabel(value),
          color: colors[value] ?? customTagColor,
        });
      }
    });
  });

  return Array.from(options.values());
}

function DemoButtonIcon({ name }: { name: DemoButtonIconName }) {
  return (
    <svg
      className="demo-button-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      aria-hidden="true"
      focusable="false"
    >
      {name === "alert" ? (
        <>
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
        </>
      ) : name === "cursor" ? (
        <>
          <path d="m4 4 7 16 2-7 7-2Z" />
          <path d="m13 13 5 5" />
        </>
      ) : name === "file-import" ? (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
          <path d="M12 18v-6" />
          <path d="m9 15 3 3 3-3" />
        </>
      ) : name === "infinity" ? (
        <path d="M6 16c-2.2 0-4-1.8-4-4s1.8-4 4-4c4 0 8 8 12 8 2.2 0 4-1.8 4-4s-1.8-4-4-4c-4 0-8 8-12 8Z" />
      ) : name === "loader" ? (
        <>
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="m4.9 4.9 2.8 2.8" />
          <path d="m16.3 16.3 2.8 2.8" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
        </>
      ) : name === "package" ? (
        <>
          <path d="m3 7 9 5 9-5" />
          <path d="m3 7 9-5 9 5v10l-9 5-9-5Z" />
          <path d="M12 12v10" />
        </>
      ) : name === "play" ? (
        <path d="m8 5 11 7-11 7Z" />
      ) : name === "release" ? (
        <>
          <path d="M20 13V7a2 2 0 0 0-2-2h-6L9 2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h7" />
          <path d="m17 22 4-4-4-4" />
          <path d="M21 18h-8" />
        </>
      ) : name === "save" ? (
        <>
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
          <path d="M17 21v-8H7v8" />
          <path d="M7 3v5h8" />
        </>
      ) : name === "server" ? (
        <>
          <rect width="18" height="8" x="3" y="3" rx="2" />
          <rect width="18" height="8" x="3" y="13" rx="2" />
          <path d="M7 7h.01" />
          <path d="M7 17h.01" />
        </>
      ) : (
        <>
          <path d="M12 3v12" />
          <path d="m8 7 4-4 4 4" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </>
      )}
    </svg>
  );
}

export function App() {
  const [rows, setRows] = useState(initialRows);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [serverMode, setServerMode] = useState(false);
  const [cursorMode, setCursorMode] = useState(false);
  const [infiniteMode, setInfiniteMode] = useState(false);
  const [infiniteRowLimit, setInfiniteRowLimit] = useState(300);
  const [tagColors, setTagColors] = useState<Record<string, string>>(initialTagColors);
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
  const coloredTagOptions = useMemo(() => createTagOptions(rows, tagColors), [rows, tagColors]);
  const getResolvedTagOption = (tag: string) =>
    findTagOption(coloredTagOptions, tag);
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
        options: coloredTagOptions,
        valueParser: (value) => parseTagValues(value, coloredTagOptions),
        placeholder: "Add tag",
      },
    ],
    [coloredTagOptions],
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
            <DemoButtonIcon name="play" />
            Try demo
          </a>
          <a
            className="site-header__button"
            href="https://www.npmjs.com/package/@youp-grid/react"
            rel="noreferrer"
            target="_blank"
          >
            <DemoButtonIcon name="package" />
            npm React
          </a>
          <a
            className="site-header__button"
            href="#docs"
          >
            <DemoButtonIcon name="package" />
            Docs
          </a>
          <a
            className="site-header__button"
            href="https://github.com/SeungyoupBaek/youp-grid/releases"
            rel="noreferrer"
            target="_blank"
          >
            <DemoButtonIcon name="release" />
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
              <DemoButtonIcon name="loader" />
              Loading
            </button>
            <button
              type="button"
              aria-pressed={error}
              onClick={() => setError((current) => !current)}
            >
              <DemoButtonIcon name="alert" />
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
              <DemoButtonIcon name="server" />
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
              <DemoButtonIcon name="cursor" />
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
              <DemoButtonIcon name="infinity" />
              Infinite rows
            </button>
            <button
              type="button"
              onClick={() => {
                saveGridState(window.localStorage, "youp-grid-demo-state", state);
                setRowEvent("Saved state");
              }}
            >
              <DemoButtonIcon name="save" />
              Save state
            </button>
            <button
              type="button"
              onClick={() => {
                setState(loadGridState(window.localStorage, "youp-grid-demo-state", state));
                setRowEvent("Loaded state");
              }}
            >
              <DemoButtonIcon name="upload" />
              Load state
            </button>
            <button type="button" onClick={importSampleCsv}>
              <DemoButtonIcon name="file-import" />
              Import CSV
            </button>
          </div>
        </div>
        <div className="tag-color-panel" aria-label="Tag color controls">
          {coloredTagOptions.map((tag) => (
            <div className="tag-color-panel__item" key={tag.value}>
              <span className="tag-color-panel__label">{tag.label}</span>
              <div className="tag-color-panel__swatches">
                {tagColorChoices.map((color) => (
                  <button
                    type="button"
                    className="tag-color-panel__swatch"
                    key={color}
                    aria-label={`${tag.label} ${color}`}
                    aria-pressed={tag.color === color}
                    onClick={() => {
                      setTagColors((current) => ({
                        ...current,
                        [String(tag.value)]: color,
                      }));
                    }}
                    style={{ "--tag-color-swatch": color } as CSSProperties}
                  />
                ))}
              </div>
            </div>
          ))}
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
          detailRowHeight={152}
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
                    {row.tags.map((tag) => {
                      const option = getResolvedTagOption(tag);
                      const color = option?.color ?? "#94a3b8";

                      return (
                        <span
                          className="trade-detail__tag"
                          key={tag}
                          style={{ "--trade-detail-tag-color": color } as CSSProperties}
                        >
                          <span className="trade-detail__tag-color" aria-hidden="true" />
                          {option?.label ?? tag}
                        </span>
                      );
                    })}
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
          "Async validation and save rollback",
          "Variable row and column virtualization",
          "Imperative Grid API and locale text",
          "Column presets, search, and fit",
          "Custom editor extension point",
          "React, Vue, and Vanilla adapters",
        ].map((feature) => (
          <article className="feature-gallery__item" key={feature}>
            <strong>{feature}</strong>
          </article>
        ))}
      </section>
      <section className="docs-index" id="docs" aria-labelledby="docs-title">
        <div>
          <p className="docs-index__eyebrow">Documentation</p>
          <h2 id="docs-title">Build against stable grid contracts</h2>
          <p>
            Start with the public API, then use the adapter guide and migration notes for framework-specific integration.
          </p>
        </div>
        <nav className="docs-index__links" aria-label="Documentation links">
          <a href="https://github.com/SeungyoupBaek/youp-grid/blob/main/docs/API.md">Public API</a>
          <a href="https://github.com/SeungyoupBaek/youp-grid/blob/main/docs/REACT_ADAPTER.md">React guide</a>
          <a href="https://github.com/SeungyoupBaek/youp-grid/blob/main/docs/MIGRATION.md">Migration</a>
          <a href="https://github.com/SeungyoupBaek/youp-grid/blob/main/docs/ROADMAP.md">Roadmap</a>
        </nav>
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
