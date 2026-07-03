import type { ColumnState, ResolvedColumnDef } from "./types.ts";

export type SizeColumnsToFitOptions<TRow> = {
  columns: readonly ResolvedColumnDef<TRow>[];
  width: number;
  minWidth?: number;
  maxWidth?: number;
};

export function sizeColumnsToFit<TRow>(options: SizeColumnsToFitOptions<TRow>): ColumnState[] {
  const visibleColumns = options.columns.filter((column) => !column.hidden);

  if (visibleColumns.length === 0 || options.width <= 0) {
    return [];
  }

  const baseWidth = Math.floor(options.width / visibleColumns.length);
  let remaining = Math.max(0, Math.trunc(options.width));

  return visibleColumns.map((column, index) => {
    const isLast = index === visibleColumns.length - 1;
    const rawWidth = isLast ? remaining : baseWidth;
    const width = clampWidth(rawWidth, {
      minWidth: column.minWidth ?? options.minWidth,
      maxWidth: column.maxWidth ?? options.maxWidth,
    });

    remaining -= width;

    return {
      columnId: column.id,
      width,
    };
  });
}

function clampWidth(width: number, limits: { minWidth?: number; maxWidth?: number }): number {
  const minWidth = limits.minWidth ?? 40;
  const maxWidth = limits.maxWidth ?? Number.POSITIVE_INFINITY;

  return Math.max(minWidth, Math.min(maxWidth, width));
}
