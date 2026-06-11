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
  RowModel,
  SortDirection,
} from "@youp-grid/core";
import type { ComputedRef, VNodeChild } from "vue";

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
};

export type YoupGridComponentProps<TRow> = YoupGridOptions<TRow> & {
  emptyText?: string;
  pagination?: boolean | YoupGridPaginationOptions;
  sortOnHeaderClick?: boolean;
  showRowNumberColumn?: boolean;
  showRowSelectionColumn?: boolean;
  pinRowSelectionColumn?: boolean;
  showCellContextMenu?: boolean;
  editable?: boolean;
  readOnly?: boolean;
  canEditCell?: (context: YoupGridCanEditCellContext<TRow>) => boolean;
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
};

export type YoupGridCanEditCellContext<TRow> = {
  row: TRow;
  rowId: GridRowId;
  rowIndex: number;
  column: ResolvedColumnDef<TRow>;
  columnId: string;
  value: unknown;
};

export type YoupGridCellValueChange<TRow> = {
  row: TRow;
  rowId: GridRowId;
  rowIndex: number;
  column: ResolvedColumnDef<TRow>;
  columnId: string;
  value: unknown;
  previousValue: unknown;
  source: "edit" | "delete" | "paste";
};

export type YoupGridCellEditCommitReason = "enter" | "tab" | "blur";

export type YoupGridCellEditCommit<TRow> = Omit<
  YoupGridCellValueChange<TRow>,
  "source"
> & {
  reason: YoupGridCellEditCommitReason;
};

export type YoupGridRowsChange<TRow> = {
  rows: TRow[];
  changes: YoupGridCellValueChange<TRow>[];
  source: "edit" | "delete" | "paste";
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
  setColumnWidth: (columnId: string, width: number) => void;
  setRowSelected: (rowId: GridRowId, selected: boolean) => void;
  setSelectedRows: (rowIds: readonly GridRowId[]) => void;
  toggleRowSelected: (rowId: GridRowId) => void;
  setTreeExpandedRows: (rowIds: readonly GridRowId[]) => void;
  toggleTreeRowExpanded: (rowId: GridRowId) => void;
};
