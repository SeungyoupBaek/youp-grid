import { getColumnById } from "./columns.ts";
import { getRowNodeValue } from "./formula.ts";
import type { ResolvedColumnDef, RowNode, SortRule } from "./types.ts";

export function applySorting<TRow>(
  rows: readonly RowNode<TRow>[],
  columns: readonly ResolvedColumnDef<TRow>[],
  sortRules: readonly SortRule[] = [],
): RowNode<TRow>[] {
  const activeRules = sortRules.filter((rule) => rule.direction);

  if (activeRules.length === 0) {
    return [...rows];
  }

  return [...rows].sort((left, right) => {
    for (const rule of activeRules) {
      const column = getColumnById(columns, rule.columnId);

      if (!column) {
        continue;
      }

      const result = compareRows(left, right, column);

      if (result !== 0) {
        return rule.direction === "desc" ? -result : result;
      }
    }

    return left.index - right.index;
  });
}

function compareRows<TRow>(
  left: RowNode<TRow>,
  right: RowNode<TRow>,
  column: ResolvedColumnDef<TRow>,
): number {
  const leftValue = getRowNodeValue(left, column);
  const rightValue = getRowNodeValue(right, column);

  if (column.comparator) {
    return column.comparator(leftValue, rightValue, left.original, right.original);
  }

  return comparePrimitive(leftValue, rightValue);
}

function comparePrimitive(left: unknown, right: unknown): number {
  if (left == null && right == null) {
    return 0;
  }

  if (left == null) {
    return -1;
  }

  if (right == null) {
    return 1;
  }

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }

  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
