import { getColumnById } from "./columns.ts";
import { getRowNodeValue } from "./formula.ts";
import type {
  AggregationFunctionName,
  PivotDimension,
  PivotKey,
  PivotModel,
  PivotResultColumn,
  PivotResultColumnGroup,
  PivotResultRow,
  PivotState,
  ResolvedColumnDef,
  RowNode,
} from "./types.ts";

const DEFAULT_MAX_GENERATED_COLUMNS = 100;

type ResolvedPivotDimension<TRow> = PivotDimension & {
  column: ResolvedColumnDef<TRow>;
};

type ValueAccumulator = {
  rowCount: number;
  valueCount: number;
  sum: number;
  min?: number;
  max?: number;
};

type RowAccumulator = {
  rowCount: number;
  values: Map<string, ValueAccumulator>;
};

export function buildPivotModel<TRow>(
  rows: readonly RowNode<TRow>[],
  columns: readonly ResolvedColumnDef<TRow>[],
  state?: PivotState,
): PivotModel | undefined {
  if (!state?.enabled || state.values.length === 0) {
    return undefined;
  }

  const rowDimensions = resolveDimensions(columns, state.rows);
  const columnDimensions = resolveDimensions(columns, state.columns);
  const valueRules = state.values.flatMap((rule) => {
    const column = getColumnById(columns, rule.columnId);
    return column ? [{ rule, column }] : [];
  });

  if (valueRules.length === 0) {
    return emptyPivotModel(rows.length, ["Pivot values reference unknown columns"]);
  }

  const preparedRows = rows.flatMap((row) => {
    const rowPath = createPivotPath(row, rowDimensions);
    const columnPath = createPivotPath(row, columnDimensions);
    const hasEmptyDimension = [...rowPath, ...columnPath].some((key) => key.value === "empty:");

    if (hasEmptyDimension && !state.includeEmpty) {
      return [];
    }

    return [{ row, rowPath, columnPath }];
  });
  const uniqueColumnPaths = uniquePaths(preparedRows.map((item) => item.columnPath));
  uniqueColumnPaths.sort((left, right) => comparePaths(left, right, columnDimensions));

  const totalColumnCount = state.rowTotals === false ? 0 : valueRules.length;
  const maxGeneratedColumns = Math.max(1, state.maxGeneratedColumns ?? DEFAULT_MAX_GENERATED_COLUMNS);
  const availablePathCount = Math.max(0, Math.floor(
    (maxGeneratedColumns - totalColumnCount) / Math.max(1, valueRules.length),
  ));
  const selectedColumnPaths = uniqueColumnPaths.slice(0, availablePathCount);
  const truncated = selectedColumnPaths.length < uniqueColumnPaths.length;
  const generatedColumns = selectedColumnPaths.flatMap((path) => valueRules.map(({ rule, column }) => ({
    id: createPivotColumnId(path, rule.columnId, rule.function),
    headerName: createPivotColumnHeader(path, rule.label ?? column.headerName, valueRules.length),
    path,
    valueColumnId: rule.columnId,
    function: rule.function,
  } satisfies PivotResultColumn)));
  const totalColumns = state.rowTotals === false
    ? []
    : valueRules.map(({ rule, column }) => ({
        id: createPivotTotalColumnId(rule.columnId, rule.function),
        headerName: `${rule.label ?? column.headerName} Total`,
        path: [],
        valueColumnId: rule.columnId,
        function: rule.function,
        isTotal: true,
      } satisfies PivotResultColumn));
  const resultColumns = state.rowTotals === "before"
    ? [...totalColumns, ...generatedColumns]
    : [...generatedColumns, ...totalColumns];
  const selectedColumnPathKeys = new Set(selectedColumnPaths.map(createPivotPathId));
  const rowAccumulators = new Map<string, RowAccumulator>();
  const rowPaths = new Map<string, PivotKey[]>();

  for (const item of preparedRows) {
    const prefixes = rowDimensions.length === 0
      ? [[]]
      : item.rowPath.map((_, index) => item.rowPath.slice(0, index + 1));
    const columnPathId = createPivotPathId(item.columnPath);

    for (const prefix of prefixes) {
      const rowPathId = createPivotPathId(prefix);
      const accumulator = getRowAccumulator(rowAccumulators, rowPathId);
      accumulator.rowCount += 1;
      rowPaths.set(rowPathId, prefix);

      for (const { rule, column } of valueRules) {
        const value = getRowNodeValue(item.row, column);
        if (selectedColumnPathKeys.has(columnPathId)) {
          updateValueAccumulator(
            accumulator.values,
            createPivotColumnId(item.columnPath, rule.columnId, rule.function),
            value,
          );
        }
        if (state.rowTotals !== false) {
          updateValueAccumulator(
            accumulator.values,
            createPivotTotalColumnId(rule.columnId, rule.function),
            value,
          );
        }
      }
    }
  }

  const collapsed = new Set(state.collapsedRowGroupIds ?? []);
  const sortedPaths = [...rowPaths.values()].sort((left, right) => comparePaths(left, right, rowDimensions));
  const pivotRows = sortedPaths.flatMap((path) => {
    if (hasCollapsedParent(path, collapsed)) {
      return [];
    }

    const id = createPivotRowId(path);
    const accumulator = rowAccumulators.get(createPivotPathId(path));
    return accumulator
      ? [createResultRow(path, accumulator, resultColumns, rowDimensions.length, !collapsed.has(id))]
      : [];
  });
  const grandTotalRow = state.columnTotals === false
    ? undefined
    : createGrandTotalRow(preparedRows, resultColumns, valueRules);

  return {
    columns: resultColumns,
    columnGroups: buildColumnGroups(generatedColumns),
    rows: pivotRows,
    grandTotalRow,
    grandTotalPosition: grandTotalRow
      ? state.columnTotals === "before" ? "before" : "after"
      : undefined,
    sourceRowCount: preparedRows.length,
    generatedColumnCount: resultColumns.length,
    truncated,
    warnings: truncated
      ? [`Pivot columns were limited to ${maxGeneratedColumns}`]
      : [],
  };
}

export function getPivotDisplayRows(model: PivotModel): PivotResultRow[] {
  if (!model.grandTotalRow) {
    return model.rows;
  }
  return model.grandTotalPosition === "before"
    ? [model.grandTotalRow, ...model.rows]
    : [...model.rows, model.grandTotalRow];
}

export function getPivotDrilldownRows<TRow>(options: {
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
  state: PivotState;
  pivotRow: PivotResultRow;
  pivotColumn?: PivotResultColumn;
}): TRow[] {
  const rowDimensions = resolveDimensions(options.columns, options.state.rows);
  const columnDimensions = resolveDimensions(options.columns, options.state.columns);

  return options.rows
    .filter((row) => pathStartsWith(createPivotPath(row, rowDimensions), options.pivotRow.path))
    .filter((row) => !options.pivotColumn || options.pivotColumn.isTotal ||
      pathsEqual(createPivotPath(row, columnDimensions), options.pivotColumn.path))
    .map((row) => row.original);
}

export function createPivotRowId(path: readonly PivotKey[]): string {
  return `pivot-row:${createPivotPathId(path)}`;
}

export function createPivotColumnId(
  path: readonly PivotKey[],
  valueColumnId: string,
  fn: AggregationFunctionName,
): string {
  return `pivot:${createPivotPathId(path)}:${encodeURIComponent(valueColumnId)}:${fn}`;
}

function resolveDimensions<TRow>(
  columns: readonly ResolvedColumnDef<TRow>[],
  dimensions: readonly PivotDimension[],
): ResolvedPivotDimension<TRow>[] {
  return dimensions.flatMap((dimension) => {
    const column = getColumnById(columns, dimension.columnId);
    return column ? [{ ...dimension, column }] : [];
  });
}

function createPivotPath<TRow>(
  row: RowNode<TRow>,
  dimensions: readonly ResolvedPivotDimension<TRow>[],
): PivotKey[] {
  return dimensions.map((dimension) => createPivotKey(
    dimension.columnId,
    getRowNodeValue(row, dimension.column),
    dimension.bucket ?? "value",
  ));
}

function createPivotKey(columnId: string, rawValue: unknown, bucket: PivotKey["bucket"]): PivotKey {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return { columnId, bucket, value: "empty:", label: "(empty)" };
  }

  if (bucket !== "value") {
    const date = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
    if (!Number.isNaN(date.getTime())) {
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1;
      const day = date.getUTCDate();
      const result = bucket === "year"
        ? String(year)
        : bucket === "quarter"
          ? `${year}-Q${Math.floor((month - 1) / 3) + 1}`
          : bucket === "month"
            ? `${year}-${String(month).padStart(2, "0")}`
            : `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return { columnId, bucket, value: `date:${result}`, label: result };
    }
  }

  const label = String(rawValue);
  return { columnId, bucket, value: `${typeof rawValue}:${label}`, label };
}

function uniquePaths(paths: readonly PivotKey[][]): PivotKey[][] {
  const unique = new Map<string, PivotKey[]>();
  for (const path of paths) {
    unique.set(createPivotPathId(path), path);
  }
  return unique.size === 0 ? [[]] : [...unique.values()];
}

function createPivotPathId(path: readonly PivotKey[]): string {
  return encodeURIComponent(JSON.stringify(path.map((key) => [key.columnId, key.bucket, key.value])));
}

function comparePaths<TRow>(
  left: readonly PivotKey[],
  right: readonly PivotKey[],
  dimensions: readonly ResolvedPivotDimension<TRow>[],
): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (!left[index]) return -1;
    if (!right[index]) return 1;
    const compared = left[index].label.localeCompare(right[index].label, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (compared !== 0) {
      return dimensions[index]?.sort === "desc" ? -compared : compared;
    }
  }
  return 0;
}

function createPivotColumnHeader(
  path: readonly PivotKey[],
  valueLabel: string,
  valueCount: number,
): string {
  const prefix = path.map((key) => key.label).join(" / ");
  return prefix && valueCount > 1 ? `${prefix} / ${valueLabel}` : prefix || valueLabel;
}

function createPivotTotalColumnId(columnId: string, fn: AggregationFunctionName): string {
  return `pivot-total:${encodeURIComponent(columnId)}:${fn}`;
}

function getRowAccumulator(accumulators: Map<string, RowAccumulator>, id: string): RowAccumulator {
  const existing = accumulators.get(id);
  if (existing) return existing;
  const created = { rowCount: 0, values: new Map<string, ValueAccumulator>() };
  accumulators.set(id, created);
  return created;
}

function updateValueAccumulator(
  accumulators: Map<string, ValueAccumulator>,
  key: string,
  value: unknown,
): void {
  const accumulator = accumulators.get(key) ?? {
    rowCount: 0,
    valueCount: 0,
    sum: 0,
  };
  accumulator.rowCount += 1;
  if (typeof value === "number" && Number.isFinite(value)) {
    accumulator.valueCount += 1;
    accumulator.sum += value;
    accumulator.min = accumulator.min === undefined ? value : Math.min(accumulator.min, value);
    accumulator.max = accumulator.max === undefined ? value : Math.max(accumulator.max, value);
  }
  accumulators.set(key, accumulator);
}

function createResultRow(
  path: PivotKey[],
  accumulator: RowAccumulator,
  columns: readonly PivotResultColumn[],
  rowDimensionCount: number,
  expanded: boolean,
): PivotResultRow {
  return {
    id: createPivotRowId(path),
    depth: Math.max(0, path.length - 1),
    path,
    label: path[path.length - 1]?.label ?? "All rows",
    rowCount: accumulator.rowCount,
    expanded,
    isSubtotal: path.length > 0 && path.length < rowDimensionCount,
    values: Object.fromEntries(columns.map((column) => [
      column.id,
      finalizeValueAccumulator(accumulator.values.get(column.id), column.function),
    ])),
  };
}

function finalizeValueAccumulator(
  accumulator: ValueAccumulator | undefined,
  fn: AggregationFunctionName,
): number | undefined {
  if (!accumulator) {
    return fn === "sum" || fn === "count" ? 0 : undefined;
  }
  switch (fn) {
    case "count": return accumulator.rowCount;
    case "sum": return accumulator.sum;
    case "avg": return accumulator.valueCount > 0 ? accumulator.sum / accumulator.valueCount : undefined;
    case "min": return accumulator.min;
    case "max": return accumulator.max;
  }
}

function hasCollapsedParent(path: readonly PivotKey[], collapsed: ReadonlySet<string>): boolean {
  for (let depth = 1; depth < path.length; depth += 1) {
    if (collapsed.has(createPivotRowId(path.slice(0, depth)))) return true;
  }
  return false;
}

function createGrandTotalRow<TRow>(
  rows: readonly { row: RowNode<TRow>; columnPath: PivotKey[] }[],
  columns: readonly PivotResultColumn[],
  valueRules: readonly { rule: PivotState["values"][number]; column: ResolvedColumnDef<TRow> }[],
): PivotResultRow {
  const values = new Map<string, ValueAccumulator>();
  for (const item of rows) {
    for (const column of columns) {
      const valueRule = valueRules.find(({ rule }) =>
        rule.columnId === column.valueColumnId && rule.function === column.function);
      if (valueRule && (column.isTotal || pathsEqual(item.columnPath, column.path))) {
        updateValueAccumulator(values, column.id, getRowNodeValue(item.row, valueRule.column));
      }
    }
  }
  return {
    id: "pivot-grand-total",
    depth: 0,
    path: [],
    label: "Grand Total",
    rowCount: rows.length,
    expanded: true,
    isSubtotal: false,
    isGrandTotal: true,
    values: Object.fromEntries(columns.map((column) => [
      column.id,
      finalizeValueAccumulator(values.get(column.id), column.function),
    ])),
  };
}

function buildColumnGroups(columns: readonly PivotResultColumn[]): PivotResultColumnGroup[] {
  const roots: PivotResultColumnGroup[] = [];
  for (const column of columns) {
    let siblings = roots;
    const parentPath: PivotKey[] = [];
    for (const key of column.path) {
      parentPath.push(key);
      const id = `pivot-group:${createPivotPathId(parentPath)}`;
      let group = siblings.find((item) => item.id === id);
      if (!group) {
        group = { id, label: key.label, path: [...parentPath], children: [], columnIds: [] };
        siblings.push(group);
      }
      group.columnIds.push(column.id);
      siblings = group.children;
    }
  }
  return roots;
}

function pathStartsWith(path: readonly PivotKey[], prefix: readonly PivotKey[]): boolean {
  return prefix.every((key, index) => path[index]?.value === key.value && path[index]?.columnId === key.columnId);
}

function pathsEqual(left: readonly PivotKey[], right: readonly PivotKey[]): boolean {
  return left.length === right.length && pathStartsWith(left, right);
}

function emptyPivotModel(sourceRowCount: number, warnings: string[]): PivotModel {
  return {
    columns: [],
    columnGroups: [],
    rows: [],
    sourceRowCount,
    generatedColumnCount: 0,
    truncated: false,
    warnings,
  };
}
