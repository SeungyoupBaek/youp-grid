import type { ResolvedColumnDef, RowNode, SortRule } from "./types.ts";
export declare function applySorting<TRow>(rows: readonly RowNode<TRow>[], columns: readonly ResolvedColumnDef<TRow>[], sortRules?: readonly SortRule[]): RowNode<TRow>[];
