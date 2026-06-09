import { getColumnById } from "./columns.ts";
import type { FilterRule, ResolvedColumnDef, RowNode } from "./types.ts";

export function applyFilters<TRow>(
  rows: readonly RowNode<TRow>[],
  columns: readonly ResolvedColumnDef<TRow>[],
  filters: readonly FilterRule[] = [],
): RowNode<TRow>[] {
  const activeFilters = filters.filter((filter) => hasUsableFilterValue(filter));

  if (activeFilters.length === 0) {
    return [...rows];
  }

  return rows.filter((row) => {
    return activeFilters.every((filter) => {
      const column = getColumnById(columns, filter.columnId);

      if (!column) {
        return true;
      }

      const value = column.accessor(row.original);

      if (column.filterPredicate) {
        return column.filterPredicate(value, filter, row.original);
      }

      return defaultFilterPredicate(value, filter);
    });
  });
}

export function defaultFilterPredicate(value: unknown, filter: FilterRule): boolean {
  switch (filter.operator) {
    case "contains":
      return stringify(value).includes(stringify(filter.value));
    case "equals":
      return value === filter.value;
    case "startsWith":
      return stringify(value).startsWith(stringify(filter.value));
    case "endsWith":
      return stringify(value).endsWith(stringify(filter.value));
    case "gt":
      return comparePrimitive(value, filter.value) > 0;
    case "gte":
      return comparePrimitive(value, filter.value) >= 0;
    case "lt":
      return comparePrimitive(value, filter.value) < 0;
    case "lte":
      return comparePrimitive(value, filter.value) <= 0;
    case "between":
      return isBetween(value, filter.value);
    case "isEmpty":
      return value == null || value === "";
    case "isNotEmpty":
      return value != null && value !== "";
    case "in":
      return Array.isArray(filter.value) && filter.value.includes(value);
  }
}

function hasUsableFilterValue(filter: FilterRule): boolean {
  return (
    filter.operator === "isEmpty" ||
    filter.operator === "isNotEmpty" ||
    filter.value !== undefined
  );
}

function stringify(value: unknown): string {
  return String(value ?? "").toLocaleLowerCase();
}

function comparePrimitive(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return stringify(left).localeCompare(stringify(right));
}

function isBetween(value: unknown, range: unknown): boolean {
  if (!Array.isArray(range) || range.length !== 2) {
    return true;
  }

  return comparePrimitive(value, range[0]) >= 0 && comparePrimitive(value, range[1]) <= 0;
}
