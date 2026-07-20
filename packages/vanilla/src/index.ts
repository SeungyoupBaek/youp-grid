import {
  buildRowModel,
  buildGridChartDataset,
  clearFormulaCell,
  createGridState,
  exportGridCsv,
  exportGridExcel,
  isCellInRange,
  getRowNodeValue,
  getPivotDisplayRows,
  setFormulaCell,
  setPivot,
  togglePivotRowExpanded,
  setRowSelected,
  type ColumnDef,
  type FormulaCell,
  type FormulaEngine,
  type GridChartDataset,
  type GridChartSpec,
  type GridCellRange,
  type GridRowId,
  type GridRowModelType,
  type GridState,
  type ResolvedColumnDef,
  type RowModel,
  type RowNode,
  type PivotState,
  type PivotModel,
} from "@youp-grid/core";

export type YoupVanillaGridLocaleText = {
  noRows: string;
  loadingRows: string;
  loadError: string;
  selectRow: (rowIndex: number) => string;
};

export type YoupVanillaGridOptions<TRow> = {
  rows: readonly TRow[];
  columns: readonly ColumnDef<TRow>[];
  state?: GridState;
  defaultState?: GridState;
  getRowId?: (row: TRow, index: number) => GridRowId;
  pinnedTopRows?: readonly TRow[];
  pinnedBottomRows?: readonly TRow[];
  rowModelType?: GridRowModelType;
  serverRowCount?: number;
  serverFilteredRowCount?: number;
  serverPivotModel?: PivotModel;
  formulaEngine?: FormulaEngine;
  className?: string;
  emptyText?: string;
  loading?: boolean;
  loadingText?: string;
  error?: boolean | string | Error;
  errorText?: string;
  rowHeight?: number;
  getRowHeight?: (row: TRow, rowId: GridRowId, rowIndex: number) => number;
  showRowSelectionColumn?: boolean;
  locale?: string | readonly string[];
  localeText?: Partial<YoupVanillaGridLocaleText>;
  onStateChange?: (state: GridState, rowModel: RowModel<TRow>) => void;
  onRowClick?: (row: TRow, rowId: GridRowId) => void;
};

export type YoupVanillaGridCell = {
  rowIndex: number;
  columnIndex: number;
};

export type YoupVanillaGrid<TRow> = {
  update: (options: Partial<YoupVanillaGridOptions<TRow>>) => void;
  getState: () => GridState;
  setState: (state: GridState) => void;
  resetState: () => void;
  focusCell: (cell: YoupVanillaGridCell) => boolean;
  scrollToRow: (rowIndex: number) => boolean;
  selectRow: (rowId: GridRowId, selected?: boolean) => void;
  selectRange: (range: GridCellRange | undefined) => void;
  exportCsv: () => string;
  exportExcel: () => string;
  setPivot: (pivot: PivotState | undefined) => void;
  setFormulaCell: (cell: FormulaCell) => void;
  clearFormulaCell: (rowId: GridRowId, columnId: string) => void;
  getChartDataset: (spec: GridChartSpec) => GridChartDataset;
  destroy: () => void;
};

const DEFAULT_LOCALE_TEXT: YoupVanillaGridLocaleText = {
  noRows: "No rows",
  loadingRows: "Loading rows",
  loadError: "Unable to load rows",
  selectRow: (rowIndex) => `Select row ${rowIndex + 1}`,
};

export function createYoupGrid<TRow>(
  root: HTMLElement,
  options: YoupVanillaGridOptions<TRow>,
): YoupVanillaGrid<TRow> {
  let currentOptions = { ...options };
  let currentState = createGridState(options.state ?? options.defaultState);
  let selectionRange: GridCellRange | undefined;
  let rowModel = buildModel(currentOptions, currentState);

  const render = () => {
    rowModel = buildModel(currentOptions, currentState);
    root.replaceChildren(renderGrid(
      currentOptions,
      currentState,
      rowModel,
      selectionRange,
      (rowId, selected) => commitState(setRowSelected(currentState, rowId, selected)),
      (rowId) => commitState(togglePivotRowExpanded(currentState, rowId)),
    ));
  };
  const commitState = (state: GridState) => {
    currentState = createGridState(state);
    render();
    currentOptions.onStateChange?.(currentState, rowModel);
  };

  root.classList.add("youp-grid-vanilla");
  root.setAttribute("role", "grid");
  render();

  return {
    update: (nextOptions) => {
      currentOptions = { ...currentOptions, ...nextOptions };
      if (nextOptions.state) {
        currentState = createGridState(nextOptions.state);
      }
      render();
    },
    getState: () => currentState,
    setState: commitState,
    resetState: () => commitState(createGridState(currentOptions.defaultState)),
    focusCell: (cell) => {
      const element = root.querySelector<HTMLElement>(
        `[data-youp-row-index="${cell.rowIndex}"][data-youp-column-index="${cell.columnIndex}"]`,
      );
      if (!element) {
        return false;
      }
      element.focus({ preventScroll: true });
      element.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    },
    scrollToRow: (rowIndex) => {
      const element = root.querySelector<HTMLElement>(`[data-youp-row-index="${rowIndex}"]`);
      if (!element) {
        return false;
      }
      element.scrollIntoView({ block: "nearest" });
      return true;
    },
    selectRow: (rowId, selected) => {
      const isSelected = currentState.selectedRowIds?.includes(rowId) ?? false;
      commitState(setRowSelected(currentState, rowId, selected ?? !isSelected));
    },
    selectRange: (range) => {
      selectionRange = range;
      render();
    },
    exportCsv: () => exportGridCsv({ rows: rowModel.visibleRows, columns: rowModel.visibleColumns }),
    exportExcel: () => exportGridExcel({ rows: rowModel.visibleRows, columns: rowModel.visibleColumns }),
    setPivot: (pivot) => commitState(setPivot(currentState, pivot)),
    setFormulaCell: (cell) => commitState(setFormulaCell(currentState, cell)),
    clearFormulaCell: (rowId, columnId) => commitState(clearFormulaCell(currentState, rowId, columnId)),
    getChartDataset: (spec) => buildGridChartDataset({
      rows: rowModel.filteredRows,
      columns: rowModel.visibleColumns,
      selectionRange,
      pivot: rowModel.pivot,
      spec,
    }),
    destroy: () => {
      root.classList.remove("youp-grid-vanilla");
      root.removeAttribute("role");
      root.replaceChildren();
    },
  };
}

function buildModel<TRow>(options: YoupVanillaGridOptions<TRow>, state: GridState) {
  return buildRowModel({
    rows: options.rows,
    columns: options.columns,
    state,
    getRowId: options.getRowId,
    pinnedTopRows: options.pinnedTopRows,
    pinnedBottomRows: options.pinnedBottomRows,
    rowModelType: options.rowModelType,
    serverRowCount: options.serverRowCount,
    serverFilteredRowCount: options.serverFilteredRowCount,
    serverPivotModel: options.serverPivotModel,
    formulaEngine: options.formulaEngine,
  });
}

function renderGrid<TRow>(
  options: YoupVanillaGridOptions<TRow>,
  state: GridState,
  rowModel: RowModel<TRow>,
  selectionRange?: GridCellRange,
  onSelectRow?: (rowId: GridRowId, selected: boolean) => void,
  onTogglePivotRow?: (rowId: string) => void,
): HTMLElement {
  const fragment = document.createElement("div");
  const columns = rowModel.visibleColumns;
  const localeText = { ...DEFAULT_LOCALE_TEXT, ...options.localeText };
  const numberFormatter = new Intl.NumberFormat(options.locale ?? "en-US");

  fragment.className = options.className ?? "";
  if (state.pivot?.enabled && rowModel.pivot) {
    fragment.append(renderPivotModel(rowModel.pivot, onTogglePivotRow));
    return fragment;
  }
  fragment.append(renderHeader(columns, options.showRowSelectionColumn ?? false));
  rowModel.pinnedTopRows.forEach((row, index) => {
    fragment.append(renderRow(row, -index - 1, columns, "top", options, state, localeText, numberFormatter, undefined, onSelectRow));
  });

  if (rowModel.visibleRows.length === 0) {
    fragment.append(renderMessage(options.emptyText ?? localeText.noRows, "status"));
  } else {
    rowModel.visibleRows.forEach((row, rowIndex) => {
      fragment.append(renderRow(row, rowIndex, columns, "body", options, state, localeText, numberFormatter, selectionRange, onSelectRow));
    });
  }

  rowModel.pinnedBottomRows.forEach((row, index) => {
    fragment.append(renderRow(row, rowModel.visibleRows.length + index, columns, "bottom", options, state, localeText, numberFormatter, undefined, onSelectRow));
  });

  if (options.error) {
    fragment.append(renderMessage(
      options.errorText ?? (typeof options.error === "string" ? options.error : localeText.loadError),
      "alert",
    ));
  } else if (options.loading) {
    fragment.append(renderMessage(options.loadingText ?? localeText.loadingRows, "status"));
  }

  return fragment;
}

function renderHeader<TRow>(
  columns: readonly ResolvedColumnDef<TRow>[],
  showSelection: boolean,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "youp-grid-vanilla__row youp-grid-vanilla__row--header";
  row.setAttribute("role", "row");

  if (showSelection) {
    row.append(renderSelectionPlaceholder());
  }

  columns.forEach((column) => {
    const cell = document.createElement("div");
    cell.className = "youp-grid-vanilla__cell";
    cell.setAttribute("role", "columnheader");
    setColumnWidth(cell, column);
    cell.textContent = column.headerName;
    row.append(cell);
  });

  return row;
}

function renderRow<TRow>(
  rowNode: RowNode<TRow>,
  rowIndex: number,
  columns: readonly ResolvedColumnDef<TRow>[],
  placement: "top" | "body" | "bottom",
  options: YoupVanillaGridOptions<TRow>,
  state: GridState,
  localeText: YoupVanillaGridLocaleText,
  numberFormatter: Intl.NumberFormat,
  selectionRange?: GridCellRange,
  onSelectRow?: (rowId: GridRowId, selected: boolean) => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = [
    "youp-grid-vanilla__row",
    placement === "body" ? "" : "youp-grid-vanilla__row--pinned",
    state.selectedRowIds?.includes(rowNode.id) ? "youp-grid-vanilla__row--selected" : "",
  ].filter(Boolean).join(" ");
  row.setAttribute("role", "row");
  row.dataset.youpRowIndex = String(rowIndex);
  const rowHeight = options.getRowHeight?.(rowNode.original, rowNode.id, rowIndex) ?? options.rowHeight;
  if (rowHeight) {
    row.style.minHeight = `${Math.max(1, rowHeight)}px`;
  }
  row.addEventListener("click", () => options.onRowClick?.(rowNode.original, rowNode.id));

  if (options.showRowSelectionColumn) {
    const selectionCell = renderSelectionPlaceholder();
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.selectedRowIds?.includes(rowNode.id) ?? false;
    checkbox.setAttribute("aria-label", localeText.selectRow(rowIndex));
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => onSelectRow?.(rowNode.id, checkbox.checked));
    selectionCell.append(checkbox);
    row.append(selectionCell);
  }

  columns.forEach((column, columnIndex) => {
    const cell = document.createElement("div");
    const value = getRowNodeValue(rowNode, column);
    cell.className = [
      "youp-grid-vanilla__cell",
      column.wrapText ? "youp-grid-vanilla__cell--wrap-text" : "",
      selectionRange && isCellInRange(rowIndex, columnIndex, selectionRange)
        ? "youp-grid-vanilla__cell--range-selected"
        : "",
    ].filter(Boolean).join(" ");
    cell.setAttribute("role", "gridcell");
    cell.tabIndex = -1;
    cell.dataset.youpRowIndex = String(rowIndex);
    cell.dataset.youpColumnIndex = String(columnIndex);
    cell.dataset.youpColumnId = column.id;
    setColumnWidth(cell, column);
    cell.textContent = column.valueFormatter
      ? column.valueFormatter(value, rowNode.original)
      : typeof value === "number"
        ? numberFormatter.format(value)
        : String(value ?? "");
    row.append(cell);
  });

  return row;
}

function renderPivotModel(
  model: NonNullable<RowModel<unknown>["pivot"]>,
  onToggleRow?: (rowId: string) => void,
): HTMLElement {
  const container = document.createElement("div");
  const table = document.createElement("table");
  const header = table.createTHead().insertRow();
  container.className = "youp-grid-vanilla__pivot-view";
  container.setAttribute("role", "region");
  container.setAttribute("aria-label", "Pivot results");
  header.append(document.createElement("th"));
  header.cells[0]!.textContent = "Group";
  model.columns.forEach((column) => {
    const cell = document.createElement("th");
    cell.textContent = column.headerName;
    header.append(cell);
  });
  const body = table.createTBody();
  const rows = getPivotDisplayRows(model);
  rows.forEach((pivotRow) => {
    const row = body.insertRow();
    row.className = pivotRow.isGrandTotal
      ? "youp-grid-vanilla__pivot-grand-total"
      : pivotRow.isSubtotal ? "youp-grid-vanilla__pivot-subtotal" : "";
    const label = document.createElement("th");
    label.style.paddingLeft = `${12 + pivotRow.depth * 18}px`;
    if (pivotRow.isSubtotal) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.textContent = pivotRow.expanded ? "-" : "+";
      toggle.setAttribute("aria-expanded", String(pivotRow.expanded));
      toggle.addEventListener("click", () => onToggleRow?.(pivotRow.id));
      label.append(toggle);
    }
    label.append(document.createTextNode(`${pivotRow.label} (${pivotRow.rowCount.toLocaleString()})`));
    row.append(label);
    model.columns.forEach((column) => {
      const cell = row.insertCell();
      cell.textContent = pivotRow.values[column.id]?.toLocaleString(undefined, { maximumFractionDigits: 4 }) ?? "";
    });
  });
  container.append(table);
  return container;
}

function renderSelectionPlaceholder(): HTMLElement {
  const cell = document.createElement("div");
  cell.className = "youp-grid-vanilla__cell youp-grid-vanilla__selection-cell";
  cell.setAttribute("role", "gridcell");
  cell.style.setProperty("--youp-grid-vanilla-column-width", "44px");
  return cell;
}

function renderMessage(text: string, role: "status" | "alert"): HTMLElement {
  const message = document.createElement("div");
  message.className = "youp-grid-vanilla__message";
  message.setAttribute("role", role);
  message.textContent = text;
  return message;
}

function setColumnWidth<TRow>(cell: HTMLElement, column: ResolvedColumnDef<TRow>) {
  cell.style.setProperty("--youp-grid-vanilla-column-width", `${column.width ?? 160}px`);
}
