import {
  createRemoteCacheKey,
  createValueHistoryState,
  exportGridCsv,
  getFillHandleCells,
  getFillHandleTargetRange,
  getInfiniteScrollTrigger,
  getVirtualRange,
  getClipboardPasteCells,
  isCellInRange,
  isRowGroupNode,
  normalizeCellRange,
  parseClipboardText,
  pushValueHistoryEntry,
  redoValueHistory,
  serializeGridRange,
  undoValueHistory,
  type AggregationResult,
  type ColumnEditorOption,
  type ColumnEditorOptionValue,
  type ColumnPin,
  type CursorPaginationState,
  type GridCellRange,
  type GridValueHistoryEntry,
  type GridValueHistoryState,
  type GridRowId,
  type NormalizedGridCellRange,
  type ResolvedColumnDef,
  type RowDisplayNode,
  type RowGroupNode,
  type RowModel,
  type RowNode,
} from "@youp-grid/core";
import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent as ReactChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  CSSProperties,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  UIEvent as ReactUIEvent,
} from "react";

import type {
  YoupGridCellEditCommitReason,
  YoupGridCellContext,
  YoupGridCellMeta,
  YoupGridCellValueChangeSource,
  YoupGridCellsValueChangeSource,
  YoupGridDensity,
  YoupGridHeaderContext,
  YoupGridProps,
  YoupGridRowEvent,
} from "./types.ts";
import { useYoupGrid } from "./useYoupGrid.ts";

const VALUE_HISTORY_LIMIT = 100;
const DEFAULT_DENSITY: YoupGridDensity = "standard";
const DENSITY_ROW_HEIGHTS: Record<YoupGridDensity, number> = {
  compact: 30,
  standard: 38,
  comfortable: 46,
};
const SELECTION_COLUMN_WIDTH = 44;

export function YoupGrid<TRow>(props: YoupGridProps<TRow>) {
  const controller = useYoupGrid(props);
  const rowModel = controller.rowModel;
  const [internalDensity, setInternalDensity] = useState<YoupGridDensity>(
    props.defaultDensity ?? DEFAULT_DENSITY,
  );
  const density = props.density ?? internalDensity;
  const rowHeight = props.rowHeight ?? DENSITY_ROW_HEIGHTS[density];
  const viewportHeight = normalizeHeight(props.height) ?? 420;
  const loading = props.loading ?? controller.state.remoteRequest?.status === "loading";
  const infiniteScrollLoading = props.infiniteScrollLoading ?? loading;
  const headerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const lastRowsEndReachedKeyRef = useRef<string | undefined>();
  const skipNextBlurCommitRef = useRef(false);
  const valueHistoryRef = useRef<GridValueHistoryState>(createValueHistoryState());
  const [scrollTop, setScrollTop] = useState(0);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [focusedColumnIndex, setFocusedColumnIndex] = useState(0);
  const [selectionRange, setSelectionRange] = useState<GridCellRange | undefined>();
  const [fillRange, setFillRange] = useState<NormalizedGridCellRange | undefined>();
  const [editingCell, setEditingCell] = useState<EditingCell | undefined>();
  const [columnChooserOpen, setColumnChooserOpen] = useState(false);
  const [columnMenuOpenId, setColumnMenuOpenId] = useState<string | undefined>();
  const showRowSelectionColumn = props.showRowSelectionColumn ?? false;
  const gridEditable = (props.editable ?? true) && !props.readOnly;
  const displayRows = rowModel.displayRows;
  const virtualRange = useMemo(() => {
    return getVirtualRange({
      itemCount: displayRows.length,
      itemSize: rowHeight,
      viewportSize: viewportHeight,
      scrollOffset: scrollTop,
      overscan: props.overscan,
    });
  }, [displayRows.length, props.overscan, rowHeight, scrollTop, viewportHeight]);
  const lastVisibleRowIndex = useMemo(() => {
    if (rowModel.visibleRows.length === 0) {
      return -1;
    }

    return Math.min(
      rowModel.visibleRows.length - 1,
      Math.max(-1, Math.ceil((scrollTop + viewportHeight) / rowHeight) - 1),
    );
  }, [rowHeight, rowModel.visibleRows.length, scrollTop, viewportHeight]);
  const infiniteScrollTrigger = useMemo(() => {
    return getInfiniteScrollTrigger({
      rowCount: rowModel.visibleRows.length,
      lastVisibleRowIndex,
      threshold: props.infiniteScrollThreshold,
      hasMoreRows: props.hasMoreRows,
      loading: infiniteScrollLoading,
    });
  }, [
    infiniteScrollLoading,
    props.hasMoreRows,
    props.infiniteScrollThreshold,
    lastVisibleRowIndex,
    rowModel.visibleRows.length,
  ]);
  const infiniteScrollLoadKey = useMemo(() => {
    return `${createRemoteCacheKey(controller.state)}:${infiniteScrollTrigger.rowCount}`;
  }, [controller.state, infiniteScrollTrigger.rowCount]);
  const currentSelectedRowIds = controller.state.selectedRowIds ?? [];
  const selectedRowIds = new Set(currentSelectedRowIds);
  const visibleRowIds = useMemo(() => rowModel.visibleRows.map((row) => row.id), [rowModel.visibleRows]);
  const selectedVisibleRowCount = visibleRowIds.filter((rowId) => selectedRowIds.has(rowId)).length;
  const allVisibleRowsSelected = visibleRowIds.length > 0 && selectedVisibleRowCount === visibleRowIds.length;
  const someVisibleRowsSelected = selectedVisibleRowCount > 0 && !allVisibleRowsSelected;
  const columnLayouts = useMemo(() => {
    return getColumnLayouts(rowModel.visibleColumns, {
      leftOffset: showRowSelectionColumn ? SELECTION_COLUMN_WIDTH : 0,
    });
  }, [rowModel.visibleColumns, showRowSelectionColumn]);
  const visibleColumns = useMemo(() => columnLayouts.map((layout) => layout.column), [columnLayouts]);
  const visibleRowIndexById = useMemo(() => {
    return new Map(rowModel.visibleRows.map((row, index) => [row.id, index]));
  }, [rowModel.visibleRows]);
  const displayIndexByVisibleRowIndex = useMemo(() => {
    const displayIndexByRowId = new Map<GridRowId, number>();

    displayRows.forEach((row, index) => {
      if (!isRowGroupNode(row)) {
        displayIndexByRowId.set(row.id, index);
      }
    });

    return new Map(
      rowModel.visibleRows.map((row, index) => [
        index,
        displayIndexByRowId.get(row.id) ?? index,
      ]),
    );
  }, [displayRows, rowModel.visibleRows]);
  const headerGroupLayouts = useMemo(() => getHeaderGroupLayouts(columnLayouts), [columnLayouts]);
  const hasHeaderGroups = headerGroupLayouts.some((layout) => layout.headerGroup);
  const showAggregationFooter = (props.showAggregationFooter ?? true) && rowModel.aggregation.length > 0;
  const focusedCell = {
    rowIndex: focusedRowIndex,
    columnIndex: focusedColumnIndex,
  };
  const gridStyle = {
    ...props.style,
  };
  const renderedRows = virtualRange.items
    .map((item) => {
      const row = displayRows[item.index];

      return row ? { row, displayIndex: item.index } : undefined;
    })
    .filter((item): item is { row: RowDisplayNode<TRow>; displayIndex: number } => Boolean(item));
  const getCellEditContext = (
    row: RowNode<TRow>,
    rowIndex: number,
    column: ResolvedColumnDef<TRow>,
  ) => {
    return {
      row: row.original,
      rowNode: row,
      rowId: row.id,
      rowIndex,
      column,
      columnId: column.id,
      value: column.accessor(row.original),
    };
  };
  const canEditGridCell = (
    row: RowNode<TRow>,
    rowIndex: number,
    column: ResolvedColumnDef<TRow>,
  ) => {
    if (!gridEditable || column.editable === false) {
      return false;
    }

    return props.canEditCell?.(getCellEditContext(row, rowIndex, column)) ?? true;
  };
  const getGridCellMeta = (
    row: RowNode<TRow>,
    rowIndex: number,
    column: ResolvedColumnDef<TRow>,
  ) => {
    return (
      props.getCellMeta?.(getCellEditContext(row, rowIndex, column)) ??
      props.cellMeta?.[`${row.id}:${column.id}`]
    );
  };
  const createGridCellValueChange = (cell: CellRenderState<TRow>, value: unknown) => {
    if (!cell.editable) {
      return undefined;
    }

    if (Object.is(value, cell.value)) {
      return undefined;
    }

    return {
      row: cell.row.original,
      rowId: cell.row.id,
      rowIndex: cell.rowIndex,
      column: cell.column,
      columnId: cell.column.id,
      value,
      previousValue: cell.value,
    };
  };

  useEffect(() => {
    if (focusedRowIndex >= rowModel.visibleRows.length) {
      setFocusedRowIndex(Math.max(0, rowModel.visibleRows.length - 1));
    }
  }, [focusedRowIndex, rowModel.visibleRows.length]);

  useEffect(() => {
    if (focusedColumnIndex >= columnLayouts.length) {
      setFocusedColumnIndex(Math.max(0, columnLayouts.length - 1));
    }
  }, [columnLayouts.length, focusedColumnIndex]);

  useEffect(() => {
    if (columnMenuOpenId && !visibleColumns.some((column) => column.id === columnMenuOpenId)) {
      setColumnMenuOpenId(undefined);
    }
  }, [columnMenuOpenId, visibleColumns]);

  useEffect(() => {
    if (!props.infiniteScroll || !props.onRowsEndReached || !infiniteScrollTrigger.shouldLoadMore) {
      return;
    }

    if (lastRowsEndReachedKeyRef.current === infiniteScrollLoadKey) {
      return;
    }

    lastRowsEndReachedKeyRef.current = infiniteScrollLoadKey;
    props.onRowsEndReached({
      state: controller.state,
      rowModel,
      rowCount: infiniteScrollTrigger.rowCount,
      lastVisibleRowIndex: infiniteScrollTrigger.lastVisibleRowIndex,
      threshold: infiniteScrollTrigger.threshold,
      remainingRows: infiniteScrollTrigger.remainingRows,
    });
  }, [
    controller.state,
    infiniteScrollLoadKey,
    infiniteScrollTrigger,
    props.infiniteScroll,
    props.onRowsEndReached,
    rowModel,
  ]);

  const startEditingCell = (cell: EditingCell) => {
    skipNextBlurCommitRef.current = false;
    setEditingCell(cell);
  };
  const cancelEditingCell = () => {
    skipNextBlurCommitRef.current = true;
    setEditingCell(undefined);
  };
  const applyCellValueChanges = (
    changes: PendingCellValueChange<TRow>[],
    source: YoupGridCellValueChangeSource,
  ) => {
    if (changes.length === 0) {
      return;
    }

    if (source === "edit" || source === "paste" || source === "fill" || source === "delete") {
      valueHistoryRef.current = pushValueHistoryEntry(
        valueHistoryRef.current,
        {
          changes: changes.map((change) => ({
            rowId: change.rowId,
            rowIndex: change.rowIndex,
            columnId: change.columnId,
            previousValue: change.previousValue,
            value: change.value,
          })),
        },
        { maxEntries: VALUE_HISTORY_LIMIT },
      );
    }

    const emittedChanges = changes.map((change) => ({
      ...change,
      source,
    }));

    for (const change of emittedChanges) {
      props.onCellValueChange?.(change);
    }

    if (source === "paste" || source === "fill") {
      props.onCellsValueChange?.({
        changes: emittedChanges,
        source: source as YoupGridCellsValueChangeSource,
      });
    }
  };
  const applyCellValue = (cell: CellRenderState<TRow>, value: unknown) => {
    const change = createGridCellValueChange(cell, value);

    if (!change) {
      return;
    }

    applyCellValueChanges([change], "edit");
  };
  const applyValueHistoryEntry = (
    entry: GridValueHistoryEntry,
    source: Extract<YoupGridCellValueChangeSource, "undo" | "redo">,
  ) => {
    applyCellValueChanges(
      getHistoryEntryValueChanges({
        entry,
        rowModel,
        source,
        canEditCell: canEditGridCell,
      }),
      source,
    );
  };
  const undoCellValueChange = () => {
    const result = undoValueHistory(valueHistoryRef.current);

    if (!result.entry) {
      return false;
    }

    valueHistoryRef.current = result.state;
    applyValueHistoryEntry(result.entry, "undo");

    return true;
  };
  const redoCellValueChange = () => {
    const result = redoValueHistory(valueHistoryRef.current);

    if (!result.entry) {
      return false;
    }

    valueHistoryRef.current = result.state;
    applyValueHistoryEntry(result.entry, "redo");

    return true;
  };
  const commitEditingValue = (
    cell: EditingCell,
    reason: YoupGridCellEditCommitReason = "enter",
  ) => {
    if (reason === "blur" && skipNextBlurCommitRef.current) {
      skipNextBlurCommitRef.current = false;
      return;
    }

    if (reason !== "blur") {
      skipNextBlurCommitRef.current = true;
    }

    const change = commitEditingCell({
      cell,
      rowModel,
      canEditCell: canEditGridCell,
    });

    if (change) {
      if (!Object.is(change.value, change.previousValue)) {
        applyCellValueChanges([change], "edit");
      }

      props.onCellEditCommit?.({
        ...change,
        reason,
      });
    }

    setEditingCell(undefined);
  };
  const setFocusedCell = (cell: FocusedCell, extendSelection = false, selectionAnchor?: FocusedCell) => {
    if (extendSelection) {
      setSelectionRange({
        anchor: selectionRange?.anchor ?? selectionAnchor ?? focusedCell,
        focus: cell,
      });
    } else {
      setSelectionRange(undefined);
    }

    setFocusedRowIndex(cell.rowIndex);
    setFocusedColumnIndex(cell.columnIndex);
  };
  const setDensity = (nextDensity: YoupGridDensity) => {
    if (props.density === undefined) {
      setInternalDensity(nextDensity);
    }

    props.onDensityChange?.(nextDensity);
  };
  const setVisibleRowsSelected = (selected: boolean) => {
    if (selected) {
      controller.setSelectedRows([...new Set([...currentSelectedRowIds, ...visibleRowIds])]);
      return;
    }

    const visibleRowIdSet = new Set(visibleRowIds);
    controller.setSelectedRows(currentSelectedRowIds.filter((rowId) => !visibleRowIdSet.has(rowId)));
  };

  return createElement(
    "div",
    {
      className: [
        "youp-grid",
        `youp-grid--density-${density}`,
        !gridEditable ? "youp-grid--read-only" : "",
        props.className,
      ].filter(Boolean).join(" "),
      style: gridStyle,
    },
    renderColumnToolbar({
      showColumnChooser: props.showColumnChooser ?? true,
      showCsvExport: props.showCsvExport ?? true,
      showDensityControl: props.showDensityControl ?? true,
      density,
      open: columnChooserOpen,
      columns: rowModel.columns,
      toggleOpen: () => setColumnChooserOpen((current) => !current),
      setDensity,
      setColumnHidden: controller.setColumnHidden,
      setColumnPinned: controller.setColumnPinned,
      exportCsv: () => {
        downloadTextFile({
          fileName: props.csvFileName ?? "youp-grid.csv",
          mimeType: "text/csv;charset=utf-8",
          text: exportGridCsv({
            rows: rowModel.visibleRows,
            columns: visibleColumns,
          }),
        });
      },
    }),
    renderDisabledReason({
      enabled: !gridEditable,
      reason: props.disabledReason,
    }),
    createElement(
      "div",
      {
        className: "youp-grid__viewport",
        role: "grid",
        "aria-rowcount": displayRows.length,
        "aria-colcount": rowModel.visibleColumns.length + (showRowSelectionColumn ? 1 : 0),
        "aria-busy": loading || undefined,
        "aria-readonly": !gridEditable || undefined,
        onCopy: (event: ReactClipboardEvent<HTMLDivElement>) => {
          if (editingCell) {
            return;
          }

          handleGridCopy({
            event,
            focusedCell,
            selectionRange,
            rows: rowModel.visibleRows,
            columns: visibleColumns,
          });
        },
        onPaste: (event: ReactClipboardEvent<HTMLDivElement>) => {
          if (editingCell || !gridEditable) {
            return;
          }

          handleGridPaste({
            event,
            focusedCell,
            selectionRange,
            rows: rowModel.visibleRows,
            columns: visibleColumns,
            canEditCell: canEditGridCell,
            applyCellValueChanges,
          });
        },
      },
      createElement(
        "div",
        { className: "youp-grid__header", role: "rowgroup", ref: headerRef },
        hasHeaderGroups
          ? createElement(
              "div",
              { className: "youp-grid__row youp-grid__row--header-group", role: "row" },
              showRowSelectionColumn
                ? renderSelectionHeaderGroupCell()
                : undefined,
              headerGroupLayouts.map((layout) => renderHeaderGroupCell(layout)),
            )
          : undefined,
        createElement(
          "div",
          { className: "youp-grid__row youp-grid__row--header", role: "row" },
          showRowSelectionColumn
            ? renderSelectionHeaderCell({
                checked: allVisibleRowsSelected,
                indeterminate: someVisibleRowsSelected,
                disabled: visibleRowIds.length === 0,
                toggleSelected: setVisibleRowsSelected,
              })
            : undefined,
          columnLayouts.map((layout) => {
            const sorted = controller.state.sort?.find((rule) => rule.columnId === layout.column.id)?.direction;

            return renderHeaderCell({
              layout,
              sorted,
              toggleSort: () => controller.toggleSort(layout.column.id),
              setSort: (direction) => controller.setSort(layout.column.id, direction),
              clearSort: () => controller.clearSort(layout.column.id),
              filterValue: getFilterValue(controller.state, layout.column.id),
              showFilter: props.showFilters ?? true,
              setFilter: (value) => {
                if (value) {
                  controller.setFilter(layout.column.id, value);
                } else {
                  controller.clearFilter(layout.column.id);
                }
              },
              resizeColumn: (width) => controller.setColumnWidth(layout.column.id, width),
              showMenu: props.showColumnMenu ?? true,
              menuOpen: columnMenuOpenId === layout.column.id,
              toggleMenu: () => {
                setColumnMenuOpenId((current) => current === layout.column.id ? undefined : layout.column.id);
              },
              closeMenu: () => setColumnMenuOpenId(undefined),
              setColumnHidden: (hidden) => controller.setColumnHidden(layout.column.id, hidden),
              setColumnPinned: (pinned) => controller.setColumnPinned(layout.column.id, pinned),
              renderHeader: props.renderHeader,
            });
          }),
        ),
      ),
      createElement(
        "div",
        {
          className: "youp-grid__body",
          role: "rowgroup",
          ref: bodyRef,
          style: { height: viewportHeight },
          onScroll: (event: ReactUIEvent<HTMLDivElement>) => {
            if (headerRef.current) {
              headerRef.current.style.setProperty(
                "--youp-grid-header-scroll-left",
                `${event.currentTarget.scrollLeft}px`,
              );
            }

            setScrollTop(event.currentTarget.scrollTop);
          },
        },
        rowModel.visibleRows.length === 0 && !props.loading && !props.error
          ? createElement("div", { className: "youp-grid__empty" }, props.emptyContent ?? "No rows")
          : rowModel.visibleRows.length === 0
            ? undefined
            : createElement(
            "div",
            {
              className: "youp-grid__virtual-spacer",
              style: { height: virtualRange.totalSize },
            },
            createElement(
              "div",
              {
                className: "youp-grid__virtual-window",
                style: { transform: `translateY(${virtualRange.beforeSize}px)` },
              },
              renderedRows.map(({ row, displayIndex }) => {
                if (isRowGroupNode(row)) {
                  return renderGroupRow({
                    row,
                    columns: columnLayouts,
                    showSelectionColumn: showRowSelectionColumn,
                    rowHeight,
                    toggleExpanded: controller.toggleRowGroupExpanded,
                  });
                }

                const rowIndex = visibleRowIndexById.get(row.id) ?? displayIndex;

                return renderRow({
                  row,
                  columns: columnLayouts,
                  selected: selectedRowIds.has(row.id),
                  showSelectionColumn: showRowSelectionColumn,
                  displayIndex,
                  rowIndex,
                  rowHeight,
                  focusedCell: {
                    rowIndex: focusedRowIndex,
                    columnIndex: focusedColumnIndex,
                  },
                  selectionRange,
                  fillRange,
                  editingCell,
                  editable: gridEditable,
                  disabledReason: props.disabledReason,
                  canEditCell: canEditGridCell,
                  getCellMeta: getGridCellMeta,
                  setRowSelected: (selected) => controller.setRowSelected(row.id, selected),
                  setFocusedCell,
                  startFillHandle: (event) => {
                    if (!gridEditable) {
                      return;
                    }

                    const sourceRange = normalizeCellRange(selectionRange ?? {
                      anchor: focusedCell,
                      focus: focusedCell,
                    });

                    startFillHandleDrag({
                      event,
                      sourceRange,
                      rowCount: rowModel.visibleRows.length,
                      columnCount: columnLayouts.length,
                      setFillRange,
                      applyFillRange: (targetRange) => {
                        applyFillHandleValues({
                          sourceRange,
                          targetRange,
                          rows: rowModel.visibleRows,
                          columns: visibleColumns,
                          canEditCell: canEditGridCell,
                          applyCellValueChanges,
                        });

                        const nextSelectionRange = getFillSelectionRange(sourceRange, targetRange);
                        setSelectionRange(nextSelectionRange);
                        setFocusedRowIndex(nextSelectionRange.focus.rowIndex);
                        setFocusedColumnIndex(nextSelectionRange.focus.columnIndex);
                      },
                    });
                  },
                  applyCellValue,
                  startEditing: startEditingCell,
                  updateEditingDraft: (draftValue) => {
                    setEditingCell((current) => current ? { ...current, draftValue } : current);
                  },
                  cancelEditing: cancelEditingCell,
                  commitEditing: commitEditingValue,
                  onRowClick: props.onRowClick,
                  onRowDoubleClick: props.onRowDoubleClick,
                  onCellKeyDown: (event, cell) => {
                    handleCellKeyDown({
                      event,
                      cell,
                      rowCount: rowModel.visibleRows.length,
                      columnCount: columnLayouts.length,
                      rowHeight,
                      bodyElement: bodyRef.current,
                      getDisplayRowIndex: (rowIndex) => displayIndexByVisibleRowIndex.get(rowIndex) ?? rowIndex,
                      setFocusedCell,
                      selectionRange,
                      startEditing: startEditingCell,
                      commitEditing: commitEditingValue,
                      cancelEditing: cancelEditingCell,
                      applyCellValue,
                      deleteCellValues: () => {
                        deleteGridCellValues({
                          focusedCell,
                          selectionRange,
                          rows: rowModel.visibleRows,
                          columns: visibleColumns,
                          canEditCell: canEditGridCell,
                          applyCellValueChanges,
                        });
                      },
                      undoCellValueChange,
                      redoCellValueChange,
                      toggleSelected: () => controller.toggleRowSelected(row.id),
                    });
                  },
                  renderCell: props.renderCell,
                });
              }),
            ),
          ),
        renderGridOverlay({
          loading,
          loadingContent: props.loadingContent,
          error: props.error,
          errorContent: props.errorContent,
        }),
      ),
      renderAggregationFooter({
        enabled: showAggregationFooter,
        aggregation: rowModel.aggregation,
        columns: columnLayouts,
        showSelectionColumn: showRowSelectionColumn,
      }),
    ),
    renderPagination({
      enabled: props.showPagination ?? true,
      cursorPagination: controller.state.cursorPagination,
      pageCount: rowModel.pageCount,
      pagination: controller.state.pagination,
      visibleRowCount: rowModel.visibleRowCount,
      filteredRowCount: rowModel.filteredRowCount,
      setCursorPage: controller.setCursorPage,
      setCursorPageSize: controller.setCursorPageSize,
      setPage: controller.setPage,
      setPageSize: controller.setPageSize,
    }),
  );
}

function renderGridOverlay(context: {
  loading?: boolean;
  loadingContent?: ReactNode;
  error?: boolean;
  errorContent?: ReactNode;
}) {
  if (context.error) {
    return createElement(
      "div",
      { className: "youp-grid__overlay youp-grid__overlay--error", role: "alert" },
      createElement("div", { className: "youp-grid__overlay-content" }, context.errorContent ?? "Unable to load rows"),
    );
  }

  if (context.loading) {
    return createElement(
      "div",
      { className: "youp-grid__overlay youp-grid__overlay--loading", role: "status", "aria-live": "polite" },
      createElement("div", { className: "youp-grid__overlay-content" }, context.loadingContent ?? "Loading rows"),
    );
  }

  return undefined;
}

function renderDisabledReason(context: {
  enabled: boolean;
  reason?: ReactNode;
}) {
  if (!context.enabled || context.reason == null) {
    return undefined;
  }

  return createElement(
    "div",
    { className: "youp-grid__disabled-reason", role: "status" },
    context.reason,
  );
}

function renderAggregationFooter<TRow>(context: {
  enabled: boolean;
  aggregation: readonly AggregationResult[];
  columns: readonly ColumnLayout<TRow>[];
  showSelectionColumn: boolean;
}) {
  if (!context.enabled) {
    return undefined;
  }

  const aggregationByColumn = groupAggregationByColumn(context.aggregation);

  return createElement(
    "div",
    { className: "youp-grid__aggregation", role: "rowgroup" },
    createElement(
      "div",
      { className: "youp-grid__row youp-grid__row--aggregation", role: "row" },
      context.showSelectionColumn ? renderSelectionAggregationCell() : undefined,
      context.columns.map((layout) => {
        const results = aggregationByColumn.get(layout.column.id) ?? [];

        return createElement(
          "div",
          {
            key: layout.column.id,
            className: getCellClassName("youp-grid__cell youp-grid__cell--aggregation", layout),
            role: "gridcell",
            style: getCellStyle(layout),
          },
          results.map(formatAggregationResult).join(" · "),
        );
      }),
    ),
  );
}

function renderSelectionAggregationCell() {
  return createElement(
    "div",
    {
      className: "youp-grid__selection-cell youp-grid__selection-cell--aggregation",
      role: "gridcell",
      style: getSelectionCellStyle(),
      "aria-hidden": true,
    },
  );
}

function groupAggregationByColumn(results: readonly AggregationResult[]): Map<string, AggregationResult[]> {
  const byColumn = new Map<string, AggregationResult[]>();

  for (const result of results) {
    const existing = byColumn.get(result.columnId) ?? [];

    existing.push(result);
    byColumn.set(result.columnId, existing);
  }

  return byColumn;
}

function formatAggregationResult(result: AggregationResult): string {
  return `${result.label} ${formatAggregationValue(result.value)}`;
}

function formatAggregationValue(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2);
}

function renderHeaderGroupCell<TRow>(layout: HeaderGroupLayout<TRow>) {
  return createElement(
    "div",
    {
      key: layout.id,
      className: getHeaderGroupClassName(layout),
      role: "columnheader",
      "aria-colspan": layout.columnCount,
      "aria-hidden": layout.headerGroup ? undefined : true,
      style: getHeaderGroupStyle(layout),
    },
    layout.headerGroup ?? "",
  );
}

function renderSelectionHeaderGroupCell() {
  return createElement("div", {
    key: "__selection-group",
    className: "youp-grid__cell youp-grid__cell--header-group youp-grid__selection-cell youp-grid__selection-cell--header-group",
    role: "columnheader",
    "aria-hidden": true,
    style: getSelectionCellStyle(),
  });
}

function renderSelectionHeaderCell(context: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  toggleSelected: (selected: boolean) => void;
}) {
  return createElement(
    "div",
    {
      key: "__selection",
      className: "youp-grid__cell youp-grid__cell--header youp-grid__selection-cell youp-grid__selection-cell--header",
      role: "columnheader",
      style: getSelectionCellStyle(),
    },
    createElement(SelectionHeaderCheckbox, context),
  );
}

function SelectionHeaderCheckbox(context: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  toggleSelected: (selected: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = context.indeterminate;
    }
  }, [context.indeterminate]);

  return createElement("input", {
    className: "youp-grid__selection-checkbox",
    type: "checkbox",
    checked: context.checked,
    disabled: context.disabled,
    "aria-label": "Select visible rows",
    "aria-checked": context.indeterminate ? "mixed" : context.checked,
    ref: inputRef,
    onChange: (event: ReactChangeEvent<HTMLInputElement>) => {
      context.toggleSelected(event.currentTarget.checked);
    },
    onClick: (event: ReactMouseEvent<HTMLInputElement>) => {
      event.stopPropagation();
    },
  });
}

function renderHeaderCell<TRow>(context: {
  layout: ColumnLayout<TRow>;
  sorted: "asc" | "desc" | undefined;
  toggleSort: () => void;
  setSort: (direction: "asc" | "desc") => void;
  clearSort: () => void;
  filterValue: string;
  showFilter: boolean;
  setFilter: (value: string) => void;
  resizeColumn: (width: number) => void;
  showMenu: boolean;
  menuOpen: boolean;
  toggleMenu: () => void;
  closeMenu: () => void;
  setColumnHidden: (hidden: boolean) => void;
  setColumnPinned: (pinned: ColumnPin | undefined) => void;
  renderHeader?: (context: YoupGridHeaderContext<TRow>) => ReactNode;
}) {
  const sortable = context.layout.column.sortable !== false;

  return createElement(
    "div",
    {
      key: context.layout.column.id,
      className: getCellClassName("youp-grid__cell youp-grid__cell--header", context.layout),
      role: "columnheader",
      style: getCellStyle(context.layout),
      "aria-sort": context.sorted === "desc" ? "descending" : context.sorted === "asc" ? "ascending" : "none",
    },
    createElement(
      "div",
      { className: "youp-grid__header-main" },
      createElement(
        "button",
        {
          className: "youp-grid__sort-button",
          type: "button",
          disabled: !sortable,
          onClick: sortable ? context.toggleSort : undefined,
        },
        context.renderHeader
          ? context.renderHeader({
              column: context.layout.column,
              sorted: context.sorted,
              toggleSort: context.toggleSort,
            })
          : createElement(
              "span",
              { className: "youp-grid__header-label" },
              context.layout.column.headerName,
              context.sorted ? ` ${context.sorted === "desc" ? "↓" : "↑"}` : "",
            ),
      ),
      context.showMenu
        ? createElement(
            "button",
            {
              className: "youp-grid__column-menu-button",
              type: "button",
              "aria-haspopup": "menu",
              "aria-expanded": context.menuOpen,
              "aria-label": `${context.layout.column.headerName} column menu`,
              onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                context.toggleMenu();
              },
            },
            "⋯",
          )
        : undefined,
    ),
    context.menuOpen
      ? renderColumnMenu({
          column: context.layout.column,
          sortable,
          sorted: context.sorted,
          filterValue: context.filterValue,
          setSort: context.setSort,
          clearSort: context.clearSort,
          clearFilter: () => context.setFilter(""),
          setColumnHidden: context.setColumnHidden,
          setColumnPinned: context.setColumnPinned,
          closeMenu: context.closeMenu,
        })
      : undefined,
    context.showFilter && context.layout.column.filterable !== false
      ? createElement("input", {
          className: "youp-grid__filter",
          value: context.filterValue,
          placeholder: "Filter",
          "aria-label": `Filter ${context.layout.column.headerName}`,
          onChange: (event) => {
            context.setFilter(event.currentTarget.value);
          },
          onClick: (event) => event.stopPropagation(),
        })
      : undefined,
    createElement("span", {
      className: "youp-grid__resize-handle",
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": `Resize ${context.layout.column.headerName}`,
      onMouseDown: (event: ReactMouseEvent<HTMLSpanElement>) => {
        startColumnResize({
          event,
          column: context.layout.column,
          resizeColumn: context.resizeColumn,
        });
      },
    }),
  );
}

function renderColumnMenu<TRow>(context: {
  column: ResolvedColumnDef<TRow>;
  sortable: boolean;
  sorted: "asc" | "desc" | undefined;
  filterValue: string;
  setSort: (direction: "asc" | "desc") => void;
  clearSort: () => void;
  clearFilter: () => void;
  setColumnHidden: (hidden: boolean) => void;
  setColumnPinned: (pinned: ColumnPin | undefined) => void;
  closeMenu: () => void;
}) {
  const runAction = (action: () => void) => {
    action();
    context.closeMenu();
  };

  return createElement(
    "div",
    { className: "youp-grid__column-menu", role: "menu" },
    renderColumnMenuButton({
      label: "Sort ascending",
      disabled: !context.sortable || context.sorted === "asc",
      onClick: () => runAction(() => context.setSort("asc")),
    }),
    renderColumnMenuButton({
      label: "Sort descending",
      disabled: !context.sortable || context.sorted === "desc",
      onClick: () => runAction(() => context.setSort("desc")),
    }),
    renderColumnMenuButton({
      label: "Clear sort",
      disabled: !context.sorted,
      onClick: () => runAction(context.clearSort),
    }),
    createElement("div", { className: "youp-grid__column-menu-separator", role: "separator" }),
    renderColumnMenuButton({
      label: "Pin left",
      disabled: context.column.pinned === "left",
      onClick: () => runAction(() => context.setColumnPinned("left")),
    }),
    renderColumnMenuButton({
      label: "Pin right",
      disabled: context.column.pinned === "right",
      onClick: () => runAction(() => context.setColumnPinned("right")),
    }),
    renderColumnMenuButton({
      label: "Unpin",
      disabled: !context.column.pinned,
      onClick: () => runAction(() => context.setColumnPinned(undefined)),
    }),
    createElement("div", { className: "youp-grid__column-menu-separator", role: "separator" }),
    renderColumnMenuButton({
      label: "Clear filter",
      disabled: !context.filterValue,
      onClick: () => runAction(context.clearFilter),
    }),
    renderColumnMenuButton({
      label: "Hide column",
      onClick: () => runAction(() => context.setColumnHidden(true)),
    }),
  );
}

function renderColumnMenuButton(context: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return createElement(
    "button",
    {
      className: "youp-grid__column-menu-item",
      type: "button",
      role: "menuitem",
      disabled: context.disabled,
      onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        context.onClick();
      },
    },
    context.label,
  );
}

function renderGroupRow<TRow>(context: {
  row: RowGroupNode;
  columns: readonly ColumnLayout<TRow>[];
  showSelectionColumn: boolean;
  rowHeight: number;
  toggleExpanded: (groupId: string) => void;
}) {
  const width = getColumnsWidth(context.columns);

  return createElement(
    "div",
    {
      key: context.row.groupId,
      className: "youp-grid__row youp-grid__row--group",
      role: "row",
      "aria-rowindex": context.row.index + 1,
      style: { height: context.rowHeight },
    },
    context.showSelectionColumn ? renderSelectionGroupCell() : undefined,
    createElement(
      "div",
      {
        className: "youp-grid__cell youp-grid__cell--group",
        role: "gridcell",
        "aria-colspan": context.columns.length,
        style: {
          width,
          flex: `0 0 ${width}px`,
          paddingLeft: 12 + context.row.depth * 18,
        },
      },
      createElement(
        "button",
        {
          className: "youp-grid__group-toggle",
          type: "button",
          "aria-expanded": context.row.expanded,
          onClick: () => context.toggleExpanded(context.row.groupId),
        },
        createElement("span", { className: "youp-grid__group-caret", "aria-hidden": true }, context.row.expanded ? "v" : ">"),
        createElement("span", { className: "youp-grid__group-label" }, context.row.label),
        createElement("span", { className: "youp-grid__group-count" }, `${context.row.rowCount} rows`),
      ),
    ),
  );
}

function renderSelectionGroupCell() {
  return createElement("div", {
    className: "youp-grid__selection-cell youp-grid__selection-cell--group",
    role: "gridcell",
    style: getSelectionCellStyle(),
    "aria-hidden": true,
  });
}

function renderRow<TRow>(context: {
  row: RowNode<TRow>;
  columns: readonly ColumnLayout<TRow>[];
  selected: boolean;
  showSelectionColumn: boolean;
  displayIndex: number;
  rowIndex: number;
  rowHeight: number;
  focusedCell: FocusedCell;
  selectionRange?: GridCellRange;
  fillRange?: NormalizedGridCellRange;
  editingCell?: EditingCell;
  editable: boolean;
  disabledReason?: ReactNode;
  canEditCell: (row: RowNode<TRow>, rowIndex: number, column: ResolvedColumnDef<TRow>) => boolean;
  getCellMeta: (
    row: RowNode<TRow>,
    rowIndex: number,
    column: ResolvedColumnDef<TRow>,
  ) => YoupGridCellMeta | undefined;
  setRowSelected: (selected: boolean) => void;
  setFocusedCell: (cell: FocusedCell, extendSelection?: boolean, selectionAnchor?: FocusedCell) => void;
  startFillHandle: (event: ReactMouseEvent<HTMLSpanElement>) => void;
  applyCellValue: (cell: CellRenderState<TRow>, value: unknown) => void;
  startEditing: (cell: EditingCell) => void;
  updateEditingDraft: (draftValue: string) => void;
  cancelEditing: () => void;
  commitEditing: (cell: EditingCell, reason?: YoupGridCellEditCommitReason) => void;
  onRowClick?: (event: YoupGridRowEvent<TRow>) => void;
  onRowDoubleClick?: (event: YoupGridRowEvent<TRow>) => void;
  onCellKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>,
    cell: CellRenderState<TRow>,
  ) => void;
  renderCell?: (context: YoupGridCellContext<TRow>) => ReactNode;
}) {
  return createElement(
    "div",
    {
      key: rowKey(context.row.id),
      className: [
        "youp-grid__row",
        context.selected ? "youp-grid__row--selected" : "",
      ]
        .filter(Boolean)
        .join(" "),
      role: "row",
      "aria-rowindex": context.displayIndex + 1,
      "aria-selected": context.selected,
      "data-youp-row-index": context.rowIndex,
      style: { height: context.rowHeight },
      onClick: (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!shouldIgnoreRowMouseEvent(event)) {
          context.onRowClick?.(createRowEvent(context, event));
        }
      },
      onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!shouldIgnoreRowMouseEvent(event)) {
          context.onRowDoubleClick?.(createRowEvent(context, event));
        }
      },
    },
    context.showSelectionColumn
      ? renderSelectionCell({
          rowIndex: context.rowIndex,
          selected: context.selected,
          setSelected: context.setRowSelected,
        })
      : undefined,
    context.columns.map((layout, columnIndex) => {
      const focused = context.focusedCell.rowIndex === context.rowIndex && context.focusedCell.columnIndex === columnIndex;
      const editing = isEditingCell(context.editingCell, context.row, layout.column);
      const activeRange = normalizeCellRange(context.selectionRange ?? {
        anchor: context.focusedCell,
        focus: context.focusedCell,
      });
      const selected = context.selectionRange
        ? isCellInRange(context.rowIndex, columnIndex, context.selectionRange)
        : false;
      const fillTargeted = context.fillRange
        ? isCellInNormalizedRange(context.rowIndex, columnIndex, context.fillRange)
        : false;
      const editable = context.canEditCell(context.row, context.rowIndex, layout.column);
      const meta = context.getCellMeta(context.row, context.rowIndex, layout.column);
      const showFillHandle =
        !context.editingCell &&
        editable &&
        context.rowIndex === activeRange.endRowIndex &&
        columnIndex === activeRange.endColumnIndex;

      return renderCell({
        row: context.row,
        layout,
        rowIndex: context.rowIndex,
        columnIndex,
        ariaColumnOffset: context.showSelectionColumn ? 1 : 0,
        focused,
        selected,
        fillTargeted,
        showFillHandle,
        editing,
        editingCell: context.editingCell,
        editable,
        disabledReason: context.disabledReason,
        meta,
        setFocusedCell: context.setFocusedCell,
        startFillHandle: context.startFillHandle,
        applyCellValue: context.applyCellValue,
        startEditing: context.startEditing,
        updateEditingDraft: context.updateEditingDraft,
        cancelEditing: context.cancelEditing,
        commitEditing: context.commitEditing,
        onKeyDown: context.onCellKeyDown,
        renderCell: context.renderCell,
      });
    }),
  );
}

function renderSelectionCell(context: {
  rowIndex: number;
  selected: boolean;
  setSelected: (selected: boolean) => void;
}) {
  return createElement(
    "div",
    {
      className: "youp-grid__cell youp-grid__selection-cell",
      role: "gridcell",
      "aria-colindex": 1,
      style: getSelectionCellStyle(),
    },
    createElement("input", {
      className: "youp-grid__selection-checkbox",
      type: "checkbox",
      checked: context.selected,
      "aria-label": `Select row ${context.rowIndex + 1}`,
      onChange: (event: ReactChangeEvent<HTMLInputElement>) => {
        context.setSelected(event.currentTarget.checked);
      },
      onClick: (event: ReactMouseEvent<HTMLInputElement>) => {
        event.stopPropagation();
      },
    }),
  );
}

function createRowEvent<TRow>(
  context: {
    row: RowNode<TRow>;
    rowIndex: number;
  },
  event: ReactMouseEvent<HTMLDivElement>,
): YoupGridRowEvent<TRow> {
  return {
    row: context.row.original,
    rowNode: context.row,
    rowId: context.row.id,
    rowIndex: context.rowIndex,
    event,
  };
}

function shouldIgnoreRowMouseEvent(event: ReactMouseEvent<HTMLDivElement>): boolean {
  const target = event.target;

  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest("button,input,select,textarea,a,[contenteditable='true']"));
}

function renderCell<TRow>(context: {
  row: RowNode<TRow>;
  layout: ColumnLayout<TRow>;
  rowIndex: number;
  columnIndex: number;
  ariaColumnOffset: number;
  focused: boolean;
  selected: boolean;
  fillTargeted: boolean;
  showFillHandle: boolean;
  editing: boolean;
  editingCell?: EditingCell;
  editable: boolean;
  disabledReason?: ReactNode;
  meta?: YoupGridCellMeta;
  setFocusedCell: (cell: FocusedCell, extendSelection?: boolean, selectionAnchor?: FocusedCell) => void;
  startFillHandle: (event: ReactMouseEvent<HTMLSpanElement>) => void;
  applyCellValue: (cell: CellRenderState<TRow>, value: unknown) => void;
  startEditing: (cell: EditingCell) => void;
  updateEditingDraft: (draftValue: string) => void;
  cancelEditing: () => void;
  commitEditing: (cell: EditingCell, reason?: YoupGridCellEditCommitReason) => void;
  onKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>,
    cell: CellRenderState<TRow>,
  ) => void;
  renderCell?: (context: YoupGridCellContext<TRow>) => ReactNode;
}) {
  const column = context.layout.column;
  const value = column.accessor(context.row.original);
  const editable = context.editable;
  const cellContext = {
    row: context.row,
    column,
    value,
    editing: context.editing,
    focused: context.focused,
    editable,
    meta: context.meta,
  };
  const cellState = {
    row: context.row,
    rowIndex: context.rowIndex,
    column,
    columnIndex: context.columnIndex,
    value,
    editable,
    meta: context.meta,
  };
  const cellContent = context.renderCell
    ? context.renderCell(cellContext)
    : renderDefaultCellContent({
        cell: cellState,
        row: context.row.original,
        disabledReason: context.disabledReason,
        applyCellValue: context.applyCellValue,
      });

  return createElement(
    "div",
    {
      key: column.id,
      className: getCellClassName(
        [
          "youp-grid__cell",
          context.focused ? "youp-grid__cell--focused" : "",
          context.selected ? "youp-grid__cell--range-selected" : "",
          context.fillTargeted ? "youp-grid__cell--fill-target" : "",
          context.editing ? "youp-grid__cell--editing" : "",
          !editable ? "youp-grid__cell--disabled" : "",
          context.meta ? `youp-grid__cell--status-${context.meta.status}` : "",
        ].filter(Boolean).join(" "),
        context.layout,
      ),
      role: "gridcell",
      tabIndex: context.focused && !context.editing ? 0 : -1,
      title: getCellTitle(context.meta, context.disabledReason, editable),
      "aria-colindex": context.columnIndex + context.ariaColumnOffset + 1,
      "aria-readonly": !editable || undefined,
      "data-youp-row-index": context.rowIndex,
      "data-youp-column-index": context.columnIndex,
      "data-youp-column-id": column.id,
      style: getCellStyle(context.layout),
      onClick: (event: ReactMouseEvent<HTMLDivElement>) => {
        event.currentTarget.focus({ preventScroll: true });
        context.setFocusedCell(
          { rowIndex: context.rowIndex, columnIndex: context.columnIndex },
          event.shiftKey,
        );
      },
      onDoubleClick: () => {
        if (editable) {
          if (column.editor === "checkbox") {
            context.applyCellValue(cellState, !Boolean(value));
          } else {
            context.startEditing(createEditingCell(cellState, value));
          }
        }
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => context.onKeyDown(event, cellState),
    },
    context.editing
      ? renderCellEditor({
          cell: cellState,
          editingCell: context.editingCell,
          updateEditingDraft: context.updateEditingDraft,
          commitEditing: context.commitEditing,
          onKeyDown: context.onKeyDown,
        })
      : cellContent,
    renderCellStatus(context.meta),
    !context.editing && context.showFillHandle
      ? createElement("span", {
          className: "youp-grid__fill-handle",
          role: "button",
          "aria-label": "Fill selection",
          onMouseDown: context.startFillHandle,
        })
      : undefined,
  );
}

function renderDefaultCellContent<TRow>(context: {
  cell: CellRenderState<TRow>;
  row: TRow;
  disabledReason?: ReactNode;
  applyCellValue: (cell: CellRenderState<TRow>, value: unknown) => void;
}) {
  if (context.cell.column.editor === "checkbox") {
    return createElement("input", {
      className: "youp-grid__cell-checkbox",
      type: "checkbox",
      checked: Boolean(context.cell.value),
      disabled: !context.cell.editable,
      title: getCellTitle(context.cell.meta, context.disabledReason, context.cell.editable),
      "aria-label": context.cell.column.headerName,
      onChange: (event: ReactChangeEvent<HTMLInputElement>) => {
        context.applyCellValue(context.cell, event.currentTarget.checked);
      },
      onClick: (event: ReactMouseEvent<HTMLInputElement>) => {
        event.stopPropagation();
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation();
      },
    });
  }

  const text = formatCellValue(context.cell.column, context.row, context.cell.value);
  const placeholder = context.cell.column.placeholder;
  const hasPlaceholder = text.length === 0 && Boolean(placeholder);

  return createElement(
    "span",
    { className: hasPlaceholder ? "youp-grid__cell-placeholder" : undefined },
    hasPlaceholder ? placeholder : text,
  );
}

function renderCellEditor<TRow>(context: {
  cell: CellRenderState<TRow>;
  editingCell?: EditingCell;
  updateEditingDraft: (draftValue: string) => void;
  commitEditing: (cell: EditingCell, reason?: YoupGridCellEditCommitReason) => void;
  onKeyDown: (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    cell: CellRenderState<TRow>,
  ) => void;
}) {
  if (context.cell.column.editor === "select") {
    const options = normalizeEditorOptions(context.cell.column.options);

    return createElement(
      "select",
      {
        className: "youp-grid__cell-editor youp-grid__cell-editor--select",
        value: context.editingCell?.draftValue ?? "",
        autoFocus: true,
        disabled: !context.cell.editable,
        onChange: (event: ReactChangeEvent<HTMLSelectElement>) => {
          context.updateEditingDraft(event.currentTarget.value);
        },
        onBlur: (event: ReactFocusEvent<HTMLSelectElement>) => {
          context.commitEditing(
            createEditingCell(context.cell, event.currentTarget.value),
            "blur",
          );
        },
        onKeyDown: (event: ReactKeyboardEvent<HTMLSelectElement>) => {
          event.stopPropagation();
          context.onKeyDown(event, context.cell);
        },
      },
      context.cell.column.placeholder
        ? createElement(
            "option",
            { key: "__placeholder", value: "", disabled: true },
            context.cell.column.placeholder,
          )
        : undefined,
      options.map((option) => createElement(
        "option",
        { key: option.inputValue, value: option.inputValue },
        option.label,
      )),
    );
  }

  return createElement("input", {
    className: "youp-grid__cell-editor",
    type: context.cell.column.editor === "number" ? "number" : "text",
    value: context.editingCell?.draftValue ?? "",
    placeholder: context.cell.column.placeholder,
    autoFocus: true,
    disabled: !context.cell.editable,
    onChange: (event: ReactChangeEvent<HTMLInputElement>) => {
      context.updateEditingDraft(event.currentTarget.value);
    },
    onBlur: (event: ReactFocusEvent<HTMLInputElement>) => {
      context.commitEditing(
        createEditingCell(context.cell, event.currentTarget.value),
        "blur",
      );
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      context.onKeyDown(event, context.cell);
    },
  });
}

function renderCellStatus(meta?: YoupGridCellMeta) {
  if (!meta) {
    return undefined;
  }

  return createElement("span", {
    className: `youp-grid__cell-status youp-grid__cell-status--${meta.status}`,
    title: typeof meta.message === "string" ? meta.message : undefined,
    "aria-hidden": true,
  });
}

function renderColumnToolbar<TRow>(context: {
  showColumnChooser: boolean;
  showCsvExport: boolean;
  showDensityControl: boolean;
  density: YoupGridDensity;
  open: boolean;
  columns: readonly ResolvedColumnDef<TRow>[];
  toggleOpen: () => void;
  setDensity: (density: YoupGridDensity) => void;
  setColumnHidden: (columnId: string, hidden: boolean) => void;
  setColumnPinned: (columnId: string, pinned: ColumnPin | undefined) => void;
  exportCsv: () => void;
}) {
  if (!context.showColumnChooser && !context.showCsvExport && !context.showDensityControl) {
    return undefined;
  }

  return createElement(
    "div",
    { className: "youp-grid__toolbar" },
    context.showColumnChooser
      ? createElement(
          "button",
          {
            className: "youp-grid__toolbar-button",
            type: "button",
            "aria-expanded": context.open,
            onClick: context.toggleOpen,
          },
          "Columns",
        )
      : undefined,
    context.showCsvExport
      ? createElement(
          "button",
          {
            className: "youp-grid__toolbar-button",
            type: "button",
            onClick: context.exportCsv,
          },
          "Export CSV",
        )
      : undefined,
    context.showDensityControl
      ? createElement(
          "label",
          { className: "youp-grid__density-control" },
          "Density",
          createElement(
            "select",
            {
              value: context.density,
              onChange: (event: ReactChangeEvent<HTMLSelectElement>) => {
                context.setDensity(event.currentTarget.value as YoupGridDensity);
              },
            },
            renderDensityOption("compact", "Compact"),
            renderDensityOption("standard", "Standard"),
            renderDensityOption("comfortable", "Comfortable"),
          ),
        )
      : undefined,
    context.showColumnChooser && context.open
      ? createElement(
          "div",
          { className: "youp-grid__column-panel" },
          context.columns.map((column) => {
            return createElement(
              "div",
              { key: column.id, className: "youp-grid__column-panel-row" },
              createElement(
                "label",
                { className: "youp-grid__column-toggle" },
                createElement("input", {
                  type: "checkbox",
                  checked: !column.hidden,
                  onChange: (event) => {
                    context.setColumnHidden(column.id, !event.currentTarget.checked);
                  },
                }),
                column.headerName,
              ),
              createElement(
                "div",
                { className: "youp-grid__pin-controls", role: "group", "aria-label": `Pin ${column.headerName}` },
                renderPinButton(column, undefined, "None", context.setColumnPinned),
                renderPinButton(column, "left", "Left", context.setColumnPinned),
                renderPinButton(column, "right", "Right", context.setColumnPinned),
              ),
            );
          }),
        )
      : undefined,
  );
}

function renderDensityOption(value: YoupGridDensity, label: string) {
  return createElement("option", { key: value, value }, label);
}

function renderPinButton<TRow>(
  column: ResolvedColumnDef<TRow>,
  pin: ColumnPin | undefined,
  label: string,
  setColumnPinned: (columnId: string, pinned: ColumnPin | undefined) => void,
) {
  const active = column.pinned === pin || (!column.pinned && pin === undefined);

  return createElement(
    "button",
    {
      className: ["youp-grid__pin-button", active ? "youp-grid__pin-button--active" : ""]
        .filter(Boolean)
        .join(" "),
      type: "button",
      "aria-pressed": active,
      onClick: () => setColumnPinned(column.id, pin),
    },
    label,
  );
}

type ColumnLayout<TRow> = {
  column: ResolvedColumnDef<TRow>;
  pinned?: ColumnPin;
  stickyOffset?: number;
  pinnedEdge?: "left-last" | "right-first";
};

type HeaderGroupLayout<TRow> = {
  id: string;
  headerGroup?: string;
  columns: ResolvedColumnDef<TRow>[];
  columnCount: number;
  width: number;
  pinned?: ColumnPin;
  stickyOffset?: number;
  pinnedEdge?: "left-last" | "right-first";
};

function getColumnLayouts<TRow>(
  columns: readonly ResolvedColumnDef<TRow>[],
  options: { leftOffset?: number } = {},
): ColumnLayout<TRow>[] {
  const leftColumns = columns.filter((column) => column.pinned === "left");
  const centerColumns = columns.filter((column) => !column.pinned);
  const rightColumns = columns.filter((column) => column.pinned === "right");
  const rightOffsets = getRightOffsets(rightColumns);

  return [
    ...leftColumns.map((column, index) => ({
      column,
      pinned: "left" as const,
      stickyOffset: getLeftOffset(leftColumns, index, options.leftOffset ?? 0),
      pinnedEdge: index === leftColumns.length - 1 ? "left-last" as const : undefined,
    })),
    ...centerColumns.map((column) => ({ column })),
    ...rightColumns.map((column, index) => ({
      column,
      pinned: "right" as const,
      stickyOffset: rightOffsets[index],
      pinnedEdge: index === 0 ? "right-first" as const : undefined,
    })),
  ];
}

function getHeaderGroupLayouts<TRow>(columns: readonly ColumnLayout<TRow>[]): HeaderGroupLayout<TRow>[] {
  const groups: HeaderGroupLayout<TRow>[] = [];

  for (const layout of columns) {
    const headerGroup = normalizeHeaderGroup(layout.column.headerGroup);
    const previous = groups[groups.length - 1];

    if (previous && previous.headerGroup === headerGroup && previous.pinned === layout.pinned) {
      previous.columns.push(layout.column);
      previous.columnCount += 1;
      previous.width += getColumnWidth(layout.column);

      if (layout.pinned === "right") {
        previous.stickyOffset = layout.stickyOffset;
      }

      if (layout.pinnedEdge) {
        previous.pinnedEdge = layout.pinnedEdge;
      }

      continue;
    }

    groups.push({
      id: `${layout.pinned ?? "center"}:${headerGroup ?? "none"}:${groups.length}`,
      headerGroup,
      columns: [layout.column],
      columnCount: 1,
      width: getColumnWidth(layout.column),
      pinned: layout.pinned,
      stickyOffset: layout.stickyOffset,
      pinnedEdge: layout.pinnedEdge,
    });
  }

  return groups;
}

function normalizeHeaderGroup(headerGroup: string | undefined): string | undefined {
  const trimmed = headerGroup?.trim();

  return trimmed ? trimmed : undefined;
}

function getLeftOffset<TRow>(
  columns: readonly ResolvedColumnDef<TRow>[],
  index: number,
  baseOffset = 0,
): number {
  return columns.slice(0, index).reduce((sum, column) => sum + getColumnWidth(column), baseOffset);
}

function getRightOffsets<TRow>(columns: readonly ResolvedColumnDef<TRow>[]): number[] {
  const offsets = new Array<number>(columns.length);
  let offset = 0;

  for (let index = columns.length - 1; index >= 0; index -= 1) {
    offsets[index] = offset;
    offset += getColumnWidth(columns[index]);
  }

  return offsets;
}

function getColumnWidth<TRow>(column: ResolvedColumnDef<TRow>): number {
  return column.width ?? 160;
}

function getColumnsWidth<TRow>(columns: readonly ColumnLayout<TRow>[]): number {
  return columns.reduce((sum, layout) => sum + getColumnWidth(layout.column), 0);
}

function getCellClassName<TRow>(baseClassName: string, layout: ColumnLayout<TRow>): string {
  return [
    baseClassName,
    layout.pinned ? `youp-grid__cell--pinned-${layout.pinned}` : "",
    layout.pinnedEdge ? `youp-grid__cell--${layout.pinnedEdge}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function getHeaderGroupClassName<TRow>(layout: HeaderGroupLayout<TRow>): string {
  return [
    "youp-grid__cell youp-grid__cell--header-group",
    layout.headerGroup ? "" : "youp-grid__cell--header-group-empty",
    layout.pinned ? `youp-grid__cell--pinned-${layout.pinned}` : "",
    layout.pinnedEdge ? `youp-grid__cell--${layout.pinnedEdge}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function getCellStyle<TRow>(layout: ColumnLayout<TRow>): CSSProperties {
  const width = getColumnWidth(layout.column);
  const style: CSSProperties = {
    width,
    flex: `0 0 ${width}px`,
  };

  if (layout.pinned === "left") {
    style.left = layout.stickyOffset ?? 0;
  }

  if (layout.pinned === "right") {
    style.right = layout.stickyOffset ?? 0;
  }

  return style;
}

function getHeaderGroupStyle<TRow>(layout: HeaderGroupLayout<TRow>): CSSProperties {
  const style: CSSProperties = {
    width: layout.width,
    flex: `0 0 ${layout.width}px`,
  };

  if (layout.pinned === "left") {
    style.left = layout.stickyOffset ?? 0;
  }

  if (layout.pinned === "right") {
    style.right = layout.stickyOffset ?? 0;
  }

  return style;
}

function getSelectionCellStyle(): CSSProperties {
  return {
    left: 0,
    width: SELECTION_COLUMN_WIDTH,
    flex: `0 0 ${SELECTION_COLUMN_WIDTH}px`,
  };
}

function rowKey(rowId: GridRowId): string {
  return String(rowId);
}

function renderPagination(context: {
  enabled: boolean;
  cursorPagination?: CursorPaginationState;
  pageCount?: number;
  pagination?: { pageIndex: number; pageSize: number };
  visibleRowCount: number;
  filteredRowCount: number;
  setCursorPage: (cursor: string | undefined) => void;
  setCursorPageSize: (pageSize: number) => void;
  setPage: (pageIndex: number) => void;
  setPageSize: (pageSize: number) => void;
}) {
  if (!context.enabled) {
    return undefined;
  }

  if (context.cursorPagination) {
    return renderCursorPagination({
      cursorPagination: context.cursorPagination,
      visibleRowCount: context.visibleRowCount,
      filteredRowCount: context.filteredRowCount,
      setCursorPage: context.setCursorPage,
      setCursorPageSize: context.setCursorPageSize,
    });
  }

  if (!context.pagination || !context.pageCount) {
    return undefined;
  }

  const currentPage = context.pagination.pageIndex + 1;

  return createElement(
    "div",
    { className: "youp-grid__pagination" },
    createElement(
      "button",
      {
        type: "button",
        disabled: context.pagination.pageIndex === 0,
        onClick: () => context.setPage(context.pagination!.pageIndex - 1),
      },
      "Previous",
    ),
    createElement(
      "span",
      { className: "youp-grid__page-status" },
      `Page ${currentPage} of ${context.pageCount} · ${context.visibleRowCount} shown · ${context.filteredRowCount} matched`,
    ),
    createElement(
      "button",
      {
        type: "button",
        disabled: currentPage >= context.pageCount,
        onClick: () => context.setPage(context.pagination!.pageIndex + 1),
      },
      "Next",
    ),
    createElement(
      "label",
      { className: "youp-grid__page-size" },
      "Rows",
      createElement(
        "select",
        {
          value: context.pagination.pageSize,
          onChange: (event: ReactChangeEvent<HTMLSelectElement>) => {
            context.setPageSize(Number(event.currentTarget.value));
          },
        },
        [50, 100, 250, 500].map((pageSize) => {
          return createElement("option", { key: pageSize, value: pageSize }, String(pageSize));
        }),
      ),
    ),
  );
}

function renderCursorPagination(context: {
  cursorPagination: CursorPaginationState;
  visibleRowCount: number;
  filteredRowCount: number;
  setCursorPage: (cursor: string | undefined) => void;
  setCursorPageSize: (pageSize: number) => void;
}) {
  return createElement(
    "div",
    { className: "youp-grid__pagination youp-grid__pagination--cursor" },
    createElement(
      "button",
      {
        type: "button",
        disabled: !context.cursorPagination.hasPreviousPage,
        onClick: () => context.setCursorPage(context.cursorPagination.previousCursor),
      },
      "Previous",
    ),
    createElement(
      "span",
      { className: "youp-grid__page-status" },
      `Cursor page · ${context.visibleRowCount} shown · ${context.filteredRowCount} matched`,
    ),
    createElement(
      "button",
      {
        type: "button",
        disabled: !context.cursorPagination.hasNextPage,
        onClick: () => context.setCursorPage(context.cursorPagination.nextCursor),
      },
      "Next",
    ),
    createElement(
      "label",
      { className: "youp-grid__page-size" },
      "Rows",
      createElement(
        "select",
        {
          value: context.cursorPagination.pageSize,
          onChange: (event: ReactChangeEvent<HTMLSelectElement>) => {
            context.setCursorPageSize(Number(event.currentTarget.value));
          },
        },
        [50, 100, 250, 500].map((pageSize) => {
          return createElement("option", { key: pageSize, value: pageSize }, String(pageSize));
        }),
      ),
    ),
  );
}

function startColumnResize<TRow>(context: {
  event: ReactMouseEvent<HTMLSpanElement>;
  column: ResolvedColumnDef<TRow>;
  resizeColumn: (width: number) => void;
}) {
  context.event.preventDefault();
  context.event.stopPropagation();

  const startX = context.event.clientX;
  const startWidth = context.column.width ?? 160;
  const minWidth = context.column.minWidth ?? 64;
  const maxWidth = context.column.maxWidth;

  function handleMouseMove(event: MouseEvent) {
    const nextWidth = clamp(startWidth + event.clientX - startX, minWidth, maxWidth ?? Number.MAX_SAFE_INTEGER);
    context.resizeColumn(nextWidth);
  }

  function handleMouseUp() {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
}

type FocusedCell = {
  rowIndex: number;
  columnIndex: number;
};

type EditingCell = FocusedCell & {
  rowId: GridRowId;
  columnId: string;
  draftValue: string;
};

type CellRenderState<TRow> = {
  row: RowNode<TRow>;
  rowIndex: number;
  column: ResolvedColumnDef<TRow>;
  columnIndex: number;
  value: unknown;
  editable: boolean;
  meta?: YoupGridCellMeta;
};

type PendingCellValueChange<TRow> = {
  row: TRow;
  rowId: GridRowId;
  rowIndex: number;
  column: ResolvedColumnDef<TRow>;
  columnId: string;
  value: unknown;
  previousValue: unknown;
};

function handleCellKeyDown<TRow>(context: {
  event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>;
  cell: CellRenderState<TRow>;
  rowCount: number;
  columnCount: number;
  rowHeight: number;
  bodyElement: HTMLDivElement | null;
  getDisplayRowIndex: (rowIndex: number) => number;
  setFocusedCell: (cell: FocusedCell, extendSelection?: boolean, selectionAnchor?: FocusedCell) => void;
  selectionRange?: GridCellRange;
  startEditing: (cell: EditingCell) => void;
  commitEditing: (cell: EditingCell, reason?: YoupGridCellEditCommitReason) => void;
  cancelEditing: () => void;
  applyCellValue: (cell: CellRenderState<TRow>, value: unknown) => void;
  deleteCellValues: () => void;
  undoCellValueChange: () => boolean;
  redoCellValueChange: () => boolean;
  toggleSelected: () => void;
}) {
  if (context.rowCount === 0 || context.columnCount === 0) {
    return;
  }

  const editingCell = context.event.currentTarget.classList.contains("youp-grid__cell-editor")
    ? createEditingCell(context.cell, (context.event.currentTarget as HTMLInputElement | HTMLSelectElement).value)
    : undefined;

  if (editingCell) {
    if (context.event.key === "Escape") {
      context.event.preventDefault();
      context.cancelEditing();
      focusCell(context.bodyElement, context.cell);
      return;
    }

    if (context.event.key === "Enter") {
      context.event.preventDefault();
      context.commitEditing(editingCell, "enter");
      moveFocusedCell({
        ...context,
        nextCell: {
          rowIndex: clamp(context.cell.rowIndex + (context.event.shiftKey ? -1 : 1), 0, context.rowCount - 1),
          columnIndex: context.cell.columnIndex,
        },
      });
      return;
    }

    if (context.event.key === "Tab") {
      context.event.preventDefault();
      context.commitEditing(editingCell, "tab");
      moveFocusedCell({
        ...context,
        nextCell: getNextTabCell(context.cell, context.rowCount, context.columnCount, context.event.shiftKey),
      });
      return;
    }

    return;
  }

  if (isUndoShortcut(context.event)) {
    context.event.preventDefault();
    if (context.cell.editable) {
      context.undoCellValueChange();
    }
    return;
  }

  if (isRedoShortcut(context.event)) {
    context.event.preventDefault();
    if (context.cell.editable) {
      context.redoCellValueChange();
    }
    return;
  }

  if (context.event.key === "Delete") {
    context.event.preventDefault();
    context.deleteCellValues();
    return;
  }

  if (context.event.key === "Enter" || context.event.key === "F2") {
    if (context.cell.editable) {
      context.event.preventDefault();
      if (context.cell.column.editor === "checkbox") {
        context.applyCellValue(context.cell, !Boolean(context.cell.value));
      } else {
        context.startEditing(createEditingCell(context.cell, context.cell.value));
      }
    }
    return;
  }

  if (context.event.key === " ") {
    context.event.preventDefault();
    if (context.cell.column.editor === "checkbox" && context.cell.editable) {
      context.applyCellValue(context.cell, !Boolean(context.cell.value));
      return;
    }

    if (context.event.shiftKey) {
      context.setFocusedCell(context.cell, true);
    } else {
      context.toggleSelected();
    }
    return;
  }

  if (isPrintableKey(context.event)) {
    if (context.cell.editable && context.cell.column.editor !== "checkbox") {
      context.event.preventDefault();
      context.startEditing(createEditingCell(context.cell, context.event.key));
    }
    return;
  }

  const nextCell = getNextNavigationCell(context);

  if (!nextCell) {
    return;
  }

  context.event.preventDefault();
  moveFocusedCell({
    ...context,
    nextCell,
    extendSelection: context.event.shiftKey,
    selectionAnchor: {
      rowIndex: context.cell.rowIndex,
      columnIndex: context.cell.columnIndex,
    },
  });
}

function getNextNavigationCell<TRow>(context: {
  event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>;
  cell: CellRenderState<TRow>;
  rowCount: number;
  columnCount: number;
}): FocusedCell | undefined {
  switch (context.event.key) {
    case "ArrowDown":
      return {
        rowIndex: clamp(context.cell.rowIndex + 1, 0, context.rowCount - 1),
        columnIndex: context.cell.columnIndex,
      };
    case "ArrowUp":
      return {
        rowIndex: clamp(context.cell.rowIndex - 1, 0, context.rowCount - 1),
        columnIndex: context.cell.columnIndex,
      };
    case "ArrowRight":
      return {
        rowIndex: context.cell.rowIndex,
        columnIndex: clamp(context.cell.columnIndex + 1, 0, context.columnCount - 1),
      };
    case "ArrowLeft":
      return {
        rowIndex: context.cell.rowIndex,
        columnIndex: clamp(context.cell.columnIndex - 1, 0, context.columnCount - 1),
      };
    case "Home":
      return {
        rowIndex: context.cell.rowIndex,
        columnIndex: 0,
      };
    case "End":
      return {
        rowIndex: context.cell.rowIndex,
        columnIndex: context.columnCount - 1,
      };
    case "Tab":
      return getNextTabCell(context.cell, context.rowCount, context.columnCount, context.event.shiftKey);
  }

  return undefined;
}

function getNextTabCell<TRow>(
  cell: CellRenderState<TRow>,
  rowCount: number,
  columnCount: number,
  backwards: boolean,
): FocusedCell {
  const delta = backwards ? -1 : 1;
  const flatIndex = cell.rowIndex * columnCount + cell.columnIndex;
  const nextFlatIndex = clamp(flatIndex + delta, 0, rowCount * columnCount - 1);

  return {
    rowIndex: Math.floor(nextFlatIndex / columnCount),
    columnIndex: nextFlatIndex % columnCount,
  };
}

function moveFocusedCell(context: {
  nextCell: FocusedCell;
  rowHeight: number;
  bodyElement: HTMLDivElement | null;
  getDisplayRowIndex: (rowIndex: number) => number;
  setFocusedCell: (cell: FocusedCell, extendSelection?: boolean, selectionAnchor?: FocusedCell) => void;
  extendSelection?: boolean;
  selectionAnchor?: FocusedCell;
}) {
  context.setFocusedCell(context.nextCell, context.extendSelection, context.selectionAnchor);

  if (!context.bodyElement) {
    return;
  }

  ensureCellRowVisible({
    bodyElement: context.bodyElement,
    rowIndex: context.getDisplayRowIndex(context.nextCell.rowIndex),
    rowHeight: context.rowHeight,
  });
  focusCellAfterRender({
    bodyElement: context.bodyElement,
    cell: context.nextCell,
    attempts: 2,
  });
}

function ensureCellRowVisible(context: {
  bodyElement: HTMLDivElement;
  rowIndex: number;
  rowHeight: number;
}) {
  const rowTop = context.rowIndex * context.rowHeight;
  const rowBottom = rowTop + context.rowHeight;
  const viewportTop = context.bodyElement.scrollTop;
  const viewportBottom = viewportTop + context.bodyElement.clientHeight;

  if (rowTop < viewportTop) {
    context.bodyElement.scrollTop = rowTop;
    return;
  }

  if (rowBottom > viewportBottom) {
    context.bodyElement.scrollTop = rowBottom - context.bodyElement.clientHeight;
  }
}

function ensureCellColumnVisible(bodyElement: HTMLDivElement, cellElement: HTMLElement) {
  if (cellElement.classList.contains("youp-grid__cell--pinned-left")) {
    return;
  }

  if (cellElement.classList.contains("youp-grid__cell--pinned-right")) {
    return;
  }

  const leftPinnedWidth = getPinnedCellWidth(cellElement.parentElement, "left");
  const rightPinnedWidth = getPinnedCellWidth(cellElement.parentElement, "right");
  const cellLeft = cellElement.offsetLeft;
  const cellRight = cellLeft + cellElement.offsetWidth;
  const viewportLeft = bodyElement.scrollLeft + leftPinnedWidth;
  const viewportRight = bodyElement.scrollLeft + bodyElement.clientWidth - rightPinnedWidth;

  if (cellLeft < viewportLeft) {
    bodyElement.scrollLeft = Math.max(0, cellLeft - leftPinnedWidth);
    return;
  }

  if (cellRight > viewportRight) {
    bodyElement.scrollLeft = cellRight - bodyElement.clientWidth + rightPinnedWidth;
  }
}

function getPinnedCellWidth(rowElement: Element | null, pin: ColumnPin): number {
  if (!rowElement) {
    return 0;
  }

  const selector = pin === "left"
    ? ".youp-grid__selection-cell, .youp-grid__cell--pinned-left"
    : ".youp-grid__cell--pinned-right";

  return Array.from(rowElement.querySelectorAll<HTMLElement>(selector))
    .reduce((width, cell) => width + cell.offsetWidth, 0);
}

function focusCell(bodyElement: HTMLDivElement | null, cell: FocusedCell): HTMLElement | undefined {
  const cellElement = bodyElement?.querySelector<HTMLElement>(
    `[data-youp-row-index="${cell.rowIndex}"][data-youp-column-index="${cell.columnIndex}"]`,
  );

  cellElement?.focus({ preventScroll: true });

  return cellElement ?? undefined;
}

function focusCellAfterRender(context: {
  bodyElement: HTMLDivElement | null;
  cell: FocusedCell;
  attempts: number;
}) {
  requestAnimationFrame(() => {
    const cellElement = focusCell(context.bodyElement, context.cell);

    if (cellElement && context.bodyElement) {
      ensureCellColumnVisible(context.bodyElement, cellElement);
      return;
    }

    if (context.attempts > 0) {
      focusCellAfterRender({
        ...context,
        attempts: context.attempts - 1,
      });
    }
  });
}

function createEditingCell<TRow>(cell: CellRenderState<TRow>, value: unknown): EditingCell {
  return {
    rowId: cell.row.id,
    rowIndex: cell.rowIndex,
    columnId: cell.column.id,
    columnIndex: cell.columnIndex,
    draftValue: String(value ?? ""),
  };
}

function isEditingCell<TRow>(
  editingCell: EditingCell | undefined,
  row: RowNode<TRow>,
  column: ResolvedColumnDef<TRow>,
): boolean {
  return editingCell?.rowId === row.id && editingCell.columnId === column.id;
}

function commitEditingCell<TRow>(context: {
  cell: EditingCell;
  rowModel: { visibleRows: RowNode<TRow>[]; visibleColumns: ResolvedColumnDef<TRow>[] };
  canEditCell: (row: RowNode<TRow>, rowIndex: number, column: ResolvedColumnDef<TRow>) => boolean;
}): PendingCellValueChange<TRow> | undefined {
  const row = context.rowModel.visibleRows[context.cell.rowIndex];
  const column = context.rowModel.visibleColumns.find((item) => item.id === context.cell.columnId);

  if (!row || !column || !context.canEditCell(row, context.cell.rowIndex, column)) {
    return undefined;
  }

  const previousValue = column.accessor(row.original);
  const value = parseDraftValue(column, row.original, context.cell.draftValue);

  return {
    row: row.original,
    rowId: row.id,
    rowIndex: context.cell.rowIndex,
    column,
    columnId: column.id,
    value,
    previousValue,
  };
}

function handleGridCopy<TRow>(context: {
  event: ReactClipboardEvent<HTMLDivElement>;
  focusedCell: FocusedCell;
  selectionRange?: GridCellRange;
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
}) {
  const range = context.selectionRange ?? {
    anchor: context.focusedCell,
    focus: context.focusedCell,
  };
  const text = serializeGridRange({
    rows: context.rows,
    columns: context.columns,
    range,
  });

  context.event.preventDefault();
  context.event.clipboardData.setData("text/plain", text);
}

function handleGridPaste<TRow>(context: {
  event: ReactClipboardEvent<HTMLDivElement>;
  focusedCell: FocusedCell;
  selectionRange?: GridCellRange;
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
  applyCellValueChanges: (
    changes: PendingCellValueChange<TRow>[],
    source: YoupGridCellValueChangeSource,
  ) => void;
  canEditCell: (row: RowNode<TRow>, rowIndex: number, column: ResolvedColumnDef<TRow>) => boolean;
}) {
  const values = parseClipboardText(context.event.clipboardData.getData("text/plain"));

  if (values.length === 0) {
    return;
  }

  const normalizedRange = context.selectionRange ? normalizeCellRange(context.selectionRange) : undefined;
  const startCell = normalizedRange
    ? {
        rowIndex: normalizedRange.startRowIndex,
        columnIndex: normalizedRange.startColumnIndex,
      }
    : context.focusedCell;
  const fillRange = normalizedRange && values.length === 1 && values[0]?.length === 1
    ? normalizedRange
    : undefined;

  context.event.preventDefault();

  const changes: PendingCellValueChange<TRow>[] = [];

  for (const cell of getClipboardPasteCells({
    values,
    startCell,
    rowCount: context.rows.length,
    columnCount: context.columns.length,
    fillRange,
  })) {
    const row = context.rows[cell.rowIndex];
    const column = context.columns[cell.columnIndex];

    if (!row || !column || !context.canEditCell(row, cell.rowIndex, column)) {
      continue;
    }

    const previousValue = column.accessor(row.original);
    const value = parseDraftValue(column, row.original, cell.value);

    if (Object.is(value, previousValue)) {
      continue;
    }

    changes.push({
      row: row.original,
      rowId: row.id,
      rowIndex: cell.rowIndex,
      column,
      columnId: column.id,
      value,
      previousValue,
    });
  }

  context.applyCellValueChanges(changes, "paste");
}

function deleteGridCellValues<TRow>(context: {
  focusedCell: FocusedCell;
  selectionRange?: GridCellRange;
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
  applyCellValueChanges: (
    changes: PendingCellValueChange<TRow>[],
    source: YoupGridCellValueChangeSource,
  ) => void;
  canEditCell: (row: RowNode<TRow>, rowIndex: number, column: ResolvedColumnDef<TRow>) => boolean;
}) {
  const range = normalizeCellRange(context.selectionRange ?? {
    anchor: context.focusedCell,
    focus: context.focusedCell,
  });
  const changes: PendingCellValueChange<TRow>[] = [];

  for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
    for (let columnIndex = range.startColumnIndex; columnIndex <= range.endColumnIndex; columnIndex += 1) {
      const row = context.rows[rowIndex];
      const column = context.columns[columnIndex];

      if (!row || !column || !context.canEditCell(row, rowIndex, column)) {
        continue;
      }

      const previousValue = column.accessor(row.original);
      const value = getEmptyCellValue(column, row.original);

      if (Object.is(value, previousValue)) {
        continue;
      }

      changes.push({
        row: row.original,
        rowId: row.id,
        rowIndex,
        column,
        columnId: column.id,
        value,
        previousValue,
      });
    }
  }

  context.applyCellValueChanges(changes, "delete");
}

function startFillHandleDrag(context: {
  event: ReactMouseEvent<HTMLSpanElement>;
  sourceRange: NormalizedGridCellRange;
  rowCount: number;
  columnCount: number;
  setFillRange: (range: NormalizedGridCellRange | undefined) => void;
  applyFillRange: (range: NormalizedGridCellRange) => void;
}) {
  context.event.preventDefault();
  context.event.stopPropagation();

  let currentRange: NormalizedGridCellRange | undefined;

  const updateRange = (event: MouseEvent) => {
    const targetCell = getCellCoordinateFromPoint(event.clientX, event.clientY);
    currentRange = targetCell
      ? getFillHandleTargetRange({
          sourceRange: context.sourceRange,
          targetCell,
          rowCount: context.rowCount,
          columnCount: context.columnCount,
        })
      : undefined;
    context.setFillRange(currentRange);
  };
  const handleMouseMove = (event: MouseEvent) => {
    event.preventDefault();
    updateRange(event);
  };
  const handleMouseUp = (event: MouseEvent) => {
    event.preventDefault();
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    updateRange(event);
    context.setFillRange(undefined);

    if (currentRange) {
      context.applyFillRange(currentRange);
    }
  };

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
}

function applyFillHandleValues<TRow>(context: {
  sourceRange: NormalizedGridCellRange;
  targetRange: NormalizedGridCellRange;
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
  applyCellValueChanges: (
    changes: PendingCellValueChange<TRow>[],
    source: YoupGridCellValueChangeSource,
  ) => void;
  canEditCell: (row: RowNode<TRow>, rowIndex: number, column: ResolvedColumnDef<TRow>) => boolean;
}) {
  const changes: PendingCellValueChange<TRow>[] = [];

  for (const cell of getFillHandleCells({
    sourceRange: context.sourceRange,
    targetRange: context.targetRange,
    getValue: ({ rowIndex, columnIndex }) => {
      const row = context.rows[rowIndex];
      const column = context.columns[columnIndex];

      return row && column ? column.accessor(row.original) : undefined;
    },
  })) {
    const row = context.rows[cell.rowIndex];
    const column = context.columns[cell.columnIndex];

    if (!row || !column || !context.canEditCell(row, cell.rowIndex, column)) {
      continue;
    }

    const previousValue = column.accessor(row.original);

    if (Object.is(cell.value, previousValue)) {
      continue;
    }

    changes.push({
      row: row.original,
      rowId: row.id,
      rowIndex: cell.rowIndex,
      column,
      columnId: column.id,
      value: cell.value,
      previousValue,
    });
  }

  context.applyCellValueChanges(changes, "fill");
}

function getFillSelectionRange(
  sourceRange: NormalizedGridCellRange,
  targetRange: NormalizedGridCellRange,
): GridCellRange {
  return {
    anchor: {
      rowIndex: Math.min(sourceRange.startRowIndex, targetRange.startRowIndex),
      columnIndex: Math.min(sourceRange.startColumnIndex, targetRange.startColumnIndex),
    },
    focus: {
      rowIndex: Math.max(sourceRange.endRowIndex, targetRange.endRowIndex),
      columnIndex: Math.max(sourceRange.endColumnIndex, targetRange.endColumnIndex),
    },
  };
}

function getCellCoordinateFromPoint(clientX: number, clientY: number): FocusedCell | undefined {
  const element = document.elementFromPoint(clientX, clientY);
  const cell = element?.closest<HTMLElement>(
    '[role="gridcell"][data-youp-row-index][data-youp-column-index]',
  );

  if (!cell) {
    return undefined;
  }

  const rowIndex = Number(cell.dataset.youpRowIndex);
  const columnIndex = Number(cell.dataset.youpColumnIndex);

  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) {
    return undefined;
  }

  return { rowIndex, columnIndex };
}

function isCellInNormalizedRange(
  rowIndex: number,
  columnIndex: number,
  range: NormalizedGridCellRange,
): boolean {
  return (
    rowIndex >= range.startRowIndex &&
    rowIndex <= range.endRowIndex &&
    columnIndex >= range.startColumnIndex &&
    columnIndex <= range.endColumnIndex
  );
}

function downloadTextFile(options: {
  fileName: string;
  mimeType: string;
  text: string;
}) {
  const blob = new Blob([options.text], { type: options.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = options.fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getHistoryEntryValueChanges<TRow>(context: {
  entry: GridValueHistoryEntry;
  rowModel: RowModel<TRow>;
  source: Extract<YoupGridCellValueChangeSource, "undo" | "redo">;
  canEditCell: (row: RowNode<TRow>, rowIndex: number, column: ResolvedColumnDef<TRow>) => boolean;
}): PendingCellValueChange<TRow>[] {
  const changes: PendingCellValueChange<TRow>[] = [];

  for (const historyChange of context.entry.changes) {
    const row =
      context.rowModel.allRows.find((item) => item.id === historyChange.rowId) ??
      context.rowModel.visibleRows[historyChange.rowIndex];
    const column = context.rowModel.columns.find((item) => item.id === historyChange.columnId);

    if (!row || !column) {
      continue;
    }

    const visibleRowIndex = context.rowModel.visibleRows.findIndex((item) => item.id === row.id);
    const rowIndex = visibleRowIndex >= 0 ? visibleRowIndex : row.index;

    if (!context.canEditCell(row, rowIndex, column)) {
      continue;
    }

    const value = context.source === "undo" ? historyChange.previousValue : historyChange.value;
    const previousValue = column.accessor(row.original);

    if (Object.is(value, previousValue)) {
      continue;
    }

    changes.push({
      row: row.original,
      rowId: row.id,
      rowIndex,
      column,
      columnId: column.id,
      value,
      previousValue,
    });
  }

  return changes;
}

function formatCellValue<TRow>(
  column: ResolvedColumnDef<TRow>,
  row: TRow,
  value: unknown,
): string {
  if (column.valueFormatter) {
    return column.valueFormatter(value, row);
  }

  if (column.editor === "select") {
    const option = normalizeEditorOptions(column.options).find((item) => Object.is(item.value, value));

    if (option) {
      return option.label;
    }
  }

  return String(value ?? "");
}

function parseDraftValue<TRow>(
  column: ResolvedColumnDef<TRow>,
  row: TRow,
  draftValue: string,
): unknown {
  if (column.valueParser) {
    return column.valueParser(draftValue, row);
  }

  if (column.editor === "number") {
    return draftValue === "" ? undefined : Number(draftValue);
  }

  if (column.editor === "checkbox") {
    return draftValue === "true";
  }

  if (column.editor === "select") {
    const option = normalizeEditorOptions(column.options).find((item) => item.inputValue === draftValue);

    return option ? option.value : draftValue;
  }

  return draftValue;
}

function getEmptyCellValue<TRow>(column: ResolvedColumnDef<TRow>, row: TRow): unknown {
  if (column.valueParser) {
    return column.valueParser("", row);
  }

  if (column.editor === "checkbox") {
    return false;
  }

  if (column.editor === "number") {
    return undefined;
  }

  return "";
}

type NormalizedEditorOption = {
  value: ColumnEditorOptionValue;
  label: string;
  inputValue: string;
};

function normalizeEditorOptions(options?: readonly ColumnEditorOption[]): NormalizedEditorOption[] {
  return (options ?? []).map((option) => {
    const value = getEditorOptionValue(option);

    return {
      value,
      label: typeof option === "object" ? option.label : String(option),
      inputValue: String(value),
    };
  });
}

function getEditorOptionValue(option: ColumnEditorOption): ColumnEditorOptionValue {
  return typeof option === "object" ? option.value : option;
}

function getCellTitle(
  meta: YoupGridCellMeta | undefined,
  disabledReason: ReactNode | undefined,
  editable: boolean,
): string | undefined {
  if (typeof meta?.message === "string") {
    return meta.message;
  }

  if (!editable && typeof disabledReason === "string") {
    return disabledReason;
  }

  return undefined;
}

function isPrintableKey(
  event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>,
): boolean {
  return event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey;
}

function isUndoShortcut(
  event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>,
): boolean {
  return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "z";
}

function isRedoShortcut(
  event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>,
): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) {
    return false;
  }

  const key = event.key.toLowerCase();

  return key === "y" || (event.shiftKey && key === "z");
}

function getFilterValue(state: { filters?: { columnId: string; value?: unknown }[] }, columnId: string): string {
  const value = state.filters?.find((filter) => filter.columnId === columnId)?.value;

  return value == null ? "" : String(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeHeight(height: YoupGridProps<unknown>["height"]): number | undefined {
  if (typeof height === "number") {
    return height;
  }

  if (typeof height === "string" && height.endsWith("px")) {
    return Number.parseInt(height, 10);
  }

  return undefined;
}
