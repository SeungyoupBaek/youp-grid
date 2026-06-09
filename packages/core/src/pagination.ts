import type { PaginationState, RowNode } from "./types.ts";

export function applyPagination<TRow>(
  rows: readonly RowNode<TRow>[],
  pagination?: PaginationState,
): { rows: RowNode<TRow>[]; pageCount?: number } {
  if (!pagination) {
    return { rows: [...rows] };
  }

  const pageSize = Math.max(1, pagination.pageSize);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageIndex = clamp(pagination.pageIndex, 0, pageCount - 1);
  const start = pageIndex * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    pageCount,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
