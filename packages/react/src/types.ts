import type {
  AggregationRule,
  ColumnDef,
  ColumnPin,
  CursorPaginationState,
  FilterOperator,
  FilterRule,
  FormulaCell,
  FormulaEngine,
  GridChartDataset,
  GridChartSpec,
  GridCellRange,
  GridRowId,
  GridRowModelType,
  GridState,
  ImportGridColumnMapping,
  ImportGridDelimitedTextIssue,
  ImportGridDelimitedTextRowResult,
  RemoteCacheState,
  PivotResultColumn,
  PivotResultRow,
  PivotModel,
  PivotState,
  ResolvedColumnDef,
  RowModel,
  RowGroupingState,
  RowNode,
} from "@youp-grid/core";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode, Ref } from "react";

export type YoupGridStateChange<TRow> = {
  state: GridState;
  rowModel: RowModel<TRow>;
};

export type YoupGridCellValueChange<TRow> = {
  row: TRow;
  rowId: GridRowId;
  rowIndex: number;
  column: ResolvedColumnDef<TRow>;
  columnId: string;
  value: unknown;
  previousValue: unknown;
  source: YoupGridCellValueChangeSource;
};

export type YoupGridCellValueChangeSource = "edit" | "paste" | "fill" | "delete" | "undo" | "redo" | "rollback";

export type YoupGridCellEditCommitReason = "enter" | "tab" | "blur";

export type YoupGridCellEditCommit<TRow> = Omit<
  YoupGridCellValueChange<TRow>,
  "source"
> & {
  reason: YoupGridCellEditCommitReason;
};

export type YoupGridCellsValueChangeSource = "paste" | "fill";

export type YoupGridCellsValueChange<TRow> = {
  changes: YoupGridCellValueChange<TRow>[];
  source: YoupGridCellsValueChangeSource;
};

export type YoupGridRowsChangeSource = "context-menu" | "clipboard" | "row-drag";
export type YoupGridImportDelimiter = "auto" | "," | "\t" | ";";

export type YoupGridRowInsertPosition = "above" | "below";

export type YoupGridRowCreateReason = "insert" | "paste";

export type YoupGridCreateRowContext<TRow> = {
  rows: readonly TRow[];
  rowIndex: number;
  visibleRowIndex: number;
  position: YoupGridRowInsertPosition;
  anchorRow: TRow;
  anchorRowId: GridRowId;
  anchorRowIndex: number;
  reason?: YoupGridRowCreateReason;
  sourceRow?: TRow;
  sourceRowId?: GridRowId;
  sourceRowIndex?: number;
  sourceVisibleRowIndex?: number;
};

export type YoupGridCreateImportRowContext = {
  rowIndex: number;
  sourceRowIndex: number;
  values: readonly string[];
  headers: readonly string[];
  fileName?: string;
};

export type YoupGridImportRows<TRow> = {
  file: File;
  text: string;
  delimiter: "," | "\t" | ";";
  headers: readonly string[];
  rows: readonly TRow[];
  sourceRows: readonly string[][];
  rowResults: readonly ImportGridDelimitedTextRowResult<TRow>[];
  issues: readonly ImportGridDelimitedTextIssue[];
  columnMappings: readonly ImportGridColumnMapping[];
};

export type YoupGridRowInsertChange<TRow> = {
  type: "insert";
  row: TRow;
  rowIndex: number;
  visibleRowIndex: number;
  position: YoupGridRowInsertPosition;
  anchorRow: TRow;
  anchorRowId: GridRowId;
  anchorRowIndex: number;
  reason?: YoupGridRowCreateReason;
  sourceRow?: TRow;
  sourceRowId?: GridRowId;
  sourceRowIndex?: number;
  sourceVisibleRowIndex?: number;
};

export type YoupGridRowDeleteChange<TRow> = {
  type: "delete";
  row: TRow;
  rowId: GridRowId;
  rowIndex: number;
  visibleRowIndex: number;
};

export type YoupGridRowChange<TRow> =
  | YoupGridRowInsertChange<TRow>
  | YoupGridRowDeleteChange<TRow>;

export type YoupGridRowsChange<TRow> = {
  rows: TRow[];
  changes: YoupGridRowChange<TRow>[];
  source: YoupGridRowsChangeSource;
};

export type YoupGridCellMetaStatus = "loading" | "error" | "warning" | "success";

export type YoupGridCellMeta = {
  status: YoupGridCellMetaStatus;
  message?: ReactNode;
};

export type YoupGridCellTooltipMode = "native" | "rich" | "none";

export type YoupGridCellTooltipOptions = {
  mode?: YoupGridCellTooltipMode;
  autoOpenCellKey?: string | null;
  autoOpenDurationMs?: number;
};

export type YoupGridCanEditCellContext<TRow> = {
  row: TRow;
  rowNode: RowNode<TRow>;
  rowId: GridRowId;
  rowIndex: number;
  column: ResolvedColumnDef<TRow>;
  columnId: string;
  value: unknown;
};

export type YoupGridDensity = "compact" | "standard" | "comfortable";
export type YoupGridFilterMode = "text" | "advanced";

export type YoupGridLocaleText = {
  noRows: string;
  loadingRows: string;
  loadError: string;
  columns: string;
  exportCsv: string;
  exportExcel: string;
  importFile: string;
  fitColumns: string;
  density: string;
  compact: string;
  standard: string;
  comfortable: string;
  previous: string;
  next: string;
  rows: string;
  rowNumber: string;
  selectVisibleRows: string;
  pageStatus: (page: number, pageCount: number, shown: number, matched: number) => string;
  cursorPageStatus: (shown: number, matched: number) => string;
};

export type YoupGridRowHeightContext<TRow> = {
  row: TRow;
  rowNode: RowNode<TRow>;
  rowId: GridRowId;
  rowIndex: number;
};

export type YoupGridApiCell = {
  rowIndex: number;
  columnIndex?: number;
  columnId?: string;
};

export type YoupGridApi = {
  getState: () => GridState;
  focusCell: (cell: YoupGridApiCell) => boolean;
  startEditing: (cell: YoupGridApiCell) => boolean;
  scrollToRow: (rowIndex: number, align?: "start" | "center" | "end" | "nearest") => boolean;
  selectRange: (range: GridCellRange | undefined) => void;
  exportCsv: () => string;
  exportExcel: () => string;
  resetState: () => void;
};

export type YoupGridColumnPreset = {
  id: string;
  label: string;
  columnIds: readonly string[];
};

export type YoupGridCustomEditorContext<TRow> = {
  row: TRow;
  rowNode: RowNode<TRow>;
  rowId: GridRowId;
  rowIndex: number;
  column: ResolvedColumnDef<TRow>;
  columnId: string;
  value: unknown;
  draftValue: string;
  editable: boolean;
  setDraftValue: (draftValue: string) => void;
  commit: (draftValue?: string, reason?: YoupGridCellEditCommitReason) => void;
  cancel: () => void;
};

export type YoupGridRowEvent<TRow> = {
  row: TRow;
  rowNode: RowNode<TRow>;
  rowId: GridRowId;
  rowIndex: number;
  event: ReactMouseEvent<HTMLDivElement>;
};

export type YoupGridRowDetailContext<TRow> = {
  row: TRow;
  rowNode: RowNode<TRow>;
  rowId: GridRowId;
  rowIndex: number;
  expanded: boolean;
  toggleExpanded: () => void;
};

export type YoupGridRowsEndReachedEvent<TRow> = {
  state: GridState;
  rowModel: RowModel<TRow>;
  rowCount: number;
  lastVisibleRowIndex: number;
  threshold: number;
  remainingRows: number;
};

export type YoupGridOptions<TRow> = {
  rows: readonly TRow[];
  columns: readonly ColumnDef<TRow>[];
  state?: GridState;
  defaultState?: GridState;
  onStateChange?: (change: YoupGridStateChange<TRow>) => void;
  getRowId?: (row: TRow, index: number) => GridRowId;
  treeData?: boolean;
  getParentRowId?: (row: TRow, index: number) => GridRowId | null | undefined;
  rowModelType?: GridRowModelType;
  serverRowCount?: number;
  serverFilteredRowCount?: number;
  serverPivotModel?: PivotModel;
  formulaEngine?: FormulaEngine;
  rowHeight?: number;
  getRowHeight?: (context: YoupGridRowHeightContext<TRow>) => number;
  overscan?: number;
  pinnedTopRows?: readonly TRow[];
  pinnedBottomRows?: readonly TRow[];
  infiniteScroll?: boolean;
  infiniteScrollThreshold?: number;
  infiniteScrollLoading?: boolean;
  hasMoreRows?: boolean;
};

export type YoupGridController<TRow> = {
  state: GridState;
  rowModel: RowModel<TRow>;
  setState: (state: GridState) => void;
  toggleSort: (columnId: string, multi?: boolean) => void;
  setSort: (columnId: string, direction: "asc" | "desc", multi?: boolean) => void;
  clearSort: (columnId: string) => void;
  setFilter: (columnId: string, value: unknown) => void;
  setFilterRule: (filter: FilterRule) => void;
  clearFilter: (columnId: string) => void;
  setPage: (pageIndex: number) => void;
  setPageSize: (pageSize: number) => void;
  setCursorPage: (cursor: string | undefined) => void;
  setCursorPageSize: (pageSize: number) => void;
  setCursorPagination: (cursorPagination: CursorPaginationState) => void;
  setAggregation: (aggregation: readonly AggregationRule[]) => void;
  setRowGrouping: (rowGrouping: RowGroupingState | undefined) => void;
  toggleRowGroupExpanded: (groupId: string) => void;
  setPivot: (pivot: PivotState | undefined) => void;
  togglePivotRowExpanded: (rowId: string) => void;
  setFormulaCell: (cell: FormulaCell) => void;
  clearFormulaCell: (rowId: GridRowId, columnId: string) => void;
  startRemoteRequest: (requestId: string) => void;
  finishRemoteRequest: (requestId: string) => void;
  failRemoteRequest: (requestId: string, error?: string) => void;
  cancelRemoteRequest: (requestId?: string) => void;
  setRemoteCache: (remoteCache: RemoteCacheState) => void;
  invalidateRemoteCache: (key?: string) => void;
  acknowledgeRemoteCache: (key?: string) => void;
  setColumnHidden: (columnId: string, hidden: boolean) => void;
  setColumnPinned: (columnId: string, pinned: ColumnPin | undefined) => void;
  setColumnOrder: (columnIds: readonly string[]) => void;
  setColumnWidth: (columnId: string, width: number) => void;
  setRowSelected: (rowId: GridRowId, selected: boolean) => void;
  setSelectedRows: (rowIds: readonly GridRowId[]) => void;
  toggleRowSelected: (rowId: GridRowId) => void;
  setTreeExpandedRows: (rowIds: readonly GridRowId[]) => void;
  toggleTreeRowExpanded: (rowId: GridRowId) => void;
};

export type YoupGridProps<TRow> = YoupGridOptions<TRow> & {
  apiRef?: Ref<YoupGridApi>;
  className?: string;
  style?: CSSProperties;
  height?: number | string;
  editable?: boolean;
  readOnly?: boolean;
  canEditCell?: (context: YoupGridCanEditCellContext<TRow>) => boolean;
  disabledReason?: ReactNode;
  showColumnChooser?: boolean;
  showColumnMenu?: boolean;
  showCsvExport?: boolean;
  showExcelExport?: boolean;
  showImport?: boolean;
  showDensityControl?: boolean;
  showSizeColumnsToFit?: boolean;
  showFilters?: boolean;
  filterMode?: YoupGridFilterMode;
  showAggregationFooter?: boolean;
  showPivotPanel?: boolean;
  showChartPanel?: boolean;
  chartSpec?: GridChartSpec;
  defaultChartSpec?: GridChartSpec;
  onChartSpecChange?: (spec: GridChartSpec) => void;
  chartRenderer?: YoupGridChartRenderer;
  chartLoading?: boolean;
  chartError?: string;
  onChartRetry?: () => void;
  onPivotDrilldown?: (context: YoupGridPivotDrilldownContext<TRow>) => void;
  onFormulaChange?: (cell: FormulaCell | undefined) => void;
  showPagination?: boolean;
  showRowNumberColumn?: boolean;
  showRowSelectionColumn?: boolean;
  pinRowSelectionColumn?: boolean;
  showCellContextMenu?: boolean;
  rowDragReorder?: boolean;
  detailRowHeight?: number;
  expandedDetailRowIds?: readonly GridRowId[];
  defaultExpandedDetailRowIds?: readonly GridRowId[];
  csvFileName?: string;
  excelFileName?: string;
  importAccept?: string;
  importDelimiter?: YoupGridImportDelimiter;
  importIncludeHeaders?: boolean;
  density?: YoupGridDensity;
  defaultDensity?: YoupGridDensity;
  onDensityChange?: (density: YoupGridDensity) => void;
  loading?: boolean;
  loadingContent?: ReactNode;
  error?: boolean;
  errorContent?: ReactNode;
  cellMeta?: Record<string, YoupGridCellMeta | undefined>;
  getCellMeta?: (context: YoupGridCanEditCellContext<TRow>) => YoupGridCellMeta | undefined;
  cellTooltip?: YoupGridCellTooltipOptions;
  renderCell?: (context: YoupGridCellContext<TRow>) => ReactNode;
  renderHeader?: (context: YoupGridHeaderContext<TRow>) => ReactNode;
  renderEditor?: (context: YoupGridCustomEditorContext<TRow>) => ReactNode;
  renderRowDetail?: (context: YoupGridRowDetailContext<TRow>) => ReactNode;
  isRowDetailAvailable?: (context: YoupGridRowDetailContext<TRow>) => boolean;
  onCellValueChange?: (change: YoupGridCellValueChange<TRow>) => void;
  onCellValueSave?: (change: YoupGridCellValueChange<TRow>, signal: AbortSignal) => Promise<void>;
  onCellValueSaveError?: (error: unknown, change: YoupGridCellValueChange<TRow>) => void;
  onCellEditCommit?: (commit: YoupGridCellEditCommit<TRow>) => void;
  onCellsValueChange?: (change: YoupGridCellsValueChange<TRow>) => void;
  createRow?: (context: YoupGridCreateRowContext<TRow>) => TRow;
  createImportRow?: (context: YoupGridCreateImportRowContext) => TRow;
  onImportRows?: (event: YoupGridImportRows<TRow>) => void;
  onRowsChange?: (change: YoupGridRowsChange<TRow>) => void;
  onRowClick?: (event: YoupGridRowEvent<TRow>) => void;
  onRowDoubleClick?: (event: YoupGridRowEvent<TRow>) => void;
  onDetailExpandedRowsChange?: (rowIds: readonly GridRowId[]) => void;
  onRowsEndReached?: (event: YoupGridRowsEndReachedEvent<TRow>) => void;
  columnPresets?: readonly YoupGridColumnPreset[];
  onColumnPresetApply?: (preset: YoupGridColumnPreset) => void;
  emptyContent?: ReactNode;
  locale?: string | readonly string[];
  localeText?: Partial<YoupGridLocaleText>;
  columnVirtualization?: boolean;
  columnOverscan?: number;
};

export type YoupGridChartRenderHandle = {
  destroy?: () => void;
  exportImage?: () => string;
};

export type YoupGridChartRenderer = (
  element: HTMLElement,
  dataset: GridChartDataset,
  spec: GridChartSpec,
) => void | (() => void) | YoupGridChartRenderHandle;

export type YoupGridPivotDrilldownContext<TRow> = {
  pivotRow: PivotResultRow;
  pivotColumn?: PivotResultColumn;
  rows: TRow[];
};

export type YoupGridCellContext<TRow> = {
  row: RowNode<TRow>;
  column: ResolvedColumnDef<TRow>;
  value: unknown;
  editing: boolean;
  focused: boolean;
  editable: boolean;
  meta?: YoupGridCellMeta;
  treeDepth?: number;
  hasChildren?: boolean;
  expanded?: boolean;
};

export type YoupGridHeaderContext<TRow> = {
  column: ResolvedColumnDef<TRow>;
  sorted: "asc" | "desc" | undefined;
  toggleSort: () => void;
};

export type YoupGridAdvancedFilterChange = {
  operator: FilterOperator;
  value?: unknown;
};
