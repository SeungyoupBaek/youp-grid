import type {
  AggregationRule,
  CursorPaginationState,
  FilterRule,
  GridState,
  PaginationState,
  RemoteCacheState,
  RemoteRequestState,
  RowGroupingState,
  SortDirection,
  SortRule,
} from "./types.ts";

export function createGridState(state: GridState = {}): GridState {
  return {
    columns: state.columns ? [...state.columns] : [],
    sort: state.sort ? [...state.sort] : [],
    filters: state.filters ? [...state.filters] : [],
    aggregation: state.aggregation ? [...state.aggregation] : [],
    rowGrouping: state.rowGrouping
      ? {
          columnIds: [...state.rowGrouping.columnIds],
          collapsedGroupIds: state.rowGrouping.collapsedGroupIds
            ? [...state.rowGrouping.collapsedGroupIds]
            : undefined,
        }
      : undefined,
    pagination: state.pagination ? { ...state.pagination } : undefined,
    cursorPagination: state.cursorPagination ? { ...state.cursorPagination } : undefined,
    remoteRequest: state.remoteRequest ? { ...state.remoteRequest } : undefined,
    remoteCache: state.remoteCache
      ? {
          ...state.remoteCache,
          invalidatedKeys: state.remoteCache.invalidatedKeys
            ? [...state.remoteCache.invalidatedKeys]
            : undefined,
        }
      : undefined,
    selectedRowIds: state.selectedRowIds ? [...state.selectedRowIds] : [],
  };
}

export function toggleSort(
  state: GridState,
  columnId: string,
  options: { multi?: boolean; cycle?: readonly (SortDirection | undefined)[] } = {},
): GridState {
  const cycle = options.cycle ?? ["asc", "desc", undefined];
  const currentRules = state.sort ?? [];
  const currentRule = currentRules.find((rule) => rule.columnId === columnId);
  const currentIndex = cycle.findIndex((direction) => direction === currentRule?.direction);
  const nextDirection = cycle[(currentIndex + 1) % cycle.length];
  const remainingRules = options.multi
    ? currentRules.filter((rule) => rule.columnId !== columnId)
    : [];

  return {
    ...state,
    sort: nextDirection
      ? [...remainingRules, { columnId, direction: nextDirection }]
      : remainingRules,
    remoteCache: markRemoteCacheStale(state.remoteCache),
  };
}

export function setSort(
  state: GridState,
  columnId: string,
  direction: SortDirection,
  options: { multi?: boolean } = {},
): GridState {
  const currentRules = state.sort ?? [];
  const remainingRules = options.multi
    ? currentRules.filter((rule) => rule.columnId !== columnId)
    : [];

  return {
    ...state,
    sort: [...remainingRules, { columnId, direction }],
    remoteCache: markRemoteCacheStale(state.remoteCache),
  };
}

export function clearSort(state: GridState, columnId: string): GridState {
  return {
    ...state,
    sort: (state.sort ?? []).filter((rule) => rule.columnId !== columnId),
    remoteCache: markRemoteCacheStale(state.remoteCache),
  };
}

export function setFilter(state: GridState, filter: FilterRule): GridState {
  const filters = (state.filters ?? []).filter((item) => item.columnId !== filter.columnId);

  return {
    ...state,
    filters: [...filters, filter],
    pagination: resetPageIndex(state.pagination),
    cursorPagination: resetCursor(state.cursorPagination),
    remoteCache: markRemoteCacheStale(state.remoteCache),
  };
}

export function clearFilter(state: GridState, columnId: string): GridState {
  return {
    ...state,
    filters: (state.filters ?? []).filter((filter) => filter.columnId !== columnId),
    pagination: resetPageIndex(state.pagination),
    cursorPagination: resetCursor(state.cursorPagination),
    remoteCache: markRemoteCacheStale(state.remoteCache),
  };
}

export function setPagination(state: GridState, pagination: PaginationState): GridState {
  return {
    ...state,
    pagination: {
      pageIndex: Math.max(0, pagination.pageIndex),
      pageSize: Math.max(1, pagination.pageSize),
    },
    remoteCache: markRemoteCacheStale(state.remoteCache),
  };
}

export function setCursorPagination(
  state: GridState,
  cursorPagination: CursorPaginationState,
): GridState {
  return {
    ...state,
    cursorPagination: {
      ...cursorPagination,
      pageSize: Math.max(1, cursorPagination.pageSize),
    },
    remoteCache: markRemoteCacheStale(state.remoteCache),
  };
}

export function setCursorPage(state: GridState, cursor: string | undefined): GridState {
  const cursorPagination = state.cursorPagination ?? {
    pageSize: state.pagination?.pageSize ?? 50,
  };

  return setCursorPagination(state, {
    ...cursorPagination,
    cursor,
  });
}

export function setCursorPageSize(state: GridState, pageSize: number): GridState {
  return setCursorPagination(state, {
    ...state.cursorPagination,
    cursor: undefined,
    pageSize,
  });
}

export function setAggregation(
  state: GridState,
  aggregation: readonly AggregationRule[],
): GridState {
  return {
    ...state,
    aggregation: [...aggregation],
    remoteCache: markRemoteCacheStale(state.remoteCache),
  };
}

export function setRowGrouping(
  state: GridState,
  rowGrouping: RowGroupingState | undefined,
): GridState {
  return {
    ...state,
    rowGrouping: rowGrouping
      ? {
          columnIds: [...rowGrouping.columnIds],
          collapsedGroupIds: rowGrouping.collapsedGroupIds
            ? [...rowGrouping.collapsedGroupIds]
            : undefined,
        }
      : undefined,
    remoteCache: markRemoteCacheStale(state.remoteCache),
  };
}

export function toggleRowGroupExpanded(state: GridState, groupId: string): GridState {
  const rowGrouping = state.rowGrouping;

  if (!rowGrouping) {
    return state;
  }

  const collapsedGroupIds = new Set(rowGrouping.collapsedGroupIds ?? []);

  if (collapsedGroupIds.has(groupId)) {
    collapsedGroupIds.delete(groupId);
  } else {
    collapsedGroupIds.add(groupId);
  }

  return {
    ...state,
    rowGrouping: {
      ...rowGrouping,
      columnIds: [...rowGrouping.columnIds],
      collapsedGroupIds: collapsedGroupIds.size > 0 ? [...collapsedGroupIds] : undefined,
    },
  };
}

export function startRemoteRequest(state: GridState, requestId: string): GridState {
  return {
    ...state,
    remoteRequest: {
      requestId,
      sequence: (state.remoteRequest?.sequence ?? 0) + 1,
      status: "loading",
    },
  };
}

export function finishRemoteRequest(state: GridState, requestId: string): GridState {
  if (!isActiveRemoteRequest(state, requestId)) {
    return state;
  }

  return setRemoteRequestStatus(state, {
    requestId,
    sequence: state.remoteRequest?.sequence ?? 0,
    status: "success",
  });
}

export function failRemoteRequest(state: GridState, requestId: string, error?: string): GridState {
  if (!isActiveRemoteRequest(state, requestId)) {
    return state;
  }

  return setRemoteRequestStatus(state, {
    requestId,
    sequence: state.remoteRequest?.sequence ?? 0,
    status: "error",
    error,
  });
}

export function cancelRemoteRequest(state: GridState, requestId = state.remoteRequest?.requestId): GridState {
  if (!requestId || !isActiveRemoteRequest(state, requestId)) {
    return state;
  }

  return setRemoteRequestStatus(state, {
    requestId,
    sequence: state.remoteRequest?.sequence ?? 0,
    status: "cancelled",
  });
}

export function isActiveRemoteRequest(state: GridState, requestId: string): boolean {
  return state.remoteRequest?.requestId === requestId && state.remoteRequest.status === "loading";
}

export function createRemoteCacheKey(state: GridState): string {
  return JSON.stringify({
    sort: state.sort ?? [],
    filters: state.filters ?? [],
    aggregation: state.aggregation ?? [],
    rowGrouping: state.rowGrouping,
    pagination: state.pagination,
    cursorPagination: state.cursorPagination,
  });
}

export function setRemoteCache(state: GridState, remoteCache: RemoteCacheState): GridState {
  return {
    ...state,
    remoteCache: normalizeRemoteCache(remoteCache),
  };
}

export function invalidateRemoteCache(
  state: GridState,
  key = state.remoteCache?.key ?? createRemoteCacheKey(state),
): GridState {
  const remoteCache = normalizeRemoteCache(state.remoteCache);

  return {
    ...state,
    remoteCache: {
      ...remoteCache,
      key,
      version: remoteCache.version + 1,
      stale: true,
      invalidatedKeys: addUniqueKey(remoteCache.invalidatedKeys, key),
    },
  };
}

export function acknowledgeRemoteCache(
  state: GridState,
  key = state.remoteCache?.key ?? createRemoteCacheKey(state),
): GridState {
  const remoteCache = normalizeRemoteCache(state.remoteCache);
  const invalidatedKeys = (remoteCache.invalidatedKeys ?? []).filter((item) => item !== key);
  const nextRemoteCache = normalizeRemoteCache({
    ...remoteCache,
    key,
    stale: invalidatedKeys.length > 0,
    invalidatedKeys: invalidatedKeys.length > 0 ? invalidatedKeys : undefined,
  });

  return {
    ...state,
    remoteCache: nextRemoteCache,
  };
}

function resetPageIndex(pagination?: PaginationState): PaginationState | undefined {
  if (!pagination) {
    return undefined;
  }

  return {
    ...pagination,
    pageIndex: 0,
  };
}

function resetCursor(cursorPagination?: CursorPaginationState): CursorPaginationState | undefined {
  if (!cursorPagination) {
    return undefined;
  }

  return {
    ...cursorPagination,
    cursor: undefined,
  };
}

function setRemoteRequestStatus(state: GridState, remoteRequest: RemoteRequestState): GridState {
  return {
    ...state,
    remoteRequest,
  };
}

function markRemoteCacheStale(remoteCache?: RemoteCacheState): RemoteCacheState | undefined {
  if (!remoteCache) {
    return undefined;
  }

  return {
    ...normalizeRemoteCache(remoteCache),
    stale: true,
  };
}

function normalizeRemoteCache(remoteCache?: RemoteCacheState): RemoteCacheState {
  const { invalidatedKeys: rawInvalidatedKeys, ...rest } = remoteCache ?? {};
  const invalidatedKeys = rawInvalidatedKeys ? [...new Set(rawInvalidatedKeys)] : undefined;
  const nextRemoteCache: RemoteCacheState = {
    ...rest,
    version: Math.max(0, Math.trunc(remoteCache?.version ?? 0)),
  };

  if (invalidatedKeys && invalidatedKeys.length > 0) {
    nextRemoteCache.invalidatedKeys = invalidatedKeys;
  }

  return nextRemoteCache;
}

function addUniqueKey(keys: string[] | undefined, key: string): string[] {
  return [...new Set([...(keys ?? []), key])];
}
