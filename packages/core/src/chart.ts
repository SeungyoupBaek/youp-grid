import { getColumnById } from "./columns.ts";
import { normalizeCellRange, type GridCellRange } from "./clipboard.ts";
import { getRowNodeValue } from "./formula.ts";
import type {
  AggregationFunctionName,
  FormulaScalar,
  GridChartDataset,
  GridChartSpec,
  PivotModel,
  ResolvedColumnDef,
  RowNode,
} from "./types.ts";

const DEFAULT_DATA_LIMIT = 1_000;

export function buildGridChartDataset<TRow>(options: {
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
  spec: GridChartSpec;
  selectionRange?: GridCellRange;
  pivot?: PivotModel;
}): GridChartDataset {
  if (options.spec.source === "pivot" && options.pivot) {
    return buildPivotDataset(options.pivot, options.spec);
  }

  const range = options.spec.source === "selection" && options.selectionRange
    ? normalizeCellRange(options.selectionRange)
    : undefined;
  const selectedRows = range
    ? options.rows.slice(range.startRowIndex, range.endRowIndex + 1)
    : options.rows;
  const selectedColumnIds = range
    ? new Set(options.columns
        .slice(range.startColumnIndex, range.endColumnIndex + 1)
        .map((column) => column.id))
    : undefined;
  const categoryColumn = options.spec.categoryColumnId
    ? getColumnById(options.columns, options.spec.categoryColumnId)
    : undefined;
  const xColumn = options.spec.xColumnId
    ? getColumnById(options.columns, options.spec.xColumnId)
    : undefined;
  const series = options.spec.series.flatMap((item, index) => {
    const column = getColumnById(options.columns, item.columnId);
    return column && (!selectedColumnIds || selectedColumnIds.has(column.id))
      ? [{ item, column, dataKey: `series_${index}` }]
      : [];
  });
  const grouped = new Map<string, { category: FormulaScalar; x: FormulaScalar; values: unknown[][] }>();

  selectedRows.forEach((row, rowIndex) => {
    const category = toChartScalar(categoryColumn
      ? getRowNodeValue(row, categoryColumn)
      : rowIndex + 1);
    const x = toChartScalar(xColumn ? getRowNodeValue(row, xColumn) : category);
    const key = categoryColumn ? JSON.stringify(category) : JSON.stringify([row.id, rowIndex]);
    const entry = grouped.get(key) ?? {
      category,
      x,
      values: series.map(() => []),
    };
    series.forEach(({ column }, seriesIndex) => {
      entry.values[seriesIndex].push(getRowNodeValue(row, column));
    });
    grouped.set(key, entry);
  });

  const limit = Math.max(1, options.spec.dataLimit ?? DEFAULT_DATA_LIMIT);
  const allSource = [...grouped.values()].map((entry) => Object.fromEntries([
    ["category", entry.category],
    ["x", entry.x],
    ...series.map(({ item, dataKey }, index) => [
      dataKey,
      aggregateChartValues(entry.values[index], item.aggregation),
    ]),
  ]));

  return {
    dimensions: ["category", "x", ...series.map((item) => item.dataKey)],
    source: allSource.slice(0, limit),
    categoryKey: "category",
    xKey: "x",
    series: series.map(({ item, column, dataKey }) => ({
      columnId: column.id,
      dataKey,
      label: item.label ?? column.headerName,
      axis: item.axis ?? "left",
    })),
    sourceRowCount: selectedRows.length,
    truncated: allSource.length > limit,
  };
}

function buildPivotDataset(pivot: PivotModel, spec: GridChartSpec): GridChartDataset {
  const selectedColumns = spec.series.length > 0
    ? pivot.columns.filter((column) => spec.series.some((series) => series.columnId === column.id))
    : pivot.columns;
  const limit = Math.max(1, spec.dataLimit ?? DEFAULT_DATA_LIMIT);
  const rows = pivot.rows.filter((row) => !row.isSubtotal).map((row) => ({
    category: row.label,
    ...Object.fromEntries(selectedColumns.map((column) => [column.id, row.values[column.id]])),
  }));

  return {
    dimensions: ["category", ...selectedColumns.map((column) => column.id)],
    source: rows.slice(0, limit),
    categoryKey: "category",
    series: selectedColumns.map((column) => ({
      columnId: column.id,
      dataKey: column.id,
      label: column.headerName,
      axis: spec.series.find((series) => series.columnId === column.id)?.axis ?? "left",
    })),
    sourceRowCount: pivot.sourceRowCount,
    truncated: rows.length > limit,
  };
}

function aggregateChartValues(values: readonly unknown[], fn?: AggregationFunctionName): FormulaScalar {
  if (!fn) return toChartScalar(values[values.length - 1]);
  if (fn === "count") return values.length;
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return undefined;
  if (fn === "sum") return numbers.reduce((sum, value) => sum + value, 0);
  if (fn === "avg") return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  if (fn === "min") return Math.min(...numbers);
  return Math.max(...numbers);
}

function toChartScalar(value: unknown): FormulaScalar {
  if (value === null || value === undefined || typeof value === "string" ||
      typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
