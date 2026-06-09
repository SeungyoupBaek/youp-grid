import type { GridRowId, GridState } from "./types.ts";
export declare function setRowSelected(state: GridState, rowId: GridRowId, selected: boolean): GridState;
export declare function toggleRowSelected(state: GridState, rowId: GridRowId): GridState;
export declare function setSelectedRows(state: GridState, rowIds: readonly GridRowId[]): GridState;
export declare function clearSelection(state: GridState): GridState;
