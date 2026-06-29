import type {
  AggregationRule,
  ColumnDef,
  ColumnAlign,
  ColumnPin,
  CursorPaginationState,
  GridRowId,
  GridRowModelType,
  GridState,
  RemoteCacheState,
  ResolvedColumnDef,
  RowGroupingState,
  RowNode,
  RowModel,
  SortDirection,
} from "@youp-grid/core";
import type { ComputedRef, StyleValue, VNodeChild } from "vue";

export type YoupGridStateChange<TRow> = {
  state: GridState;
  rowModel: RowModel<TRow>;
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
  rowHeight?: number;
  overscan?: number;
  infiniteScroll?: boolean;
  infiniteScrollThreshold?: number;
  infiniteScrollLoading?: boolean;
  hasMoreRows?: boolean;
};

export type YoupGridDensity = "compact" | "standard" | "comfortable";

export type YoupGridComponentProps<TRow> = YoupGridOptions<TRow> & {
  className?: string;
  style?: StyleValue;
  height?: number | string;
  emptyText?: string;
  emptyContent?: VNodeChild;
  loading?: boolean;
  loadingContent?: VNodeChild;
  error?: VNodeChild;
  errorContent?: VNodeChild;
  pagination?: boolean | YoupGridPaginationOptions;
  showPagination?: boolean;
  sortOnHeaderClick?: boolean;
  showColumnChooser?: boolean;
  showCsvExport?: boolean;
  showExcelExport?: boolean;
  showDensityControl?: boolean;
  showFilters?: boolean;
  csvFileName?: string;
  excelFileName?: string;
  density?: YoupGridDensity;
  defaultDensity?: YoupGridDensity;
  onDensityChange?: (density: YoupGridDensity) => void;
  showRowNumberColumn?: boolean;
  showRowSelectionColumn?: boolean;
  pinRowSelectionColumn?: boolean;
  showCellContextMenu?: boolean;
  detailRowHeight?: number;
  expandedDetailRowIds?: readonly GridRowId[];
  defaultExpandedDetailRowIds?: readonly GridRowId[];
  isRowDetailAvailable?: (context: YoupGridRowDetailSlotContext<TRow>) => boolean;
  editable?: boolean;
  readOnly?: boolean;
  canEditCell?: (context: YoupGridCanEditCellContext<TRow>) => boolean;
  disabledReason?: VNodeChild;
  createRow?: (context: YoupGridCreateRowContext<TRow>) => TRow;
  cellMeta?: Record<string, YoupGridCellMeta | undefined>;
  getCellMeta?: (context: YoupGridCanEditCellContext<TRow>) => YoupGridCellMeta | undefined;
  cellTooltip?: YoupGridCellTooltipOptions;
};

export type YoupGridPaginationOptions = {
  pageSizeOptions?: readonly number[];
};

export type YoupGridHeaderSlotContext<TRow> = {
  column: ResolvedColumnDef<TRow>;
  columnId: string;
  columnIndex: number;
  align: ColumnAlign;
  sortDirection?: SortDirection;
  resizeColumn: (width: number) => void;
  autoSizeColumn: () => void;
};

export type YoupGridCellSlotContext<TRow> = {
  row: TRow;
  rowId: GridRowId;
  rowIndex: number;
  column: ResolvedColumnDef<TRow>;
  columnId: string;
  columnIndex: number;
  value: unknown;
  formattedValue: string;
  align: ColumnAlign;
  editable: boolean;
  meta?: YoupGridCellMeta;
};

export type YoupGridRowDetailSlotContext<TRow> = {
  row: TRow;
  rowId: GridRowId;
  rowIndex: number;
  rowNode: RowNode<TRow>;
  expanded: boolean;
  toggleExpanded: () => void;
};

export type YoupGridCellMetaStatus = "loading" | "error" | "warning" | "success";

export type YoupGridCellMeta = {
  status: YoupGridCellMetaStatus;
  message?: VNodeChild;
};

export type YoupGridCellTooltipMode = "native" | "rich" | "none";

export type YoupGridCellTooltipOptions = {
  mode?: YoupGridCellTooltipMode;
  autoOpenCellKey?: string | null;
  autoOpenDurationMs?: number;
};

export type YoupGridRowEvent<TRow> = {
  row: TRow;
  rowId: GridRowId;
  rowIndex: number;
  rowNode: RowNode<TRow>;
  event: MouseEvent;
};

export type YoupGridCanEditCellContext<TRow> = {
  row: TRow;
  rowId: GridRowId;
  rowIndex: number;
  rowNode: RowNode<TRow>;
  column: ResolvedColumnDef<TRow>;
  columnId: string;
  value: unknown;
};

export type YoupGridCellValueChangeSource = "edit" | "delete" | "paste" | "fill" | "undo" | "redo";

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

export type YoupGridCellsValueChangeSource = "paste" | "fill";

export type YoupGridCellsValueChange<TRow> = {
  changes: YoupGridCellValueChange<TRow>[];
  source: YoupGridCellsValueChangeSource;
};

export type YoupGridCellEditCommitReason = "enter" | "tab" | "blur";

export type YoupGridCellEditCommit<TRow> = Omit<
  YoupGridCellValueChange<TRow>,
  "source"
> & {
  reason: YoupGridCellEditCommitReason;
};

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

export type YoupGridRowInsertChange<TRow> = {
  type: "insert";
  row: TRow;
  rowId?: GridRowId;
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

export type YoupGridRowChange<TRow> = YoupGridRowInsertChange<TRow> | YoupGridRowDeleteChange<TRow>;

export type YoupGridRowsChange<TRow> = {
  rows: TRow[];
  changes: YoupGridRowChange<TRow>[];
  source: "context-menu" | "clipboard";
};

export type YoupGridRowsEndReachedEvent<TRow> = {
  state: GridState;
  rowModel: RowModel<TRow>;
  rowCount: number;
  lastVisibleRowIndex: number;
  threshold: number;
  remainingRows: number;
};

export type YoupGridController<TRow> = {
  state: ComputedRef<GridState>;
  rowModel: ComputedRef<RowModel<TRow>>;
  setState: (state: GridState) => void;
  toggleSort: (columnId: string, multi?: boolean) => void;
  setSort: (columnId: string, direction: "asc" | "desc", multi?: boolean) => void;
  clearSort: (columnId: string) => void;
  setFilter: (columnId: string, value: unknown) => void;
  clearFilter: (columnId: string) => void;
  setPage: (pageIndex: number) => void;
  setPageSize: (pageSize: number) => void;
  setCursorPage: (cursor: string | undefined) => void;
  setCursorPageSize: (pageSize: number) => void;
  setCursorPagination: (cursorPagination: CursorPaginationState) => void;
  setAggregation: (aggregation: readonly AggregationRule[]) => void;
  setRowGrouping: (rowGrouping: RowGroupingState | undefined) => void;
  toggleRowGroupExpanded: (groupId: string) => void;
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
