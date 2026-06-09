import type { GridRowId, GridState } from "./types.ts";

export function setRowSelected(
  state: GridState,
  rowId: GridRowId,
  selected: boolean,
): GridState {
  const selectedRowIds = new Set(state.selectedRowIds ?? []);

  if (selected) {
    selectedRowIds.add(rowId);
  } else {
    selectedRowIds.delete(rowId);
  }

  return {
    ...state,
    selectedRowIds: [...selectedRowIds],
  };
}

export function toggleRowSelected(state: GridState, rowId: GridRowId): GridState {
  return setRowSelected(state, rowId, !(state.selectedRowIds ?? []).includes(rowId));
}

export function setSelectedRows(state: GridState, rowIds: readonly GridRowId[]): GridState {
  return {
    ...state,
    selectedRowIds: [...new Set(rowIds)],
  };
}

export function clearSelection(state: GridState): GridState {
  return {
    ...state,
    selectedRowIds: [],
  };
}
