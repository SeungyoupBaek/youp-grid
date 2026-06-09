import type { ColumnDef, ResolvedColumnDef } from "./types.ts";

export function normalizeColumns<TRow>(
  columns: readonly ColumnDef<TRow>[],
): ResolvedColumnDef<TRow>[] {
  const seen = new Set<string>();

  return columns.map((column) => {
    const id = resolveColumnId(column);

    if (seen.has(id)) {
      throw new Error(`Duplicate grid column id: ${id}`);
    }

    seen.add(id);

    return {
      ...column,
      id,
      headerName: column.headerName ?? id,
      accessor: column.accessor ?? createFieldAccessor(column.field),
    };
  });
}

export function getColumnById<TRow>(
  columns: readonly ResolvedColumnDef<TRow>[],
  columnId: string,
): ResolvedColumnDef<TRow> | undefined {
  return columns.find((column) => column.id === columnId);
}

function resolveColumnId<TRow>(column: ColumnDef<TRow>): string {
  if (column.id) {
    return column.id;
  }

  if (column.field) {
    return String(column.field);
  }

  throw new Error("Column requires either `id` or `field`.");
}

function createFieldAccessor<TRow>(field?: ColumnDef<TRow>["field"]) {
  if (!field) {
    throw new Error("Column without `field` requires an explicit `accessor`.");
  }

  return (row: TRow) => {
    return getNestedValue(row, String(field));
  };
}

function getNestedValue(row: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value == null || typeof value !== "object") {
      return undefined;
    }

    return (value as Record<string, unknown>)[key];
  }, row);
}
