import {
  acknowledgeRemoteCache as acknowledgeCoreRemoteCache,
  buildRowModel,
  cancelRemoteRequest as cancelCoreRemoteRequest,
  clearFilter as clearCoreFilter,
  clearFormulaCell as clearCoreFormulaCell,
  clearSort as clearCoreSort,
  createGridState,
  failRemoteRequest as failCoreRemoteRequest,
  finishRemoteRequest as finishCoreRemoteRequest,
  invalidateRemoteCache as invalidateCoreRemoteCache,
  setColumnHidden as setCoreColumnHidden,
  setColumnOrder as setCoreColumnOrder,
  setColumnPinned as setCoreColumnPinned,
  setColumnWidth as setCoreColumnWidth,
  setCursorPage as setCoreCursorPage,
  setCursorPageSize as setCoreCursorPageSize,
  setCursorPagination as setCoreCursorPagination,
  setAggregation as setCoreAggregation,
  setFilter as setCoreFilter,
  setFormulaCell as setCoreFormulaCell,
  setPivot as setCorePivot,
  setPagination,
  setRemoteCache as setCoreRemoteCache,
  setRowGrouping as setCoreRowGrouping,
  setRowSelected as setCoreRowSelected,
  setSelectedRows as setCoreSelectedRows,
  setSort as setCoreSort,
  setTreeExpandedRows as setCoreTreeExpandedRows,
  startRemoteRequest as startCoreRemoteRequest,
  toggleRowGroupExpanded as toggleCoreRowGroupExpanded,
  togglePivotRowExpanded as toggleCorePivotRowExpanded,
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
  const controlledState = useMemo(
    () => options.state === undefined ? undefined : createGridState(options.state),
    [options.state],
  );
  const state = controlledState ?? internalState;

  const rowModel = useMemo(() => {
    return buildRowModel({
      rows: options.rows,
      columns: options.columns,
      state,
      getRowId: options.getRowId,
      treeData: options.treeData,
      getParentRowId: options.getParentRowId,
      pinnedTopRows: options.pinnedTopRows,
      pinnedBottomRows: options.pinnedBottomRows,
      rowModelType: options.rowModelType,
      serverRowCount: options.serverRowCount,
      serverFilteredRowCount: options.serverFilteredRowCount,
      serverPivotModel: options.serverPivotModel,
      formulaEngine: options.formulaEngine,
    });
  }, [
    options.rows,
    options.columns,
    options.getRowId,
    options.treeData,
    options.getParentRowId,
    options.pinnedTopRows,
    options.pinnedBottomRows,
    options.rowModelType,
    options.serverRowCount,
    options.serverFilteredRowCount,
    options.serverPivotModel,
    options.formulaEngine,
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
        pinnedTopRows: options.pinnedTopRows,
        pinnedBottomRows: options.pinnedBottomRows,
        rowModelType: options.rowModelType,
        serverRowCount: options.serverRowCount,
        serverFilteredRowCount: options.serverFilteredRowCount,
        serverPivotModel: options.serverPivotModel,
        formulaEngine: options.formulaEngine,
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
    setFilterRule: (filter) => commitState(setCoreFilter(state, filter)),
    clearFilter: (columnId) => commitState(clearCoreFilter(state, columnId)),
    setPage,
    setPageSize,
    setCursorPage: (cursor) => commitState(setCoreCursorPage(state, cursor)),
    setCursorPageSize: (pageSize) => commitState(setCoreCursorPageSize(state, pageSize)),
    setCursorPagination: (cursorPagination) => commitState(setCoreCursorPagination(state, cursorPagination)),
    setAggregation: (aggregation) => commitState(setCoreAggregation(state, aggregation)),
    setRowGrouping: (rowGrouping) => commitState(setCoreRowGrouping(state, rowGrouping)),
    toggleRowGroupExpanded: (groupId) => commitState(toggleCoreRowGroupExpanded(state, groupId)),
    setPivot: (pivot) => commitState(setCorePivot(state, pivot)),
    togglePivotRowExpanded: (rowId) => commitState(toggleCorePivotRowExpanded(state, rowId)),
    setFormulaCell: (cell) => commitState(setCoreFormulaCell(state, cell)),
    clearFormulaCell: (rowId, columnId) => commitState(clearCoreFormulaCell(state, rowId, columnId)),
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
    setColumnOrder: (columnIds) => {
      commitState(setCoreColumnOrder(state, columnIds));
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
