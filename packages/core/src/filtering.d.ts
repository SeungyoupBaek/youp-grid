import type { FilterRule, ResolvedColumnDef, RowNode } from "./types.ts";
export declare function applyFilters<TRow>(rows: readonly RowNode<TRow>[], columns: readonly ResolvedColumnDef<TRow>[], filters?: readonly FilterRule[]): RowNode<TRow>[];
export declare function defaultFilterPredicate(value: unknown, filter: FilterRule): boolean;
