import type { GridRowId } from "./types.ts";
export type GridCellValueHistoryChange = {
    rowId: GridRowId;
    rowIndex: number;
    columnId: string;
    previousValue: unknown;
    value: unknown;
};
export type GridValueHistoryEntry = {
    changes: readonly GridCellValueHistoryChange[];
};
export type GridValueHistoryState = {
    undoStack: GridValueHistoryEntry[];
    redoStack: GridValueHistoryEntry[];
};
export declare function createValueHistoryState(): GridValueHistoryState;
export declare function pushValueHistoryEntry(state: GridValueHistoryState, entry: GridValueHistoryEntry, options?: {
    maxEntries?: number;
}): GridValueHistoryState;
export declare function undoValueHistory(state: GridValueHistoryState): {
    state: GridValueHistoryState;
    entry?: GridValueHistoryEntry;
};
export declare function redoValueHistory(state: GridValueHistoryState): {
    state: GridValueHistoryState;
    entry?: GridValueHistoryEntry;
};
export declare function invertValueHistoryEntry(entry: GridValueHistoryEntry): GridValueHistoryEntry;
