export type GridRowId = string | number;

export type GridRowModelType = "client" | "server";

export type SortDirection = "asc" | "desc";

export type ColumnPin = "left" | "right";

export type FilterOperator =
  | "contains"
  | "equals"
  | "startsWith"
  | "endsWith"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "isEmpty"
  | "isNotEmpty"
  | "in";

export type Accessor<TRow, TValue = unknown> = (row: TRow) => TValue;

export type ColumnComparator<TValue = unknown, TRow = unknown> = (
  leftValue: TValue,
  rightValue: TValue,
  leftRow: TRow,
  rightRow: TRow,
) => number;

export type ColumnFilterPredicate<TValue = unknown, TRow = unknown> = (
  value: TValue,
  filter: FilterRule,
  row: TRow,
) => boolean;

export type ValueFormatter<TValue = unknown, TRow = unknown> = (
  value: TValue,
  row: TRow,
) => string;

export type ValueParser<TValue = unknown, TRow = unknown> = (
  input: string,
  row: TRow,
) => TValue;

export type ColumnEditor = "text" | "number" | "checkbox" | "select";

export type ColumnAlign = "left" | "center" | "right";

export type ColumnEditorOptionValue = string | number | boolean;

export type ColumnEditorOption =
  | ColumnEditorOptionValue
  | {
      value: ColumnEditorOptionValue;
      label: string;
    };

export type ColumnDef<TRow, TValue = unknown> = {
  id?: string;
  field?: Extract<keyof TRow, string> | string;
  headerName?: string;
  headerGroup?: string;
  accessor?: Accessor<TRow, TValue>;
  sortable?: boolean;
  filterable?: boolean;
  editable?: boolean;
  hidden?: boolean;
  pinned?: ColumnPin;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  comparator?: ColumnComparator<TValue, TRow>;
  filterPredicate?: ColumnFilterPredicate<TValue, TRow>;
  valueFormatter?: ValueFormatter<TValue, TRow>;
  valueParser?: ValueParser<TValue, TRow>;
  editor?: ColumnEditor;
  align?: ColumnAlign;
  options?: readonly ColumnEditorOption[];
  placeholder?: string;
};

export type ResolvedColumnDef<TRow, TValue = unknown> = Omit<
  ColumnDef<TRow, TValue>,
  "id" | "accessor"
> & {
  id: string;
  headerName: string;
  accessor: Accessor<TRow, TValue>;
};

export type SortRule = {
  columnId: string;
  direction: SortDirection;
};

export type ColumnState = {
  columnId: string;
  hidden?: boolean;
  pinned?: ColumnPin;
  width?: number;
  order?: number;
};

export type FilterRule = {
  columnId: string;
  operator: FilterOperator;
  value?: unknown;
};

export type AggregationFunctionName = "sum" | "avg" | "min" | "max" | "count";

export type AggregationRule = {
  columnId: string;
  function: AggregationFunctionName;
  label?: string;
};

export type AggregationResult = {
  columnId: string;
  function: AggregationFunctionName;
  label: string;
  value: number | undefined;
  rowCount: number;
  valueCount: number;
};

export type RowGroupingState = {
  columnIds: string[];
  collapsedGroupIds?: string[];
};

export type PaginationState = {
  pageIndex: number;
  pageSize: number;
};

export type CursorPaginationState = {
  cursor?: string;
  pageSize: number;
  previousCursor?: string;
  nextCursor?: string;
  hasPreviousPage?: boolean;
  hasNextPage?: boolean;
};

export type RemoteRequestStatus = "idle" | "loading" | "success" | "error" | "cancelled";

export type RemoteRequestState = {
  requestId?: string;
  sequence: number;
  status: RemoteRequestStatus;
  error?: string;
};

export type RemoteCacheState = {
  key?: string;
  version: number;
  stale?: boolean;
  invalidatedKeys?: string[];
};

export type GridState = {
  columns?: ColumnState[];
  sort?: SortRule[];
  filters?: FilterRule[];
  aggregation?: AggregationRule[];
  rowGrouping?: RowGroupingState;
  pagination?: PaginationState;
  cursorPagination?: CursorPaginationState;
  remoteRequest?: RemoteRequestState;
  remoteCache?: RemoteCacheState;
  selectedRowIds?: GridRowId[];
};

export type RowNode<TRow> = {
  id: GridRowId;
  index: number;
  original: TRow;
};

export type RowGroupNode = {
  type: "group";
  id: string;
  groupId: string;
  index: number;
  depth: number;
  columnId: string;
  value: unknown;
  label: string;
  rowCount: number;
  expanded: boolean;
};

export type RowDisplayNode<TRow> = RowNode<TRow> | RowGroupNode;

export type BuildRowModelOptions<TRow> = {
  rows: readonly TRow[];
  columns: readonly ColumnDef<TRow>[];
  state?: GridState;
  getRowId?: (row: TRow, index: number) => GridRowId;
  rowModelType?: GridRowModelType;
  serverRowCount?: number;
  serverFilteredRowCount?: number;
};

export type RowModel<TRow> = {
  columns: ResolvedColumnDef<TRow>[];
  visibleColumns: ResolvedColumnDef<TRow>[];
  allRows: RowNode<TRow>[];
  filteredRows: RowNode<TRow>[];
  sortedRows: RowNode<TRow>[];
  visibleRows: RowNode<TRow>[];
  displayRows: RowDisplayNode<TRow>[];
  aggregation: AggregationResult[];
  totalRowCount: number;
  filteredRowCount: number;
  visibleRowCount: number;
  pageCount?: number;
};

export type VirtualRangeOptions = {
  itemCount: number;
  itemSize: number;
  viewportSize: number;
  scrollOffset: number;
  overscan?: number;
};

export type InfiniteScrollTriggerOptions = {
  rowCount: number;
  lastVisibleRowIndex: number;
  threshold?: number;
  hasMoreRows?: boolean;
  loading?: boolean;
};

export type InfiniteScrollTrigger = {
  shouldLoadMore: boolean;
  rowCount: number;
  lastVisibleRowIndex: number;
  threshold: number;
  remainingRows: number;
};

export type VirtualRange = {
  startIndex: number;
  endIndex: number;
  beforeSize: number;
  afterSize: number;
  totalSize: number;
  items: VirtualItem[];
};

export type VirtualItem = {
  index: number;
  start: number;
  size: number;
  end: number;
};
