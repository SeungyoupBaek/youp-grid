import {
  buildRowModel,
  type ColumnDef,
  type GridRowId,
  type GridState,
  type ResolvedColumnDef,
} from "@youp-grid/core";

export type YoupVanillaGridOptions<TRow> = {
  rows: readonly TRow[];
  columns: readonly ColumnDef<TRow>[];
  state?: GridState;
  getRowId?: (row: TRow, index: number) => GridRowId;
  pinnedTopRows?: readonly TRow[];
  pinnedBottomRows?: readonly TRow[];
  className?: string;
  emptyText?: string;
  onRowClick?: (row: TRow, rowId: GridRowId) => void;
};

export type YoupVanillaGrid<TRow> = {
  update: (options: Partial<YoupVanillaGridOptions<TRow>>) => void;
  destroy: () => void;
};

export function createYoupGrid<TRow>(
  root: HTMLElement,
  options: YoupVanillaGridOptions<TRow>,
): YoupVanillaGrid<TRow> {
  let currentOptions = { ...options };

  const render = () => {
    root.replaceChildren(renderGrid(currentOptions));
  };

  root.classList.add("youp-grid-vanilla");
  render();

  return {
    update: (nextOptions) => {
      currentOptions = { ...currentOptions, ...nextOptions };
      render();
    },
    destroy: () => {
      root.classList.remove("youp-grid-vanilla");
      root.replaceChildren();
    },
  };
}

function renderGrid<TRow>(options: YoupVanillaGridOptions<TRow>): HTMLElement {
  const fragment = document.createElement("div");
  const rowModel = buildRowModel({
    rows: options.rows,
    columns: options.columns,
    state: options.state,
    getRowId: options.getRowId,
    pinnedTopRows: options.pinnedTopRows,
    pinnedBottomRows: options.pinnedBottomRows,
  });
  const columns = rowModel.visibleColumns;

  fragment.className = options.className ?? "";
  fragment.append(renderHeader(columns));
  rowModel.pinnedTopRows.forEach((row) => fragment.append(renderRow(row.original, row.id, columns, "top", options)));

  if (rowModel.visibleRows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "youp-grid-vanilla__cell";
    empty.textContent = options.emptyText ?? "No rows";
    fragment.append(empty);
  } else {
    rowModel.visibleRows.forEach((row) => {
      fragment.append(renderRow(row.original, row.id, columns, "body", options));
    });
  }

  rowModel.pinnedBottomRows.forEach((row) => {
    fragment.append(renderRow(row.original, row.id, columns, "bottom", options));
  });

  return fragment;
}

function renderHeader<TRow>(columns: readonly ResolvedColumnDef<TRow>[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "youp-grid-vanilla__row youp-grid-vanilla__row--header";
  row.setAttribute("role", "row");

  columns.forEach((column) => {
    const cell = document.createElement("div");
    cell.className = "youp-grid-vanilla__cell";
    cell.setAttribute("role", "columnheader");
    cell.style.setProperty("--youp-grid-vanilla-column-width", `${column.width ?? 160}px`);
    cell.textContent = column.headerName;
    row.append(cell);
  });

  return row;
}

function renderRow<TRow>(
  rowData: TRow,
  rowId: GridRowId,
  columns: readonly ResolvedColumnDef<TRow>[],
  placement: "top" | "body" | "bottom",
  options: YoupVanillaGridOptions<TRow>,
): HTMLElement {
  const row = document.createElement("div");
  row.className = [
    "youp-grid-vanilla__row",
    placement === "body" ? "" : "youp-grid-vanilla__row--pinned",
  ].filter(Boolean).join(" ");
  row.setAttribute("role", "row");
  row.addEventListener("click", () => options.onRowClick?.(rowData, rowId));

  columns.forEach((column) => {
    const cell = document.createElement("div");
    const value = column.accessor(rowData);
    cell.className = "youp-grid-vanilla__cell";
    cell.setAttribute("role", "gridcell");
    cell.style.setProperty("--youp-grid-vanilla-column-width", `${column.width ?? 160}px`);
    cell.textContent = column.valueFormatter ? column.valueFormatter(value, rowData) : String(value ?? "");
    row.append(cell);
  });

  return row;
}
