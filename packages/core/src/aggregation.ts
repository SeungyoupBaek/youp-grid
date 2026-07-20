import { getColumnById } from "./columns.ts";
import { getRowNodeValue } from "./formula.ts";
import type {
  AggregationFunctionName,
  AggregationResult,
  AggregationRule,
  ResolvedColumnDef,
  RowNode,
} from "./types.ts";

export function applyAggregation<TRow>(
  rows: readonly RowNode<TRow>[],
  columns: readonly ResolvedColumnDef<TRow>[],
  rules: readonly AggregationRule[] = [],
): AggregationResult[] {
  return rules
    .map((rule) => {
      const column = getColumnById(columns, rule.columnId);

      if (!column) {
        return undefined;
      }

      return aggregateColumn(rows, column, rule);
    })
    .filter((result): result is AggregationResult => Boolean(result));
}

function aggregateColumn<TRow>(
  rows: readonly RowNode<TRow>[],
  column: ResolvedColumnDef<TRow>,
  rule: AggregationRule,
): AggregationResult {
  const numericValues = getNumericValues(rows, column);

  return {
    columnId: column.id,
    function: rule.function,
    label: rule.label ?? getAggregationLabel(rule.function),
    value: getAggregationValue(rule.function, rows.length, numericValues),
    rowCount: rows.length,
    valueCount: numericValues.length,
  };
}

function getNumericValues<TRow>(
  rows: readonly RowNode<TRow>[],
  column: ResolvedColumnDef<TRow>,
): number[] {
  return rows
    .map((row) => getRowNodeValue(row, column))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function getAggregationValue(
  fn: AggregationFunctionName,
  rowCount: number,
  values: readonly number[],
): number | undefined {
  switch (fn) {
    case "count":
      return rowCount;
    case "sum":
      return values.reduce((sum, value) => sum + value, 0);
    case "avg":
      return values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : undefined;
    case "min":
      return values.length > 0 ? Math.min(...values) : undefined;
    case "max":
      return values.length > 0 ? Math.max(...values) : undefined;
  }
}

function getAggregationLabel(fn: AggregationFunctionName): string {
  switch (fn) {
    case "sum":
      return "Sum";
    case "avg":
      return "Avg";
    case "min":
      return "Min";
    case "max":
      return "Max";
    case "count":
      return "Count";
  }
}
