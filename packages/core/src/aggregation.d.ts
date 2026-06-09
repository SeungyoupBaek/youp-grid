import type { AggregationResult, AggregationRule, ResolvedColumnDef, RowNode } from "./types.ts";
export declare function applyAggregation<TRow>(rows: readonly RowNode<TRow>[], columns: readonly ResolvedColumnDef<TRow>[], rules?: readonly AggregationRule[]): AggregationResult[];
