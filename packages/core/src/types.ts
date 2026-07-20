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

export type CellValidationResult = boolean | string | {
  valid: boolean;
  message?: string;
};

export type CellValidator<TValue = unknown, TRow = unknown> = (
  value: TValue,
  row: TRow,
) => CellValidationResult | Promise<CellValidationResult>;

export type ColumnEditor =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "combobox"
  | "tags"
  | "date"
  | "datetime";

export type ColumnAlign = "left" | "center" | "right";

export type ColumnEditorOptionValue = string | number | boolean;

export type ColumnEditorOption =
  | ColumnEditorOptionValue
  | {
      value: ColumnEditorOptionValue;
      label: string;
      disabled?: boolean;
      color?: string;
      description?: string;
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
  validator?: CellValidator<TValue, TRow>;
  editor?: ColumnEditor;
  align?: ColumnAlign;
  options?: readonly ColumnEditorOption[];
  placeholder?: string;
  wrapText?: boolean;
  autoHeight?: boolean;
  formula?: string;
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

export type PivotBucket = "value" | "year" | "quarter" | "month" | "day";

export type PivotDimension = {
  columnId: string;
  bucket?: PivotBucket;
  label?: string;
  sort?: SortDirection;
};

export type PivotTotalsPosition = false | "before" | "after";

export type PivotState = {
  enabled?: boolean;
  rows: PivotDimension[];
  columns: PivotDimension[];
  values: AggregationRule[];
  rowTotals?: PivotTotalsPosition;
  columnTotals?: PivotTotalsPosition;
  collapsedRowGroupIds?: string[];
  maxGeneratedColumns?: number;
  includeEmpty?: boolean;
};

export type PivotKey = {
  columnId: string;
  value: string;
  label: string;
  bucket: PivotBucket;
};

export type PivotResultColumn = {
  id: string;
  headerName: string;
  path: PivotKey[];
  valueColumnId: string;
  function: AggregationFunctionName;
  isTotal?: boolean;
};

export type PivotResultColumnGroup = {
  id: string;
  label: string;
  path: PivotKey[];
  children: PivotResultColumnGroup[];
  columnIds: string[];
};

export type PivotResultRow = {
  id: string;
  depth: number;
  path: PivotKey[];
  label: string;
  rowCount: number;
  expanded: boolean;
  isSubtotal: boolean;
  isGrandTotal?: boolean;
  values: Record<string, number | undefined>;
};

export type PivotModel = {
  columns: PivotResultColumn[];
  columnGroups: PivotResultColumnGroup[];
  rows: PivotResultRow[];
  grandTotalRow?: PivotResultRow;
  grandTotalPosition?: "before" | "after";
  sourceRowCount: number;
  generatedColumnCount: number;
  truncated: boolean;
  warnings: string[];
};

export type RowGroupingState = {
  columnIds: string[];
  collapsedGroupIds?: string[];
};

export type TreeDataState = {
  expandedRowIds?: GridRowId[];
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

export type FormulaScalar = string | number | boolean | null | undefined;

export type FormulaCell = {
  rowId: GridRowId;
  columnId: string;
  formula: string;
};

export type FormulaState = {
  cells: FormulaCell[];
  namedExpressions?: Record<string, FormulaScalar>;
  locale?: string;
};

export type FormulaErrorCode =
  | "ENGINE"
  | "PARSE"
  | "CYCLE"
  | "REF"
  | "VALUE"
  | "NAME"
  | "DIV_ZERO";

export type FormulaCellResult = {
  rowId: GridRowId;
  columnId: string;
  formula: string;
  value: FormulaScalar | FormulaScalar[][];
  error?: {
    code: FormulaErrorCode;
    message: string;
  };
  dependencies: string[];
};

export type FormulaModel = {
  cells: Record<string, FormulaCellResult>;
  errors: FormulaCellResult[];
  recalculatedCellCount: number;
};

export type FormulaEngineInput<TRow> = {
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
  state: FormulaState;
};

export type FormulaEngine = {
  calculate: <TRow>(input: FormulaEngineInput<TRow>) => FormulaModel;
};

export type GridState = {
  columns?: ColumnState[];
  sort?: SortRule[];
  filters?: FilterRule[];
  aggregation?: AggregationRule[];
  rowGrouping?: RowGroupingState;
  pivot?: PivotState;
  formula?: FormulaState;
  treeData?: TreeDataState;
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
  depth?: number;
  parentId?: GridRowId;
  hasChildren?: boolean;
  expanded?: boolean;
  formulaValues?: Record<string, FormulaScalar | FormulaScalar[][]>;
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
  pinnedTopRows?: readonly TRow[];
  pinnedBottomRows?: readonly TRow[];
  treeData?: boolean;
  getParentRowId?: (row: TRow, index: number) => GridRowId | null | undefined;
  rowModelType?: GridRowModelType;
  serverRowCount?: number;
  serverFilteredRowCount?: number;
  serverPivotModel?: PivotModel;
  formulaEngine?: FormulaEngine;
};

export type RowModel<TRow> = {
  columns: ResolvedColumnDef<TRow>[];
  visibleColumns: ResolvedColumnDef<TRow>[];
  allRows: RowNode<TRow>[];
  filteredRows: RowNode<TRow>[];
  sortedRows: RowNode<TRow>[];
  visibleRows: RowNode<TRow>[];
  displayRows: RowDisplayNode<TRow>[];
  pinnedTopRows: RowNode<TRow>[];
  pinnedBottomRows: RowNode<TRow>[];
  aggregation: AggregationResult[];
  pivot?: PivotModel;
  formula?: FormulaModel;
  totalRowCount: number;
  filteredRowCount: number;
  visibleRowCount: number;
  pageCount?: number;
};

export type GridChartType = "bar" | "line" | "area" | "pie" | "scatter";

export type GridChartSource = "rows" | "selection" | "pivot";

export type GridChartSeries = {
  columnId: string;
  label?: string;
  aggregation?: AggregationFunctionName;
  axis?: "left" | "right";
};

export type GridChartSpec = {
  id?: string;
  type: GridChartType;
  title?: string;
  source?: GridChartSource;
  categoryColumnId?: string;
  xColumnId?: string;
  series: GridChartSeries[];
  stacked?: boolean;
  showLegend?: boolean;
  dataLimit?: number;
};

export type GridChartDatasetSeries = {
  columnId: string;
  dataKey: string;
  label: string;
  axis: "left" | "right";
};

export type GridChartDataset = {
  dimensions: string[];
  source: Record<string, FormulaScalar>[];
  categoryKey?: string;
  xKey?: string;
  series: GridChartDatasetSeries[];
  sourceRowCount: number;
  truncated: boolean;
};

export type VirtualRangeOptions = {
  itemCount: number;
  itemSize: number;
  viewportSize: number;
  scrollOffset: number;
  overscan?: number;
};

export type VariableVirtualRangeOptions = {
  itemCount: number;
  itemSize: number | ((index: number) => number);
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
