import type { ResolvedColumnDef, RowDisplayNode, RowGroupNode, RowGroupingState, RowNode } from "./types.ts";
export declare function applyRowGrouping<TRow>(rows: readonly RowNode<TRow>[], columns: readonly ResolvedColumnDef<TRow>[], rowGrouping?: RowGroupingState): RowDisplayNode<TRow>[];
export declare function isRowGroupNode<TRow>(row: RowDisplayNode<TRow>): row is RowGroupNode;
