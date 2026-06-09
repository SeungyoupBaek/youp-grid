import type { ColumnState, GridState, ResolvedColumnDef } from "./types.ts";
export declare function applyColumnState<TRow>(columns: readonly ResolvedColumnDef<TRow>[], columnStates?: readonly ColumnState[]): ResolvedColumnDef<TRow>[];
export declare function getVisibleColumns<TRow>(columns: readonly ResolvedColumnDef<TRow>[]): ResolvedColumnDef<TRow>[];
export declare function setColumnHidden(state: GridState, columnId: string, hidden: boolean): GridState;
export declare function setColumnWidth(state: GridState, columnId: string, width: number): GridState;
export declare function setColumnPinned(state: GridState, columnId: string, pinned: ColumnState["pinned"] | undefined): GridState;
export declare function setColumnOrder(state: GridState, columnIds: readonly string[]): GridState;
