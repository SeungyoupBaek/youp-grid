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
  setAggregation as setCoreAggregation,
  setColumnHidden as setCoreColumnHidden,
  setColumnOrder as setCoreColumnOrder,
  setColumnPinned as setCoreColumnPinned,
  setColumnWidth as setCoreColumnWidth,
  setCursorPage as setCoreCursorPage,
  setCursorPageSize as setCoreCursorPageSize,
  setCursorPagination as setCoreCursorPagination,
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
  type RowModel,
} from "@youp-grid/core";
import { computed, shallowRef, toValue, type MaybeRefOrGetter } from "vue";

import type { YoupGridController, YoupGridOptions } from "./types.ts";

export function useYoupGrid<TRow>(
  optionsInput: MaybeRefOrGetter<YoupGridOptions<TRow>>,
): YoupGridController<TRow> {
  const initialOptions = toValue(optionsInput);
  const internalState = shallowRef<GridState>(createGridState(initialOptions.defaultState));
  const options = computed(() => toValue(optionsInput));
  const isControlled = computed(() => options.value.state !== undefined);
  const state = computed(() => {
    return isControlled.value ? createGridState(options.value.state) : internalState.value;
  });
  const rowModel = computed(() => buildCurrentRowModel(options.value, state.value));

  const commitState = (nextState: GridState) => {
    const currentOptions = options.value;
    const nextRowModel = buildCurrentRowModel(currentOptions, nextState);

    if (!isControlled.value) {
      internalState.value = nextState;
    }

    currentOptions.onStateChange?.({
      state: nextState,
      rowModel: nextRowModel,
    });
  };

  return {
    state,
    rowModel,
    setState: commitState,
    toggleSort: (columnId, multi) => commitState(toggleCoreSort(state.value, columnId, { multi })),
    setSort: (columnId, direction, multi) => {
      commitState(setCoreSort(state.value, columnId, direction, { multi }));
    },
    clearSort: (columnId) => commitState(clearCoreSort(state.value, columnId)),
    setFilter: (columnId, value) => {
      commitState(setCoreFilter(state.value, { columnId, operator: "contains", value }));
    },
    setFilterRule: (filter) => commitState(setCoreFilter(state.value, filter)),
    clearFilter: (columnId) => commitState(clearCoreFilter(state.value, columnId)),
    setPage: (pageIndex) => {
      commitState(
        setPagination(state.value, {
          pageIndex,
          pageSize: state.value.pagination?.pageSize ?? 50,
        }),
      );
    },
    setPageSize: (pageSize) => {
      commitState(
        setPagination(state.value, {
          pageIndex: 0,
          pageSize,
        }),
      );
    },
    setCursorPage: (cursor) => commitState(setCoreCursorPage(state.value, cursor)),
    setCursorPageSize: (pageSize) => commitState(setCoreCursorPageSize(state.value, pageSize)),
    setCursorPagination: (cursorPagination) => {
      commitState(setCoreCursorPagination(state.value, cursorPagination));
    },
    setAggregation: (aggregation) => commitState(setCoreAggregation(state.value, aggregation)),
    setRowGrouping: (rowGrouping) => commitState(setCoreRowGrouping(state.value, rowGrouping)),
    toggleRowGroupExpanded: (groupId) => {
      commitState(toggleCoreRowGroupExpanded(state.value, groupId));
    },
    startRemoteRequest: (requestId) => commitState(startCoreRemoteRequest(state.value, requestId)),
    finishRemoteRequest: (requestId) => commitState(finishCoreRemoteRequest(state.value, requestId)),
    failRemoteRequest: (requestId, error) => {
      commitState(failCoreRemoteRequest(state.value, requestId, error));
    },
    cancelRemoteRequest: (requestId) => commitState(cancelCoreRemoteRequest(state.value, requestId)),
    setRemoteCache: (remoteCache) => commitState(setCoreRemoteCache(state.value, remoteCache)),
    invalidateRemoteCache: (key) => commitState(invalidateCoreRemoteCache(state.value, key)),
    acknowledgeRemoteCache: (key) => commitState(acknowledgeCoreRemoteCache(state.value, key)),
    setColumnHidden: (columnId, hidden) => {
      commitState(setCoreColumnHidden(state.value, columnId, hidden));
    },
    setColumnPinned: (columnId, pinned) => {
      commitState(setCoreColumnPinned(state.value, columnId, pinned));
    },
    setColumnOrder: (columnIds) => {
      commitState(setCoreColumnOrder(state.value, columnIds));
    },
    setColumnWidth: (columnId, width) => {
      commitState(setCoreColumnWidth(state.value, columnId, width));
    },
    setRowSelected: (rowId, selected) => commitState(setCoreRowSelected(state.value, rowId, selected)),
    setSelectedRows: (rowIds) => commitState(setCoreSelectedRows(state.value, rowIds)),
    toggleRowSelected: (rowId) => commitState(toggleCoreRowSelected(state.value, rowId)),
    setTreeExpandedRows: (rowIds) => commitState(setCoreTreeExpandedRows(state.value, rowIds)),
    toggleTreeRowExpanded: (rowId) => commitState(toggleCoreTreeRowExpanded(state.value, rowId)),
  };
}

function buildCurrentRowModel<TRow>(
  options: YoupGridOptions<TRow>,
  state: GridState,
): RowModel<TRow> {
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
  });
}
