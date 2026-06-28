import type {
  AggregationRule,
  ColumnDef,
  ColumnPin,
  CursorPaginationState,
  GridRowId,
  GridRowModelType,
  GridState,
  RemoteCacheState,
  ResolvedColumnDef,
  RowModel,
  RowGroupingState,
  RowNode,
} from "@youp-grid/core";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";

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

export type YoupGridCellValueChangeSource = "edit" | "paste" | "fill" | "delete" | "undo" | "redo";

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

export type YoupGridRowsChangeSource = "context-menu" | "clipboard";

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

export type YoupGridRowEvent<TRow> = {
  row: TRow;
  rowNode: RowNode<TRow>;
  rowId: GridRowId;
  rowIndex: number;
  event: ReactMouseEvent<HTMLDivElement>;
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
  rowHeight?: number;
  overscan?: number;
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
  setColumnWidth: (columnId: string, width: number) => void;
  setRowSelected: (rowId: GridRowId, selected: boolean) => void;
  setSelectedRows: (rowIds: readonly GridRowId[]) => void;
  toggleRowSelected: (rowId: GridRowId) => void;
  setTreeExpandedRows: (rowIds: readonly GridRowId[]) => void;
  toggleTreeRowExpanded: (rowId: GridRowId) => void;
};

export type YoupGridProps<TRow> = YoupGridOptions<TRow> & {
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
  showDensityControl?: boolean;
  showFilters?: boolean;
  showAggregationFooter?: boolean;
  showPagination?: boolean;
  showRowNumberColumn?: boolean;
  showRowSelectionColumn?: boolean;
  pinRowSelectionColumn?: boolean;
  showCellContextMenu?: boolean;
  csvFileName?: string;
  excelFileName?: string;
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
  onCellValueChange?: (change: YoupGridCellValueChange<TRow>) => void;
  onCellEditCommit?: (commit: YoupGridCellEditCommit<TRow>) => void;
  onCellsValueChange?: (change: YoupGridCellsValueChange<TRow>) => void;
  createRow?: (context: YoupGridCreateRowContext<TRow>) => TRow;
  onRowsChange?: (change: YoupGridRowsChange<TRow>) => void;
  onRowClick?: (event: YoupGridRowEvent<TRow>) => void;
  onRowDoubleClick?: (event: YoupGridRowEvent<TRow>) => void;
  onRowsEndReached?: (event: YoupGridRowsEndReachedEvent<TRow>) => void;
  emptyContent?: ReactNode;
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
