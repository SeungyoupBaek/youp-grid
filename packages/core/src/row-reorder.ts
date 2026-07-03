export type ReorderRowsOptions<TRow> = {
  rows: readonly TRow[];
  sourceIndex: number;
  targetIndex: number;
};

export function reorderRows<TRow>(options: ReorderRowsOptions<TRow>): TRow[] {
  const rows = [...options.rows];
  const sourceIndex = clampIndex(options.sourceIndex, rows.length);
  const targetIndex = clampIndex(options.targetIndex, rows.length);

  if (sourceIndex === targetIndex || rows.length < 2) {
    return rows;
  }

  const [row] = rows.splice(sourceIndex, 1);
  rows.splice(targetIndex, 0, row);

  return rows;
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(Math.max(0, length - 1), Math.trunc(index)));
}
