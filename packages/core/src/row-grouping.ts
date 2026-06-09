import { getColumnById } from "./columns.ts";
import type {
  ResolvedColumnDef,
  RowDisplayNode,
  RowGroupNode,
  RowGroupingState,
  RowNode,
} from "./types.ts";

export function applyRowGrouping<TRow>(
  rows: readonly RowNode<TRow>[],
  columns: readonly ResolvedColumnDef<TRow>[],
  rowGrouping?: RowGroupingState,
): RowDisplayNode<TRow>[] {
  const groupColumns = (rowGrouping?.columnIds ?? [])
    .map((columnId) => getColumnById(columns, columnId))
    .filter((column): column is ResolvedColumnDef<TRow> => Boolean(column));

  if (groupColumns.length === 0) {
    return [...rows];
  }

  const collapsedGroupIds = new Set(rowGrouping?.collapsedGroupIds ?? []);
  const groupedRows = groupRows(rows, groupColumns, collapsedGroupIds, 0, []);

  return groupedRows.map((row, index) => isRowGroupNode(row) ? { ...row, index } : row);
}

export function isRowGroupNode<TRow>(row: RowDisplayNode<TRow>): row is RowGroupNode {
  return "type" in row && row.type === "group";
}

function groupRows<TRow>(
  rows: readonly RowNode<TRow>[],
  columns: readonly ResolvedColumnDef<TRow>[],
  collapsedGroupIds: ReadonlySet<string>,
  depth: number,
  path: string[],
): RowDisplayNode<TRow>[] {
  const column = columns[depth];

  if (!column) {
    return [...rows];
  }

  const grouped = new Map<string, { value: unknown; rows: RowNode<TRow>[] }>();

  for (const row of rows) {
    const value = column.accessor(row.original);
    const key = stringifyGroupValue(value);
    const existing = grouped.get(key);

    if (existing) {
      existing.rows.push(row);
      continue;
    }

    grouped.set(key, { value, rows: [row] });
  }

  const result: RowDisplayNode<TRow>[] = [];

  for (const [key, group] of grouped) {
    const groupId = createGroupId([...path, `${column.id}:${key}`]);
    const expanded = !collapsedGroupIds.has(groupId);

    result.push({
      type: "group",
      id: groupId,
      groupId,
      index: result.length,
      depth,
      columnId: column.id,
      value: group.value,
      label: stringifyGroupLabel(group.value),
      rowCount: group.rows.length,
      expanded,
    });

    if (expanded) {
      result.push(
        ...groupRows(group.rows, columns, collapsedGroupIds, depth + 1, [
          ...path,
          `${column.id}:${key}`,
        ]),
      );
    }
  }

  return result;
}

function createGroupId(path: readonly string[]): string {
  return `group:${path.join("/")}`;
}

function stringifyGroupValue(value: unknown): string {
  return encodeURIComponent(stringifyGroupLabel(value));
}

function stringifyGroupLabel(value: unknown): string {
  return String(value ?? "(empty)");
}
