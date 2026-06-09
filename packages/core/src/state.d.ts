import type { AggregationRule, CursorPaginationState, FilterRule, GridState, PaginationState, RemoteCacheState, RowGroupingState, SortDirection } from "./types.ts";
export declare function createGridState(state?: GridState): GridState;
export declare function toggleSort(state: GridState, columnId: string, options?: {
    multi?: boolean;
    cycle?: readonly (SortDirection | undefined)[];
}): GridState;
export declare function setSort(state: GridState, columnId: string, direction: SortDirection, options?: {
    multi?: boolean;
}): GridState;
export declare function clearSort(state: GridState, columnId: string): GridState;
export declare function setFilter(state: GridState, filter: FilterRule): GridState;
export declare function clearFilter(state: GridState, columnId: string): GridState;
export declare function setPagination(state: GridState, pagination: PaginationState): GridState;
export declare function setCursorPagination(state: GridState, cursorPagination: CursorPaginationState): GridState;
export declare function setCursorPage(state: GridState, cursor: string | undefined): GridState;
export declare function setCursorPageSize(state: GridState, pageSize: number): GridState;
export declare function setAggregation(state: GridState, aggregation: readonly AggregationRule[]): GridState;
export declare function setRowGrouping(state: GridState, rowGrouping: RowGroupingState | undefined): GridState;
export declare function toggleRowGroupExpanded(state: GridState, groupId: string): GridState;
export declare function startRemoteRequest(state: GridState, requestId: string): GridState;
export declare function finishRemoteRequest(state: GridState, requestId: string): GridState;
export declare function failRemoteRequest(state: GridState, requestId: string, error?: string): GridState;
export declare function cancelRemoteRequest(state: GridState, requestId?: string | undefined): GridState;
export declare function isActiveRemoteRequest(state: GridState, requestId: string): boolean;
export declare function createRemoteCacheKey(state: GridState): string;
export declare function setRemoteCache(state: GridState, remoteCache: RemoteCacheState): GridState;
export declare function invalidateRemoteCache(state: GridState, key?: string): GridState;
export declare function acknowledgeRemoteCache(state: GridState, key?: string): GridState;
