import type { GridRowId, RowNode, TreeDataState } from "./types.ts";

export type ApplyTreeDataOptions<TRow> = {
  enabled?: boolean;
  state?: TreeDataState;
  getParentRowId?: (row: TRow, index: number) => GridRowId | null | undefined;
};

export function applyTreeData<TRow>(
  rows: RowNode<TRow>[],
  options: ApplyTreeDataOptions<TRow> = {},
): RowNode<TRow>[] {
  if (!options.enabled || !options.getParentRowId) {
    return rows;
  }

  const rowById = new Map<GridRowId, RowNode<TRow>>();
  const parentIdByRowId = new Map<GridRowId, GridRowId | undefined>();

  for (const row of rows) {
    rowById.set(row.id, row);
  }

  const roots: RowNode<TRow>[] = [];
  const childrenByParentId = new Map<GridRowId, RowNode<TRow>[]>();

  for (const row of rows) {
    const parentId = options.getParentRowId(row.original, row.index) ?? undefined;
    const validParentId =
      parentId !== undefined && parentId !== row.id && rowById.has(parentId)
        ? parentId
        : undefined;

    parentIdByRowId.set(row.id, validParentId);

    if (validParentId === undefined) {
      roots.push(row);
      continue;
    }

    const siblings = childrenByParentId.get(validParentId);
    if (siblings) {
      siblings.push(row);
    } else {
      childrenByParentId.set(validParentId, [row]);
    }
  }

  const expandedRowIds = new Set(options.state?.expandedRowIds ?? []);
  const visibleRows: RowNode<TRow>[] = [];
  const emitted = new Set<GridRowId>();
  const reachable = new Set<GridRowId>();

  const markReachable = (row: RowNode<TRow>, visiting: Set<GridRowId>) => {
    if (visiting.has(row.id) || reachable.has(row.id)) {
      return;
    }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(row.id);
    reachable.add(row.id);

    for (const child of childrenByParentId.get(row.id) ?? []) {
      markReachable(child, nextVisiting);
    }
  };

  const appendRow = (row: RowNode<TRow>, depth: number, visiting: Set<GridRowId>) => {
    if (visiting.has(row.id) || emitted.has(row.id)) {
      return;
    }

    const children = childrenByParentId.get(row.id) ?? [];
    const expanded = children.length > 0 && expandedRowIds.has(row.id);
    const nextVisiting = new Set(visiting);
    nextVisiting.add(row.id);

    visibleRows.push({
      ...row,
      depth,
      parentId: parentIdByRowId.get(row.id),
      hasChildren: children.length > 0,
      expanded,
    });
    emitted.add(row.id);

    if (!expanded) {
      return;
    }

    for (const child of children) {
      appendRow(child, depth + 1, nextVisiting);
    }
  };

  for (const root of roots) {
    markReachable(root, new Set());
    appendRow(root, 0, new Set());
  }

  for (const row of rows) {
    if (!reachable.has(row.id)) {
      appendRow(row, 0, new Set());
    }
  }

  return visibleRows;
}
