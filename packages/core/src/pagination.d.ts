import type { PaginationState, RowNode } from "./types.ts";
export declare function applyPagination<TRow>(rows: readonly RowNode<TRow>[], pagination?: PaginationState): {
    rows: RowNode<TRow>[];
    pageCount?: number;
};
