import {
  acknowledgeRemoteCache as acknowledgeCoreRemoteCache,
  buildRowModel,
  cancelRemoteRequest as cancelCoreRemoteRequest,
  clearFilter as clearCoreFilter,
  clearSort as clearCoreSort,
  createGridState,
  failRemoteRequest as failCoreRemoteRequest,
  finishRemoteRequest as finishCoreRemoteRequest,
  invalidateRemoteCache as invalidateCoreRemoteCache,
  setColumnHidden as setCoreColumnHidden,
  setColumnPinned as setCoreColumnPinned,
  setColumnWidth as setCoreColumnWidth,
  setCursorPage as setCoreCursorPage,
  setCursorPageSize as setCoreCursorPageSize,
  setCursorPagination as setCoreCursorPagination,
  setAggregation as setCoreAggregation,
  setFilter as setCoreFilter,
  setPagination,
  setRemoteCache as setCoreRemoteCache,
  setRowGrouping as setCoreRowGrouping,
  setRowSelected as setCoreRowSelected,
  setSelectedRows as setCoreSelectedRows,
  setSort as setCoreSort,
  setTreeExpandedRows as setCoreTreeExpandedRows,
  startRemoteRequest as startCoreRemoteRequest,
  toggleRowGroupExpanded as toggleCoreRowGroupExpanded,
  toggleRowSelected as toggleCoreRowSelected,
  toggleSort as toggleCoreSort,
  toggleTreeRowExpanded as toggleCoreTreeRowExpanded,
  type GridState,
} from "@youp-grid/core";
import { useCallback, useMemo, useState } from "react";

import type { YoupGridController, YoupGridOptions } from "./types.ts";

export function useYoupGrid<TRow>(options: YoupGridOptions<TRow>): YoupGridController<TRow> {
  const isControlled = options.state !== undefined;
  const [internalState, setInternalState] = useState<GridState>(() => {
    return createGridState(options.defaultState);
  });
  const state = isControlled ? createGridState(options.state) : internalState;

  const rowModel = useMemo(() => {
    return buildRowModel({
      rows: options.rows,
      columns: options.columns,
      state,
      getRowId: options.getRowId,
      treeData: options.treeData,
      getParentRowId: options.getParentRowId,
      rowModelType: options.rowModelType,
      serverRowCount: options.serverRowCount,
      serverFilteredRowCount: options.serverFilteredRowCount,
    });
  }, [
    options.rows,
    options.columns,
    options.getRowId,
    options.treeData,
    options.getParentRowId,
    options.rowModelType,
    options.serverRowCount,
    options.serverFilteredRowCount,
    state,
  ]);

  const commitState = useCallback(
    (nextState: GridState) => {
      const nextRowModel = buildRowModel({
        rows: options.rows,
        columns: options.columns,
        state: nextState,
        getRowId: options.getRowId,
        treeData: options.treeData,
        getParentRowId: options.getParentRowId,
        rowModelType: options.rowModelType,
        serverRowCount: options.serverRowCount,
        serverFilteredRowCount: options.serverFilteredRowCount,
      });

      if (!isControlled) {
        setInternalState(nextState);
      }

      options.onStateChange?.({
        state: nextState,
        rowModel: nextRowModel,
      });
    },
    [isControlled, options],
  );

  const setPage = useCallback(
    (pageIndex: number) => {
      commitState(
        setPagination(state, {
          pageIndex,
          pageSize: state.pagination?.pageSize ?? 50,
        }),
      );
    },
    [commitState, state],
  );

  const setPageSize = useCallback(
    (pageSize: number) => {
      commitState(
        setPagination(state, {
          pageIndex: 0,
          pageSize,
        }),
      );
    },
    [commitState, state],
  );

  return {
    state,
    rowModel,
    setState: commitState,
    toggleSort: (columnId, multi) => commitState(toggleCoreSort(state, columnId, { multi })),
    setSort: (columnId, direction, multi) => commitState(setCoreSort(state, columnId, direction, { multi })),
    clearSort: (columnId) => commitState(clearCoreSort(state, columnId)),
    setFilter: (columnId, value) => {
      commitState(setCoreFilter(state, { columnId, operator: "contains", value }));
    },
    clearFilter: (columnId) => commitState(clearCoreFilter(state, columnId)),
    setPage,
    setPageSize,
    setCursorPage: (cursor) => commitState(setCoreCursorPage(state, cursor)),
    setCursorPageSize: (pageSize) => commitState(setCoreCursorPageSize(state, pageSize)),
    setCursorPagination: (cursorPagination) => commitState(setCoreCursorPagination(state, cursorPagination)),
    setAggregation: (aggregation) => commitState(setCoreAggregation(state, aggregation)),
    setRowGrouping: (rowGrouping) => commitState(setCoreRowGrouping(state, rowGrouping)),
    toggleRowGroupExpanded: (groupId) => commitState(toggleCoreRowGroupExpanded(state, groupId)),
    startRemoteRequest: (requestId) => commitState(startCoreRemoteRequest(state, requestId)),
    finishRemoteRequest: (requestId) => commitState(finishCoreRemoteRequest(state, requestId)),
    failRemoteRequest: (requestId, error) => commitState(failCoreRemoteRequest(state, requestId, error)),
    cancelRemoteRequest: (requestId) => commitState(cancelCoreRemoteRequest(state, requestId)),
    setRemoteCache: (remoteCache) => commitState(setCoreRemoteCache(state, remoteCache)),
    invalidateRemoteCache: (key) => commitState(invalidateCoreRemoteCache(state, key)),
    acknowledgeRemoteCache: (key) => commitState(acknowledgeCoreRemoteCache(state, key)),
    setColumnHidden: (columnId, hidden) => {
      commitState(setCoreColumnHidden(state, columnId, hidden));
    },
    setColumnPinned: (columnId, pinned) => {
      commitState(setCoreColumnPinned(state, columnId, pinned));
    },
    setColumnWidth: (columnId, width) => {
      commitState(setCoreColumnWidth(state, columnId, width));
    },
    setRowSelected: (rowId, selected) => commitState(setCoreRowSelected(state, rowId, selected)),
    setSelectedRows: (rowIds) => commitState(setCoreSelectedRows(state, rowIds)),
    toggleRowSelected: (rowId) => commitState(toggleCoreRowSelected(state, rowId)),
    setTreeExpandedRows: (rowIds) => commitState(setCoreTreeExpandedRows(state, rowIds)),
    toggleTreeRowExpanded: (rowId) => commitState(toggleCoreTreeRowExpanded(state, rowId)),
  };
}
