import {
  createRemoteCacheKey,
  createValueHistoryState,
  exportGridCsv,
  exportGridExcel,
  getFillHandleCells,
  getFillHandleTargetRange,
  getInfiniteScrollTrigger,
  getVirtualRange,
  getClipboardPasteCells,
  getClipboardPasteRowCount,
  isCellInRange,
  isRowGroupNode,
  createHeaderColumnMappings,
  importGridDelimitedText,
  normalizeCellRange,
  parseClipboardText,
  parseDelimitedText,
  pushValueHistoryEntry,
  redoValueHistory,
  reorderRows,
  serializeGridRange,
  setColumnHidden as setCoreColumnHidden,
  setColumnOrder as setCoreColumnOrder,
  setColumnWidth as setCoreColumnWidth,
  sizeColumnsToFit,
  undoValueHistory,
  type AggregationResult,
  type ColumnAlign,
  type ColumnDef,
  type ColumnEditorOption,
  type ColumnEditorOptionValue,
  type ColumnPin,
  type CursorPaginationState,
  type FilterOperator,
  type FilterRule,
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
import { createPortal } from "react-dom";
import { Fragment, createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent as ReactChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  CompositionEvent as ReactCompositionEvent,
  CSSProperties,
  DragEvent as ReactDragEvent,
  FocusEvent as ReactFocusEvent,
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
  UIEvent as ReactUIEvent,
} from "react";

import type {
  YoupGridCellEditCommitReason,
  YoupGridCellContext,
  YoupGridCellMeta,
  YoupGridCellTooltipMode,
  YoupGridCellValueChangeSource,
  YoupGridCellsValueChangeSource,
  YoupGridCreateRowContext,
  YoupGridCustomEditorContext,
  YoupGridDensity,
  YoupGridFilterMode,
  YoupGridHeaderContext,
  YoupGridProps,
  YoupGridRowDetailContext,
  YoupGridRowEvent,
  YoupGridRowInsertPosition,
} from "./types.ts";
import { useYoupGrid } from "./useYoupGrid.ts";

const VALUE_HISTORY_LIMIT = 100;
const DEFAULT_DENSITY: YoupGridDensity = "standard";
const DEFAULT_DETAIL_ROW_HEIGHT = 96;
const MAX_VISIBLE_TAG_CHIPS = 2;
const DENSITY_ROW_HEIGHTS: Record<YoupGridDensity, number> = {
  compact: 30,
  standard: 38,
  comfortable: 46,
};
const ROW_NUMBER_COLUMN_WIDTH = 44;
const SELECTION_COLUMN_WIDTH = 44;
const AUTOSIZE_CELL_EXTRA_WIDTH = 8;
const AUTOSIZE_CELL_BORDER_THRESHOLD = 6;
const CONTEXT_MENU_VIEWPORT_PADDING = 8;
const INTEGER_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const DECIMAL_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

let autosizeMeasureCanvas: HTMLCanvasElement | undefined;
const composingEditorInputs = new WeakSet<HTMLInputElement>();

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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const cellContextMenuRef = useRef<HTMLDivElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const lastRowsEndReachedKeyRef = useRef<string | undefined>();
  const skipNextBlurCommitRef = useRef(false);
  const valueHistoryRef = useRef<GridValueHistoryState>(createValueHistoryState());
  const cellSelectionDragRef = useRef<CellSelectionDragState | undefined>();
  const suppressNextCellClickRef = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [focusedRowIndex, setFocusedRowIndex] = useState(0);
  const [focusedColumnIndex, setFocusedColumnIndex] = useState(0);
  const [selectionRange, setSelectionRange] = useState<GridCellRange | undefined>();
  const [fillRange, setFillRange] = useState<NormalizedGridCellRange | undefined>();
  const [editingCell, setEditingCell] = useState<EditingCell | undefined>();
  const [columnChooserOpen, setColumnChooserOpen] = useState(false);
  const [columnChooserSearch, setColumnChooserSearch] = useState("");
  const [columnMenuOpenId, setColumnMenuOpenId] = useState<string | undefined>();
  const [cellContextMenu, setCellContextMenu] = useState<CellContextMenuState | undefined>();
  const [bodyScrollbarWidth, setBodyScrollbarWidth] = useState(0);
  const [rowClipboard, setRowClipboard] = useState<RowClipboardEntry<TRow>[]>([]);
  const [internalExpandedDetailRowIds, setInternalExpandedDetailRowIds] = useState<GridRowId[]>(() => [
    ...(props.defaultExpandedDetailRowIds ?? []),
  ]);
  const [draggedColumnId, setDraggedColumnId] = useState<string | undefined>();
  const [dragOverColumnId, setDragOverColumnId] = useState<string | undefined>();
  const [dragOverColumnPosition, setDragOverColumnPosition] = useState<ColumnDropPosition | undefined>();
  const [draggedRowId, setDraggedRowId] = useState<GridRowId | undefined>();
  const [activeTooltipCellKey, setActiveTooltipCellKey] = useState<string | undefined>();
  const showRowNumberColumn = props.showRowNumberColumn ?? false;
  const showRowSelectionColumn = props.showRowSelectionColumn ?? false;
  const pinRowSelectionColumn = props.pinRowSelectionColumn ?? false;
  const showCellContextMenu = props.showCellContextMenu ?? false;
  const cellTooltipMode = props.cellTooltip?.mode ?? "native";
  const gridEditable = (props.editable ?? true) && !props.readOnly;
  const filterMode = props.filterMode ?? "text";
  const detailRowHeight = props.detailRowHeight ?? DEFAULT_DETAIL_ROW_HEIGHT;
  const detailRowsEnabled = Boolean(props.renderRowDetail);
  const rowDragReorderEnabled = Boolean(props.rowDragReorder && props.onRowsChange && gridEditable);
  const expandedDetailRowIds = props.expandedDetailRowIds ?? internalExpandedDetailRowIds;
  const expandedDetailRowIdSet = useMemo(
    () => new Set(expandedDetailRowIds),
    [expandedDetailRowIds],
  );
  const displayRows = rowModel.displayRows;
  const cellRows = useMemo(
    () => displayRows.filter((row): row is RowNode<TRow> => !isRowGroupNode(row)),
    [displayRows],
  );
  const cellRowModel = useMemo<RowModel<TRow>>(
    () => ({ ...rowModel, visibleRows: cellRows }),
    [cellRows, rowModel],
  );
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
  const visibleRowIds = useMemo(() => cellRows.map((row) => row.id), [cellRows]);
  const selectedVisibleRowCount = visibleRowIds.filter((rowId) => selectedRowIds.has(rowId)).length;
  const allVisibleRowsSelected = visibleRowIds.length > 0 && selectedVisibleRowCount === visibleRowIds.length;
  const someVisibleRowsSelected = selectedVisibleRowCount > 0 && !allVisibleRowsSelected;
  const rowNumberColumnOffset = showRowNumberColumn ? ROW_NUMBER_COLUMN_WIDTH : 0;
  const selectionColumnOffset = showRowSelectionColumn && pinRowSelectionColumn ? rowNumberColumnOffset : 0;
  const pinnedColumnOffset =
    rowNumberColumnOffset + (showRowSelectionColumn && pinRowSelectionColumn ? SELECTION_COLUMN_WIDTH : 0);
  const columnLayouts = useMemo(() => {
    return getColumnLayouts(rowModel.visibleColumns, {
      leftOffset: pinnedColumnOffset,
    });
  }, [pinnedColumnOffset, rowModel.visibleColumns]);
  const visibleColumns = useMemo(() => columnLayouts.map((layout) => layout.column), [columnLayouts]);
  const cellRowIndexById = useMemo(() => {
    return new Map(cellRows.map((row, index) => [row.id, index]));
  }, [cellRows]);
  const displayIndexByCellRowIndex = useMemo(() => {
    const displayIndexByRowId = new Map<GridRowId, number>();

    displayRows.forEach((row, index) => {
      if (!isRowGroupNode(row)) {
        displayIndexByRowId.set(row.id, index);
      }
    });

    return new Map(
      cellRows.map((row, index) => [
        index,
        displayIndexByRowId.get(row.id) ?? index,
      ]),
    );
  }, [cellRows, displayRows]);
  const headerGroupLayouts = useMemo(() => getHeaderGroupLayouts(columnLayouts), [columnLayouts]);
  const originalColumnIds = useMemo(() => getColumnDefIds(props.columns), [props.columns]);
  const resetColumnDrag = () => {
    setDraggedColumnId(undefined);
    setDragOverColumnId(undefined);
    setDragOverColumnPosition(undefined);
  };
  const resetRowDrag = () => {
    setDraggedRowId(undefined);
  };
  const dropReorderedRow = (targetRow: RowNode<TRow>) => {
    if (!rowDragReorderEnabled || draggedRowId === undefined || !props.onRowsChange) {
      resetRowDrag();
      return;
    }

    const sourceRow = cellRows.find((row) => row.id === draggedRowId);

    if (!sourceRow || sourceRow.id === targetRow.id) {
      resetRowDrag();
      return;
    }

    props.onRowsChange({
      rows: reorderRows({
        rows: props.rows,
        sourceIndex: sourceRow.index,
        targetIndex: targetRow.index,
      }),
      changes: [],
      source: "row-drag",
    });
    resetRowDrag();
  };
  const reorderColumn = (
    sourceColumnId: string | undefined,
    targetColumnId: string,
    position: ColumnDropPosition,
  ) => {
    if (!sourceColumnId) {
      return;
    }

    const columnIds = getReorderedColumnIds({
      columns: rowModel.columns,
      sourceColumnId,
      targetColumnId,
      position,
    });

    if (columnIds) {
      controller.setColumnOrder(columnIds);
    }
  };
  const moveColumn = (columnId: string, direction: ColumnMoveDirection) => {
    const target = getColumnMoveTarget(rowModel.columns, columnId, direction);

    if (!target) {
      return;
    }

    reorderColumn(columnId, target.columnId, target.position);
  };
  const canMoveColumn = (columnId: string, direction: ColumnMoveDirection) => {
    return Boolean(getColumnMoveTarget(rowModel.columns, columnId, direction));
  };
  const canResetColumnOrder = !areColumnIdsEqual(rowModel.columns.map((column) => column.id), originalColumnIds);
  const resetColumnOrder = () => {
    controller.setColumnOrder(originalColumnIds);
  };
  const hasHeaderGroups = headerGroupLayouts.some((layout) => layout.headerGroup);
  const showAggregationFooter = (props.showAggregationFooter ?? true) && rowModel.aggregation.length > 0;
  const focusedCell = {
    rowIndex: focusedRowIndex,
    columnIndex: focusedColumnIndex,
  };
  const selectionSummary = useMemo(() =>
    getSelectionSummary({
      selectionRange,
      rows: cellRows,
      pinnedTopRows: rowModel.pinnedTopRows,
      pinnedBottomRows: rowModel.pinnedBottomRows,
      columns: visibleColumns,
    }), [cellRows, rowModel.pinnedBottomRows, rowModel.pinnedTopRows, selectionRange, visibleColumns]);
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
      props.cellMeta?.[getCellKey(row.id, column.id)]
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
  const setExpandedDetailRowIds = (rowIds: GridRowId[]) => {
    if (props.expandedDetailRowIds === undefined) {
      setInternalExpandedDetailRowIds(rowIds);
    }

    props.onDetailExpandedRowsChange?.(rowIds);
  };
  const toggleDetailRowExpanded = (rowId: GridRowId) => {
    const nextRowIds = expandedDetailRowIdSet.has(rowId)
      ? expandedDetailRowIds.filter((currentRowId) => currentRowId !== rowId)
      : [...expandedDetailRowIds, rowId];

    setExpandedDetailRowIds(nextRowIds);
  };
  const getRowDetailContext = (
    row: RowNode<TRow>,
    rowIndex: number,
  ): YoupGridRowDetailContext<TRow> => {
    return {
      row: row.original,
      rowNode: row,
      rowId: row.id,
      rowIndex,
      expanded: expandedDetailRowIdSet.has(row.id),
      toggleExpanded: () => toggleDetailRowExpanded(row.id),
    };
  };
  const isRowDetailAvailable = (row: RowNode<TRow>, rowIndex: number) => {
    if (!props.renderRowDetail) {
      return false;
    }

    return props.isRowDetailAvailable?.(getRowDetailContext(row, rowIndex)) ?? true;
  };
  const detailRenderModel = useMemo(() => {
    if (!detailRowsEnabled) {
      return undefined;
    }

    return getDetailRenderModel({
      displayRows,
      expandedDetailRowIdSet,
      isRowDetailAvailable,
      rowHeight,
      detailRowHeight,
      overscan: props.overscan,
      scrollTop,
      viewportHeight,
      cellRowIndexById,
    });
  }, [
    detailRowsEnabled,
    detailRowHeight,
    displayRows,
    expandedDetailRowIdSet,
    props.overscan,
    rowHeight,
    scrollTop,
    viewportHeight,
    cellRowIndexById,
  ]);

  useEffect(() => {
    if (focusedRowIndex >= cellRows.length) {
      setFocusedRowIndex(Math.max(0, cellRows.length - 1));
    }
  }, [cellRows.length, focusedRowIndex]);

  useEffect(() => {
    if (focusedColumnIndex >= columnLayouts.length) {
      setFocusedColumnIndex(Math.max(0, columnLayouts.length - 1));
    }
  }, [columnLayouts.length, focusedColumnIndex]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    document.addEventListener("mouseup", endCellRangeSelection);

    return () => {
      document.removeEventListener("mouseup", endCellRangeSelection);
    };
  }, []);

  useEffect(() => {
    if (columnMenuOpenId && !visibleColumns.some((column) => column.id === columnMenuOpenId)) {
      setColumnMenuOpenId(undefined);
    }
  }, [columnMenuOpenId, visibleColumns]);

  useEffect(() => {
    if (!cellContextMenu) {
      return;
    }

    const closeMenu = (event?: MouseEvent) => {
      if (event?.target instanceof Node && cellContextMenuRef.current?.contains(event.target)) {
        return;
      }

      setCellContextMenu(undefined);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };

    document.addEventListener("click", closeMenu);
    document.addEventListener("contextmenu", closeMenu);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("contextmenu", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [cellContextMenu]);

  useLayoutEffect(() => {
    if (!cellContextMenu || !cellContextMenuRef.current) {
      return;
    }

    const menuRect = cellContextMenuRef.current.getBoundingClientRect();
    const placement = getClampedContextMenuPlacement({
      anchorX: cellContextMenu.clientX,
      anchorY: cellContextMenu.clientY,
      menuWidth: menuRect.width,
      menuHeight: menuRect.height,
    });

    if (
      cellContextMenu.placement?.x === placement.x &&
      cellContextMenu.placement.y === placement.y
    ) {
      return;
    }

    setCellContextMenu((current) => {
      if (
        !current ||
        current.clientX !== cellContextMenu.clientX ||
        current.clientY !== cellContextMenu.clientY
      ) {
        return current;
      }

      if (
        current.placement?.x === placement.x &&
        current.placement.y === placement.y
      ) {
        return current;
      }

      return { ...current, placement };
    });
  });

  useLayoutEffect(() => {
    const body = bodyRef.current;

    if (!body) {
      return;
    }

    const updateScrollbarWidth = () => {
      const nextWidth = Math.max(0, body.offsetWidth - body.clientWidth);
      setBodyScrollbarWidth((currentWidth) => currentWidth === nextWidth ? currentWidth : nextWidth);
    };
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(updateScrollbarWidth);

    updateScrollbarWidth();
    resizeObserver?.observe(body);
    window.addEventListener("resize", updateScrollbarWidth);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateScrollbarWidth);
    };
  }, [
    displayRows.length,
    rowHeight,
    rowModel.pinnedBottomRows.length,
    rowModel.pinnedTopRows.length,
    viewportHeight,
  ]);

  useEffect(() => {
    if (cellTooltipMode !== "rich") {
      setActiveTooltipCellKey(undefined);
      return;
    }

    const cellKey = props.cellTooltip?.autoOpenCellKey;

    if (!cellKey) {
      return;
    }

    setActiveTooltipCellKey(cellKey);

    const duration = props.cellTooltip?.autoOpenDurationMs ?? 2000;

    if (duration <= 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setActiveTooltipCellKey((current) => current === cellKey ? undefined : current);
    }, duration);

    return () => window.clearTimeout(timeout);
  }, [cellTooltipMode, props.cellTooltip?.autoOpenCellKey, props.cellTooltip?.autoOpenDurationMs]);

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
        rowModel: cellRowModel,
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
      rowModel: cellRowModel,
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
  const startCellRangeSelection = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || shouldIgnoreCellRangeMouseEvent(event)) {
      return;
    }

    const target = getCellRangeMouseTarget(event, rootRef.current);

    if (!target) {
      return;
    }

    event.preventDefault();
    target.element.focus({ preventScroll: true });

    const anchor = event.shiftKey ? selectionRange?.anchor ?? focusedCell : target.cell;

    cellSelectionDragRef.current = {
      anchor,
      focus: target.cell,
      moved: false,
    };
    setFocusedCell(target.cell, event.shiftKey, anchor);
  };
  const extendCellRangeSelection = (event: ReactMouseEvent<HTMLDivElement>) => {
    const dragState = cellSelectionDragRef.current;

    if (!dragState) {
      return;
    }

    if ((event.buttons & 1) !== 1) {
      cellSelectionDragRef.current = undefined;
      return;
    }

    const target = getCellRangeMouseTarget(event, rootRef.current);

    if (!target) {
      return;
    }

    if (
      target.cell.rowIndex === dragState.focus.rowIndex &&
      target.cell.columnIndex === dragState.focus.columnIndex
    ) {
      return;
    }

    event.preventDefault();
    target.element.focus({ preventScroll: true });
    cellSelectionDragRef.current = {
      ...dragState,
      focus: target.cell,
      moved: true,
    };
    setFocusedCell(target.cell, true, dragState.anchor);
  };
  const endCellRangeSelection = () => {
    if (cellSelectionDragRef.current?.moved) {
      suppressNextCellClickRef.current = true;

      window.setTimeout(() => {
        suppressNextCellClickRef.current = false;
      }, 0);
    }

    cellSelectionDragRef.current = undefined;
  };
  const suppressCellClickAfterDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressNextCellClickRef.current) {
      return;
    }

    if (!getCellRangeMouseTarget(event, rootRef.current)) {
      return;
    }

    suppressNextCellClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
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
  const openCellContextMenu = (
    event: ReactMouseEvent<HTMLDivElement>,
    cell: CellRenderState<TRow>,
  ) => {
    if (!showCellContextMenu || editingCell) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const insideSelection = selectionRange
      ? isCellInRange(cell.rowIndex, cell.columnIndex, selectionRange)
      : false;

    if (!insideSelection) {
      setSelectionRange(undefined);
    }

    setFocusedRowIndex(cell.rowIndex);
    setFocusedColumnIndex(cell.columnIndex);
    setCellContextMenu({
      rowIndex: cell.rowIndex,
      columnIndex: cell.columnIndex,
      clientX: event.clientX,
      clientY: event.clientY,
      anchor: event.currentTarget,
    });
  };
  const getCellContextMenuRange = () => {
    if (!cellContextMenu || !selectionRange) {
      return undefined;
    }

    return isCellInRange(cellContextMenu.rowIndex, cellContextMenu.columnIndex, selectionRange)
      ? selectionRange
      : undefined;
  };
  const copyCellContextMenuSelection = () => {
    if (!cellContextMenu) {
      return;
    }

    void writeClipboardText(getGridClipboardText({
      focusedCell: {
        rowIndex: cellContextMenu.rowIndex,
        columnIndex: cellContextMenu.columnIndex,
      },
      selectionRange: getCellContextMenuRange(),
      rows: cellRows,
      columns: visibleColumns,
    })).catch(() => undefined);
  };
  const pasteCellContextMenuSelection = () => {
    if (!cellContextMenu || !gridEditable) {
      return;
    }

    void readClipboardText()
      .then((text) => {
        applyGridClipboardText({
          text,
          focusedCell: {
            rowIndex: cellContextMenu.rowIndex,
            columnIndex: cellContextMenu.columnIndex,
          },
          selectionRange: getCellContextMenuRange(),
          rows: cellRows,
          columns: visibleColumns,
          sourceRows: props.rows,
          createRow: props.createRow,
          getRowId: props.getRowId,
          onRowsChange: props.onRowsChange,
          canEditCell: canEditGridCell,
          applyCellValueChanges,
        });
      })
      .catch(() => undefined);
  };
  const clearCellContextMenuSelection = () => {
    if (!cellContextMenu || !gridEditable) {
      return;
    }

    deleteGridCellValues({
      focusedCell: {
        rowIndex: cellContextMenu.rowIndex,
        columnIndex: cellContextMenu.columnIndex,
      },
      selectionRange: getCellContextMenuRange(),
      rows: cellRows,
      columns: visibleColumns,
      canEditCell: canEditGridCell,
      applyCellValueChanges,
    });
  };
  const selectCellContextMenuRow = () => {
    if (!cellContextMenu) {
      return;
    }

    const row = cellRows[cellContextMenu.rowIndex];

    if (row) {
      controller.setRowSelected(row.id, true);
    }
  };
  const getCellContextMenuTargetRows = () => {
    if (!cellContextMenu) {
      return [];
    }

    const row = cellRows[cellContextMenu.rowIndex];

    if (!row || isRowGroupNode(row)) {
      return [];
    }

    if (selectedRowIds.has(row.id)) {
      return cellRows.filter((visibleRow) => selectedRowIds.has(visibleRow.id));
    }

    return [row];
  };
  const getCellContextMenuDeleteRowCount = () => getCellContextMenuTargetRows().length;
  const getCellContextMenuCopyRowCount = () => getCellContextMenuTargetRows().length;
  const copyCellContextMenuRows = () => {
    const targetRows = getCellContextMenuTargetRows();

    if (targetRows.length === 0) {
      return;
    }

    const visibleRowIndexByRowId = new Map<GridRowId, number>();

    cellRows.forEach((row, index) => {
      visibleRowIndexByRowId.set(row.id, index);
    });

    setRowClipboard(targetRows.map((row) => ({
      row: row.original,
      rowId: row.id,
      rowIndex: row.index,
      visibleRowIndex: visibleRowIndexByRowId.get(row.id) ?? row.index,
    })));
  };
  const insertCellContextMenuRow = (position: YoupGridRowInsertPosition) => {
    if (!cellContextMenu || !gridEditable || !props.createRow || !props.onRowsChange) {
      return;
    }

    const anchorRow = cellRows[cellContextMenu.rowIndex];

    if (!anchorRow || isRowGroupNode(anchorRow)) {
      return;
    }

    const rowIndex = anchorRow.index + (position === "below" ? 1 : 0);
    const visibleRowIndex = cellContextMenu.rowIndex + (position === "below" ? 1 : 0);
    const row = props.createRow({
      rows: props.rows,
      rowIndex,
      visibleRowIndex,
      position,
      anchorRow: anchorRow.original,
      anchorRowId: anchorRow.id,
      anchorRowIndex: anchorRow.index,
    });
    const rows = [
      ...props.rows.slice(0, rowIndex),
      row,
      ...props.rows.slice(rowIndex),
    ];

    props.onRowsChange({
      rows,
      changes: [{
        type: "insert",
        row,
        rowIndex,
        visibleRowIndex,
        position,
        anchorRow: anchorRow.original,
        anchorRowId: anchorRow.id,
        anchorRowIndex: anchorRow.index,
      }],
      source: "context-menu",
    });
    setSelectionRange(undefined);
    setFocusedRowIndex(visibleRowIndex);
  };
  const pasteCellContextMenuRows = () => {
    if (!cellContextMenu || !gridEditable || !props.createRow || !props.onRowsChange || rowClipboard.length === 0) {
      return;
    }

    const anchorRow = cellRows[cellContextMenu.rowIndex];

    if (!anchorRow || isRowGroupNode(anchorRow)) {
      return;
    }

    const createRow = props.createRow;
    const rowIndex = anchorRow.index + 1;
    const visibleRowIndex = cellContextMenu.rowIndex + 1;
    const insertedRows = rowClipboard.map((source, offset) => {
      const nextRowIndex = rowIndex + offset;
      const nextVisibleRowIndex = visibleRowIndex + offset;
      const row = createPastedRow({
        row: createRow({
          rows: props.rows,
          rowIndex: nextRowIndex,
          visibleRowIndex: nextVisibleRowIndex,
          position: "below",
          anchorRow: anchorRow.original,
          anchorRowId: anchorRow.id,
          anchorRowIndex: anchorRow.index,
          reason: "paste",
          sourceRow: source.row,
          sourceRowId: source.rowId,
          sourceRowIndex: source.rowIndex,
          sourceVisibleRowIndex: source.visibleRowIndex,
        }),
        rowIndex: nextRowIndex,
        sourceRow: source.row,
        sourceRowId: source.rowId,
        columns: visibleColumns,
        getRowId: props.getRowId,
      });

      return {
        row,
        rowIndex: nextRowIndex,
        visibleRowIndex: nextVisibleRowIndex,
        source,
      };
    });

    props.onRowsChange({
      rows: [
        ...props.rows.slice(0, rowIndex),
        ...insertedRows.map(({ row }) => row),
        ...props.rows.slice(rowIndex),
      ],
      changes: insertedRows.map(({ row, rowIndex, visibleRowIndex, source }) => ({
        type: "insert",
        row,
        rowIndex,
        visibleRowIndex,
        position: "below",
        anchorRow: anchorRow.original,
        anchorRowId: anchorRow.id,
        anchorRowIndex: anchorRow.index,
        reason: "paste",
        sourceRow: source.row,
        sourceRowId: source.rowId,
        sourceRowIndex: source.rowIndex,
        sourceVisibleRowIndex: source.visibleRowIndex,
      })),
      source: "context-menu",
    });
    setSelectionRange(undefined);
    setFocusedRowIndex(visibleRowIndex);
  };
  const deleteCellContextMenuRows = () => {
    if (!gridEditable || !props.onRowsChange) {
      return;
    }

    const targetRows = getCellContextMenuTargetRows();

    if (targetRows.length === 0) {
      return;
    }

    const visibleRowIndexByRowId = new Map<GridRowId, number>();

    cellRows.forEach((row, index) => {
      visibleRowIndexByRowId.set(row.id, index);
    });

    const deleteRowIds = new Set(targetRows.map((row) => row.id));
    const deleteRowIndexes = new Set(targetRows.map((row) => row.index));
    const rows = props.rows.filter((_, index) => !deleteRowIndexes.has(index));

    props.onRowsChange({
      rows,
      changes: targetRows
        .slice()
        .sort((left, right) => left.index - right.index)
        .map((row) => ({
          type: "delete",
          row: row.original,
          rowId: row.id,
          rowIndex: row.index,
          visibleRowIndex: visibleRowIndexByRowId.get(row.id) ?? row.index,
        })),
      source: "context-menu",
    });
    controller.setSelectedRows(currentSelectedRowIds.filter((rowId) => !deleteRowIds.has(rowId)));
    setSelectionRange(undefined);
    setFocusedRowIndex(Math.min(
      cellContextMenu?.rowIndex ?? 0,
      Math.max(0, cellRows.length - targetRows.length - 1),
    ));
  };
  const autoSizeCellContextMenuColumn = () => {
    if (!cellContextMenu) {
      return;
    }

    const column = visibleColumns[cellContextMenu.columnIndex];

    if (column) {
      controller.setColumnWidth(
        column.id,
        getAutoSizeColumnWidth({
          anchor: cellContextMenu.anchor,
          column,
          rows: cellRows,
        }),
      );
    }
  };

  const cellContextMenuElement = renderCellContextMenu({
    state: cellContextMenu,
    menuRef: cellContextMenuRef,
    editable: gridEditable,
    hasSelectedRows: selectedRowIds.size > 0,
    canInsertRows: gridEditable && Boolean(props.createRow && props.onRowsChange),
    canPasteRows: gridEditable && Boolean(props.createRow && props.onRowsChange && rowClipboard.length > 0),
    canDeleteRows: gridEditable && Boolean(props.onRowsChange && getCellContextMenuDeleteRowCount() > 0),
    copyRowsLabel: getCellContextMenuCopyRowCount() > 1 ? "Copy selected rows" : "Copy row",
    pasteRowsLabel: rowClipboard.length > 1 ? `Paste ${rowClipboard.length} rows below` : "Paste row below",
    deleteRowLabel: getCellContextMenuDeleteRowCount() > 1 ? "Delete selected rows" : "Delete row",
    copy: copyCellContextMenuSelection,
    paste: pasteCellContextMenuSelection,
    clearContents: clearCellContextMenuSelection,
    selectRow: selectCellContextMenuRow,
    clearRowSelection: () => controller.setSelectedRows([]),
    copyRows: copyCellContextMenuRows,
    pasteRows: pasteCellContextMenuRows,
    insertRowAbove: () => insertCellContextMenuRow("above"),
    insertRowBelow: () => insertCellContextMenuRow("below"),
    deleteRows: deleteCellContextMenuRows,
    autoSizeColumn: autoSizeCellContextMenuColumn,
    closeMenu: () => setCellContextMenu(undefined),
  });
  const cellContextMenuPortal = cellContextMenuElement && typeof document !== "undefined"
    ? createPortal(cellContextMenuElement, document.body)
    : cellContextMenuElement;
  const startGridFillHandle = (context: {
    event: ReactMouseEvent<HTMLSpanElement>;
    sourceRange: NormalizedGridCellRange;
    rowModel: RowModel<TRow>;
    columnLayouts: readonly ColumnLayout<TRow>[];
    visibleColumns: readonly ResolvedColumnDef<TRow>[];
    setFillRange: (range: NormalizedGridCellRange | undefined) => void;
    setSelectionRange: (range: GridCellRange | undefined) => void;
    setFocusedRowIndex: (rowIndex: number) => void;
    setFocusedColumnIndex: (columnIndex: number) => void;
    canEditGridCell: (
      row: RowNode<TRow>,
      rowIndex: number,
      column: ResolvedColumnDef<TRow>,
    ) => boolean;
    applyCellValueChanges: (
      changes: PendingCellValueChange<TRow>[],
      source: YoupGridCellValueChangeSource,
    ) => void;
  }) => {
    startFillHandleDrag({
      event: context.event,
      sourceRange: context.sourceRange,
      rowCount: context.rowModel.visibleRows.length,
      columnCount: context.columnLayouts.length,
      setFillRange: context.setFillRange,
      applyFillRange: (targetRange) => {
        applyFillHandleValues({
          sourceRange: context.sourceRange,
          targetRange,
          rows: context.rowModel.visibleRows,
          columns: context.visibleColumns,
          canEditCell: context.canEditGridCell,
          applyCellValueChanges: context.applyCellValueChanges,
        });

        const nextSelectionRange = getFillSelectionRange(context.sourceRange, targetRange);
        context.setSelectionRange(nextSelectionRange);
        context.setFocusedRowIndex(nextSelectionRange.focus.rowIndex);
        context.setFocusedColumnIndex(nextSelectionRange.focus.columnIndex);
      },
    });
  };
  const handleGridCellKeyDown = (context: {
    event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>;
    cell: CellRenderState<TRow>;
    row: RowNode<TRow>;
    rowModel: RowModel<TRow>;
    columnLayouts: readonly ColumnLayout<TRow>[];
    rowHeight: number;
    bodyElement: HTMLDivElement | null;
    displayIndexByCellRowIndex: Map<number, number>;
    setFocusedCell: (cell: FocusedCell, extendSelection?: boolean, selectionAnchor?: FocusedCell) => void;
    selectionRange: GridCellRange | undefined;
    focusedCell: FocusedCell;
    startEditingCell: (cell: EditingCell) => void;
    commitEditingValue: (cell: EditingCell, reason?: YoupGridCellEditCommitReason) => void;
    cancelEditingCell: () => void;
    applyCellValue: (cell: CellRenderState<TRow>, value: unknown) => void;
    deleteGridCellValues: () => void;
    undoCellValueChange: () => boolean;
    redoCellValueChange: () => boolean;
    toggleSelected: () => void;
  }) => {
    handleCellKeyDown({
      event: context.event,
      cell: context.cell,
      navigationCell: context.focusedCell,
      rowCount: context.rowModel.visibleRows.length,
      columnCount: context.columnLayouts.length,
      rowHeight: context.rowHeight,
      bodyElement: context.bodyElement,
      getDisplayRowIndex: (rowIndex) => context.displayIndexByCellRowIndex.get(rowIndex) ?? rowIndex,
      setFocusedCell: context.setFocusedCell,
      selectionRange: context.selectionRange,
      startEditing: context.startEditingCell,
      commitEditing: context.commitEditingValue,
      cancelEditing: context.cancelEditingCell,
      applyCellValue: context.applyCellValue,
      deleteCellValues: context.deleteGridCellValues,
      undoCellValueChange: context.undoCellValueChange,
      redoCellValueChange: context.redoCellValueChange,
      toggleSelected: context.toggleSelected,
    });
  };
  const renderPinnedGridRow = (row: RowNode<TRow>, index: number, placement: "top" | "bottom") => {
    const rowIndex = placement === "top" ? -index - 1 : cellRows.length + index;

    return renderRow({
      row,
      columns: columnLayouts,
      selected: false,
      showRowNumberColumn,
      showSelectionColumn: showRowSelectionColumn,
      selectionColumnOffset,
      displayIndex: rowIndex,
      rowIndex,
      rowHeight,
      focusedCell: { rowIndex: -1, columnIndex: -1 },
      selectionRange: undefined,
      fillRange: undefined,
      editingCell: undefined,
      editable: false,
      disabledReason: props.disabledReason,
      treeData: false,
      detailAvailable: false,
      detailExpanded: false,
      toggleDetailRowExpanded: () => undefined,
      canEditCell: () => false,
      getCellMeta: getGridCellMeta,
      setRowSelected: () => undefined,
      setFocusedCell: () => undefined,
      toggleTreeRowExpanded: () => undefined,
      startFillHandle: () => undefined,
      autoSizeColumn: (event, column) => {
        autoSizeColumnToFit({
          event,
          column,
          rows: cellRows,
          resizeColumn: (width) => controller.setColumnWidth(column.id, width),
        });
      },
      applyCellValue: () => undefined,
      startEditing: () => undefined,
      updateEditingDraft: () => undefined,
      cancelEditing: () => undefined,
      commitEditing: () => undefined,
      cellTooltipMode,
      activeTooltipCellKey,
      openCellTooltip: setActiveTooltipCellKey,
      closeCellTooltip: (cellKey) => {
        setActiveTooltipCellKey((current) => current === cellKey ? undefined : current);
      },
      openCellContextMenu: undefined,
      onRowClick: props.onRowClick,
      onRowDoubleClick: props.onRowDoubleClick,
      rowDragReorder: false,
      onCellKeyDown: () => undefined,
      renderCell: props.renderCell,
      renderEditor: props.renderEditor,
    });
  };

  const importGridFile = async (file: File) => {
    if (!props.onImportRows) {
      return;
    }

    const text = await file.text();
    const delimiter = resolveImportDelimiter(props.importDelimiter ?? "auto", file.name, text);
    const includeHeaders = props.importIncludeHeaders ?? true;
    const parsedHeaders = includeHeaders ? parseDelimitedText(text, delimiter)[0] ?? [] : [];
    const columnMappings = createHeaderColumnMappings(visibleColumns, parsedHeaders);
    const result = importGridDelimitedText({
      text,
      delimiter,
      includeHeaders,
      columns: visibleColumns,
      columnMappings,
      createRow: ({ rowIndex, values }) =>
        props.createImportRow
          ? props.createImportRow({
              rowIndex,
              sourceRowIndex: rowIndex,
              values,
              headers: parsedHeaders,
              fileName: file.name,
            })
          : ({} as TRow),
    });

    props.onImportRows({
      file,
      text,
      delimiter,
      columnMappings,
      headers: result.headers,
      rows: result.rows,
      sourceRows: result.sourceRows,
      rowResults: result.rowResults,
      issues: result.issues,
    });
  };

  const handleImportFileChange = (event: ReactChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }
    void importGridFile(file);
  };

  return createElement(
    "div",
    {
      ref: rootRef,
      className: [
        "youp-grid",
        `youp-grid--density-${density}`,
        !gridEditable ? "youp-grid--read-only" : "",
        showRowNumberColumn ? "youp-grid--row-number-column" : "",
        pinRowSelectionColumn ? "youp-grid--selection-column-pinned" : "",
        props.className,
      ].filter(Boolean).join(" "),
      style: gridStyle,
    },
    renderColumnToolbar({
      showColumnChooser: props.showColumnChooser ?? true,
      showCsvExport: props.showCsvExport ?? true,
      showDensityControl: props.showDensityControl ?? true,
      showSizeColumnsToFit: props.showSizeColumnsToFit ?? false,
      showImport: props.showImport ?? Boolean(props.onImportRows),
      importDisabled: !gridEditable || !props.onImportRows,
      density,
      open: columnChooserOpen,
      columns: rowModel.columns,
      search: columnChooserSearch,
      setSearch: setColumnChooserSearch,
      presets: props.columnPresets,
      applyPreset: (preset) => {
        const visibleColumnIds = new Set(preset.columnIds);
        let nextState = controller.state;

        rowModel.columns.forEach((column) => {
          nextState = setCoreColumnHidden(nextState, column.id, !visibleColumnIds.has(column.id));
        });
        nextState = setCoreColumnOrder(nextState, preset.columnIds);
        controller.setState(nextState);
        props.onColumnPresetApply?.(preset);
      },
      showExcelExport: props.showExcelExport ?? true,
      toggleOpen: () => setColumnChooserOpen((current) => !current),
      setDensity,
      setColumnHidden: controller.setColumnHidden,
      setColumnPinned: controller.setColumnPinned,
      canMoveColumn,
      moveColumn,
      canResetColumnOrder,
      resetColumnOrder,
      sizeColumnsToFit: () => {
        const width = bodyRef.current?.clientWidth ?? rootRef.current?.clientWidth ?? 0;
        const columnStates = sizeColumnsToFit({
          columns: rowModel.visibleColumns,
          width: Math.max(0, width - rowNumberColumnOffset - (showRowSelectionColumn ? SELECTION_COLUMN_WIDTH : 0)),
        });
        let nextState = controller.state;

        columnStates.forEach((columnState) => {
          if (columnState.width) {
            nextState = setCoreColumnWidth(nextState, columnState.columnId, columnState.width);
          }
        });
        controller.setState(nextState);
      },
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
      exportExcel: () => {
        downloadTextFile({
          fileName: props.excelFileName ?? "youp-grid.xls",
          mimeType: "application/vnd.ms-excel;charset=utf-8",
          text: exportGridExcel({
            rows: rowModel.visibleRows,
            columns: visibleColumns,
          }),
        });
      },
      openImportFilePicker: () => importFileInputRef.current?.click(),
    }),
    createElement("input", {
      ref: importFileInputRef,
      className: "youp-grid__file-input",
      type: "file",
      accept: props.importAccept ?? ".csv,.tsv,text/csv,text/tab-separated-values,text/plain",
      onChange: handleImportFileChange,
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
        "aria-colcount": rowModel.visibleColumns.length + (showRowNumberColumn ? 1 : 0) + (showRowSelectionColumn ? 1 : 0),
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
            rows: cellRows,
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
            rows: cellRows,
            columns: visibleColumns,
            sourceRows: props.rows,
            createRow: props.createRow,
            getRowId: props.getRowId,
            onRowsChange: props.onRowsChange,
            canEditCell: canEditGridCell,
            applyCellValueChanges,
          });
        },
        onMouseDownCapture: startCellRangeSelection,
        onMouseOverCapture: extendCellRangeSelection,
        onMouseUpCapture: endCellRangeSelection,
        onClickCapture: suppressCellClickAfterDrag,
      },
      createElement(
        "div",
        { className: "youp-grid__header", role: "rowgroup", ref: headerRef },
        hasHeaderGroups
          ? createElement(
              "div",
              { className: "youp-grid__row youp-grid__row--header-group", role: "row" },
              showRowNumberColumn
                ? renderRowNumberHeaderGroupCell()
                : undefined,
              showRowSelectionColumn
                ? renderSelectionHeaderGroupCell(selectionColumnOffset)
                : undefined,
              headerGroupLayouts.map((layout) => renderHeaderGroupCell(layout, bodyScrollbarWidth)),
            )
          : undefined,
        createElement(
          "div",
          { className: "youp-grid__row youp-grid__row--header", role: "row" },
          showRowNumberColumn
            ? renderRowNumberHeaderCell()
            : undefined,
          showRowSelectionColumn
            ? renderSelectionHeaderCell({
                checked: allVisibleRowsSelected,
                indeterminate: someVisibleRowsSelected,
                disabled: visibleRowIds.length === 0,
                leftOffset: selectionColumnOffset,
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
              filterRule: getFilterRule(controller.state, layout.column.id),
              filterMode,
              showFilter: props.showFilters ?? true,
              setFilter: (value) => {
                if (value) {
                  controller.setFilter(layout.column.id, value);
                } else {
                  controller.clearFilter(layout.column.id);
                }
              },
              setAdvancedFilter: (change) => {
                if (change.operator === "isEmpty" || change.operator === "isNotEmpty" || change.value !== undefined) {
                  controller.setFilterRule({
                    columnId: layout.column.id,
                    operator: change.operator,
                    value: change.value,
                  });
                } else {
                  controller.clearFilter(layout.column.id);
                }
              },
              resizeColumn: (width) => controller.setColumnWidth(layout.column.id, width),
              rightPinnedOffset: bodyScrollbarWidth,
              dragged: draggedColumnId === layout.column.id,
              dragOver: dragOverColumnId === layout.column.id && draggedColumnId !== layout.column.id,
              startColumnDrag: (event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", layout.column.id);
                setDraggedColumnId(layout.column.id);
                setDragOverColumnId(undefined);
                setDragOverColumnPosition(undefined);
              },
              dragOverColumn: (event) => {
                if (!canReorderColumn(rowModel.columns, draggedColumnId, layout.column.id)) {
                  return;
                }

                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverColumnId(layout.column.id);
                setDragOverColumnPosition(getColumnDropPosition(event));
              },
              dropColumn: (event) => {
                if (!canReorderColumn(rowModel.columns, draggedColumnId, layout.column.id)) {
                  resetColumnDrag();
                  return;
                }

                event.preventDefault();
                reorderColumn(draggedColumnId, layout.column.id, getColumnDropPosition(event));
                resetColumnDrag();
              },
              dragOverPosition: dragOverColumnPosition,
              endColumnDrag: resetColumnDrag,
              autoSizeColumn: (event) => {
                autoSizeColumnToFit({
                  event,
                  column: layout.column,
                  rows: cellRows,
                  resizeColumn: (width) => controller.setColumnWidth(layout.column.id, width),
                });
              },
              showMenu: props.showColumnMenu ?? true,
              menuOpen: columnMenuOpenId === layout.column.id,
              toggleMenu: () => {
                setColumnMenuOpenId((current) => current === layout.column.id ? undefined : layout.column.id);
              },
              closeMenu: () => setColumnMenuOpenId(undefined),
              setColumnHidden: (hidden) => controller.setColumnHidden(layout.column.id, hidden),
              setColumnPinned: (pinned) => controller.setColumnPinned(layout.column.id, pinned),
              canMoveColumn,
              moveColumn,
              canResetColumnOrder,
              resetColumnOrder,
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
        rowModel.pinnedTopRows.length > 0
          ? createElement(
              "div",
              { className: "youp-grid__pinned-rows youp-grid__pinned-rows--top" },
              rowModel.pinnedTopRows.map((row, index) => renderPinnedGridRow(row, index, "top")),
            )
          : undefined,
        rowModel.visibleRows.length === 0 &&
        rowModel.pinnedTopRows.length === 0 &&
        rowModel.pinnedBottomRows.length === 0 &&
        !props.loading &&
        !props.error
          ? createElement("div", { className: "youp-grid__empty" }, props.emptyContent ?? "No rows")
          : rowModel.visibleRows.length === 0
            ? undefined
            : detailRowsEnabled
              ? createElement(
                  "div",
                  {
                    className: "youp-grid__virtual-spacer youp-grid__virtual-spacer--detail",
                    style: { height: detailRenderModel?.totalSize ?? 0 },
                  },
                  detailRenderModel?.entries.map((entry) =>
                    createElement(
                      "div",
                      {
                        key: getDetailRenderEntryKey(entry),
                        className: "youp-grid__virtual-entry",
                        style: {
                          height: entry.height,
                          transform: `translateY(${entry.offset}px)`,
                        },
                      },
                      entry.type === "detail"
                        ? props.renderRowDetail
                          ? renderDetailRow({
                              row: entry.row,
                              displayIndex: entry.displayIndex,
                              detailRowHeight: entry.height,
                              columns: columnLayouts,
                              showRowNumberColumn,
                              showSelectionColumn: showRowSelectionColumn,
                              selectionColumnOffset,
                              detailContext: getRowDetailContext(entry.row, entry.rowIndex),
                              renderRowDetail: props.renderRowDetail,
                            })
                          : undefined
                        : renderDisplayRow({
                            row: entry.row,
                            displayIndex: entry.displayIndex,
                            columnLayouts,
                            showRowNumberColumn,
                            showRowSelectionColumn,
                            selectionColumnOffset,
                            rowHeight,
                            detailRowHeight,
                            selectedRowIds,
                            cellRowIndexById,
                            focusedCell,
                            selectionRange,
                            fillRange,
                            editingCell,
                            gridEditable,
                            disabledReason: props.disabledReason,
                            treeData: props.treeData ?? false,
                            rowModel: cellRowModel,
                            visibleColumns,
                            canEditGridCell,
                            getGridCellMeta,
                            setRowSelected: controller.setRowSelected,
                            setFocusedCell,
                            toggleTreeRowExpanded: controller.toggleTreeRowExpanded,
                            toggleRowGroupExpanded: controller.toggleRowGroupExpanded,
                            isRowDetailAvailable,
                            getRowDetailContext,
                            renderRowDetail: undefined,
                            expandedDetailRowIdSet,
                            startFillHandle: (event) => {
                              if (!gridEditable) {
                                return;
                              }

                              startGridFillHandle({
                                event,
                                sourceRange: normalizeCellRange(selectionRange ?? {
                                  anchor: focusedCell,
                                  focus: focusedCell,
                                }),
                                rowModel: cellRowModel,
                                columnLayouts,
                                visibleColumns,
                                setFillRange,
                                setSelectionRange,
                                setFocusedRowIndex,
                                setFocusedColumnIndex,
                                canEditGridCell,
                                applyCellValueChanges,
                              });
                            },
                            autoSizeColumn: (event, column) => {
                              autoSizeColumnToFit({
                                event,
                                column,
                                rows: cellRows,
                                resizeColumn: (width) => controller.setColumnWidth(column.id, width),
                              });
                            },
                            applyCellValue,
                            startEditingCell,
                            setEditingCell,
                            cancelEditingCell,
                            commitEditingValue,
                            cellTooltipMode,
                            activeTooltipCellKey,
                            setActiveTooltipCellKey,
                            openCellContextMenu: showCellContextMenu ? openCellContextMenu : undefined,
                            onRowClick: props.onRowClick,
                            onRowDoubleClick: props.onRowDoubleClick,
                            rowDragReorder: rowDragReorderEnabled,
                            draggedRowId,
                            startRowDrag: (row) => setDraggedRowId(row.id),
                            dropRow: dropReorderedRow,
                            endRowDrag: resetRowDrag,
                            handleCellKeyDown: (event, cell, sourceRow) => {
                              handleGridCellKeyDown({
                                event,
                                cell,
                                row: sourceRow,
                                rowModel: cellRowModel,
                                columnLayouts,
                                rowHeight,
                                bodyElement: bodyRef.current,
                                displayIndexByCellRowIndex,
                                setFocusedCell,
                                selectionRange,
                                focusedCell,
                                startEditingCell,
                                commitEditingValue,
                                cancelEditingCell,
                                applyCellValue,
                                deleteGridCellValues: () => {
                                  deleteGridCellValues({
                                    focusedCell,
                                    selectionRange,
                                    rows: cellRows,
                                    columns: visibleColumns,
                                    canEditCell: canEditGridCell,
                                    applyCellValueChanges,
                                  });
                                },
                                undoCellValueChange,
                                redoCellValueChange,
                                toggleSelected: () => controller.toggleRowSelected(sourceRow.id),
                              });
                            },
                            renderCell: props.renderCell,
                            renderEditor: props.renderEditor,
                          }),
                    ),
                  ),
                )
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
                    showRowNumberColumn,
                    showSelectionColumn: showRowSelectionColumn,
                    selectionColumnOffset,
                    rowHeight,
                    toggleExpanded: controller.toggleRowGroupExpanded,
                  });
                }

                const rowIndex = cellRowIndexById.get(row.id) ?? displayIndex;

                return renderRow({
                  row,
                  columns: columnLayouts,
                  selected: selectedRowIds.has(row.id),
                  showRowNumberColumn,
                  showSelectionColumn: showRowSelectionColumn,
                  selectionColumnOffset,
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
                  treeData: props.treeData ?? false,
                  detailAvailable: false,
                  detailExpanded: false,
                  toggleDetailRowExpanded: () => undefined,
                  canEditCell: canEditGridCell,
                  getCellMeta: getGridCellMeta,
                  setRowSelected: (selected) => controller.setRowSelected(row.id, selected),
                  setFocusedCell,
                  toggleTreeRowExpanded: controller.toggleTreeRowExpanded,
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
                      rowCount: cellRows.length,
                      columnCount: columnLayouts.length,
                      setFillRange,
                      applyFillRange: (targetRange) => {
                        applyFillHandleValues({
                          sourceRange,
                          targetRange,
                          rows: cellRows,
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
                  autoSizeColumn: (event, column) => {
                    autoSizeColumnToFit({
                      event,
                      column,
                      rows: cellRows,
                      resizeColumn: (width) => controller.setColumnWidth(column.id, width),
                    });
                  },
                  applyCellValue,
                  startEditing: startEditingCell,
                  updateEditingDraft: (draftValue, options) => {
                    setEditingCell((current) => updateEditingDraft(current, draftValue, options));
                  },
                  cancelEditing: cancelEditingCell,
                  commitEditing: commitEditingValue,
                  cellTooltipMode,
                  activeTooltipCellKey,
                  openCellTooltip: setActiveTooltipCellKey,
                  closeCellTooltip: (cellKey) => {
                    setActiveTooltipCellKey((current) => current === cellKey ? undefined : current);
                  },
                  openCellContextMenu: showCellContextMenu ? openCellContextMenu : undefined,
                  onRowClick: props.onRowClick,
                  onRowDoubleClick: props.onRowDoubleClick,
                  rowDragReorder: rowDragReorderEnabled,
                  dragged: draggedRowId === row.id,
                  startRowDrag: () => setDraggedRowId(row.id),
                  dropRow: () => dropReorderedRow(row),
                  endRowDrag: resetRowDrag,
                  onCellKeyDown: (event, cell) => {
                    handleCellKeyDown({
                      event,
                      cell,
                      navigationCell: focusedCell,
                      rowCount: cellRows.length,
                      columnCount: columnLayouts.length,
                      rowHeight,
                      bodyElement: bodyRef.current,
                      getDisplayRowIndex: (rowIndex) => displayIndexByCellRowIndex.get(rowIndex) ?? rowIndex,
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
                          rows: cellRows,
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
                  renderEditor: props.renderEditor,
                });
                    }),
                  ),
                ),
        rowModel.pinnedBottomRows.length > 0
          ? createElement(
              "div",
              { className: "youp-grid__pinned-rows youp-grid__pinned-rows--bottom" },
              rowModel.pinnedBottomRows.map((row, index) => renderPinnedGridRow(row, index, "bottom")),
            )
          : undefined,
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
        showRowNumberColumn,
        showSelectionColumn: showRowSelectionColumn,
        selectionColumnOffset,
        rightPinnedOffset: bodyScrollbarWidth,
      }),
    ),
    cellContextMenuPortal,
    renderSelectionSummary(selectionSummary),
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

type SelectionSummary = {
  cellCount: number;
  rowCount: number;
  numericCount: number;
  sum: number;
};

function getSelectionSummary<TRow>(context: {
  selectionRange?: GridCellRange;
  rows: readonly RowNode<TRow>[];
  pinnedTopRows: readonly RowNode<TRow>[];
  pinnedBottomRows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
}): SelectionSummary | undefined {
  if (!context.selectionRange) {
    return undefined;
  }

  const range = normalizeCellRange(context.selectionRange);
  const selectedRows = new Set<number>();
  let cellCount = 0;
  let numericCount = 0;
  let sum = 0;

  for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
    const row = getSummaryRowAtIndex(context, rowIndex);

    if (!row) {
      continue;
    }

    let rowHasSelectedCell = false;

    for (let columnIndex = range.startColumnIndex; columnIndex <= range.endColumnIndex; columnIndex += 1) {
      const column = context.columns[columnIndex];

      if (!column) {
        continue;
      }

      cellCount += 1;
      rowHasSelectedCell = true;

      const value = column.accessor(row.original);

      if (typeof value === "number" && Number.isFinite(value)) {
        numericCount += 1;
        sum += value;
      }
    }

    if (rowHasSelectedCell) {
      selectedRows.add(rowIndex);
    }
  }

  if (cellCount <= 1) {
    return undefined;
  }

  return {
    cellCount,
    rowCount: selectedRows.size,
    numericCount,
    sum,
  };
}

function getSummaryRowAtIndex<TRow>(context: {
  rows: readonly RowNode<TRow>[];
  pinnedTopRows: readonly RowNode<TRow>[];
  pinnedBottomRows: readonly RowNode<TRow>[];
}, rowIndex: number): RowNode<TRow> | undefined {
  if (rowIndex < 0) {
    return context.pinnedTopRows[-rowIndex - 1];
  }

  if (rowIndex >= context.rows.length) {
    return context.pinnedBottomRows[rowIndex - context.rows.length];
  }

  return context.rows[rowIndex];
}

function renderSelectionSummary(summary: SelectionSummary | undefined) {
  if (!summary) {
    return undefined;
  }

  const items = [
    createElement("span", { key: "cells" }, `Cells ${formatInteger(summary.cellCount)}`),
    createElement("span", { key: "rows" }, `Rows ${formatInteger(summary.rowCount)}`),
  ];

  if (summary.numericCount > 0) {
    items.unshift(
      createElement("span", { key: "sum" }, `Sum ${formatNumericSummaryValue(summary.sum)}`),
      createElement("span", { key: "avg" }, `Avg ${formatNumericSummaryValue(summary.sum / summary.numericCount)}`),
    );
  }

  return createElement(
    "div",
    { className: "youp-grid__selection-summary", role: "status", "aria-live": "polite" },
    items,
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
  showRowNumberColumn: boolean;
  showSelectionColumn: boolean;
  selectionColumnOffset: number;
  rightPinnedOffset: number;
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
      context.showRowNumberColumn ? renderRowNumberAggregationCell() : undefined,
      context.showSelectionColumn ? renderSelectionAggregationCell(context.selectionColumnOffset) : undefined,
      context.columns.map((layout) => {
        const results = aggregationByColumn.get(layout.column.id) ?? [];

        return createElement(
          "div",
          {
            key: layout.column.id,
            className: getCellClassName("youp-grid__cell youp-grid__cell--aggregation", layout),
            role: "gridcell",
            style: getCellStyle(layout, { rightPinnedOffset: context.rightPinnedOffset }),
          },
          results.map(formatAggregationResult).join(" · "),
        );
      }),
    ),
  );
}

function renderRowNumberAggregationCell() {
  return createElement("div", {
    className: "youp-grid__cell youp-grid__row-number-cell youp-grid__row-number-cell--aggregation",
    role: "gridcell",
    style: getRowNumberCellStyle(),
    "aria-hidden": true,
  });
}

function renderSelectionAggregationCell(leftOffset: number) {
  return createElement(
    "div",
    {
      className: "youp-grid__selection-cell youp-grid__selection-cell--aggregation",
      role: "gridcell",
      style: getSelectionCellStyle(leftOffset),
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

  return formatNumericSummaryValue(value);
}

function formatNumericSummaryValue(value: number): string {
  return Number.isInteger(value)
    ? formatInteger(value)
    : DECIMAL_NUMBER_FORMATTER.format(value);
}

function formatInteger(value: number): string {
  return INTEGER_NUMBER_FORMATTER.format(value);
}

function renderHeaderGroupCell<TRow>(layout: HeaderGroupLayout<TRow>, rightPinnedOffset = 0) {
  return createElement(
    "div",
    {
      key: layout.id,
      className: getHeaderGroupClassName(layout),
      role: "columnheader",
      "aria-colspan": layout.columnCount,
      "aria-hidden": layout.headerGroup ? undefined : true,
      style: getHeaderGroupStyle(layout, { rightPinnedOffset }),
    },
    layout.headerGroup ?? "",
  );
}

function renderRowNumberHeaderGroupCell() {
  return createElement("div", {
    key: "__row-number-group",
    className: "youp-grid__cell youp-grid__cell--header-group youp-grid__row-number-cell youp-grid__row-number-cell--header-group",
    role: "columnheader",
    "aria-hidden": true,
    style: getRowNumberCellStyle(),
  });
}

function renderRowNumberHeaderCell() {
  return createElement(
    "div",
    {
      key: "__row-number",
      className: "youp-grid__cell youp-grid__cell--header youp-grid__row-number-cell youp-grid__row-number-cell--header",
      role: "columnheader",
      "aria-label": "Row number",
      style: getRowNumberCellStyle(),
    },
    "#",
  );
}

function renderSelectionHeaderGroupCell(leftOffset: number) {
  return createElement("div", {
    key: "__selection-group",
    className: "youp-grid__cell youp-grid__cell--header-group youp-grid__selection-cell youp-grid__selection-cell--header-group",
    role: "columnheader",
    "aria-hidden": true,
    style: getSelectionCellStyle(leftOffset),
  });
}

function renderSelectionHeaderCell(context: {
  checked: boolean;
  indeterminate: boolean;
  disabled: boolean;
  leftOffset: number;
  toggleSelected: (selected: boolean) => void;
}) {
  return createElement(
    "div",
    {
      key: "__selection",
      className: "youp-grid__cell youp-grid__cell--header youp-grid__selection-cell youp-grid__selection-cell--header",
      role: "columnheader",
      style: getSelectionCellStyle(context.leftOffset),
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
  filterRule?: FilterRule;
  filterMode: YoupGridFilterMode;
  showFilter: boolean;
  setFilter: (value: string) => void;
  setAdvancedFilter: (change: { operator: FilterOperator; value?: unknown }) => void;
  resizeColumn: (width: number) => void;
  dragged: boolean;
  dragOver: boolean;
  dragOverPosition: ColumnDropPosition | undefined;
  startColumnDrag: (event: ReactDragEvent<HTMLDivElement>) => void;
  dragOverColumn: (event: ReactDragEvent<HTMLDivElement>) => void;
  dropColumn: (event: ReactDragEvent<HTMLDivElement>) => void;
  endColumnDrag: () => void;
  autoSizeColumn: (event: ReactMouseEvent<HTMLElement>) => void;
  showMenu: boolean;
  menuOpen: boolean;
  toggleMenu: () => void;
  closeMenu: () => void;
  setColumnHidden: (hidden: boolean) => void;
  setColumnPinned: (pinned: ColumnPin | undefined) => void;
  canMoveColumn: (columnId: string, direction: ColumnMoveDirection) => boolean;
  moveColumn: (columnId: string, direction: ColumnMoveDirection) => void;
  canResetColumnOrder: boolean;
  resetColumnOrder: () => void;
  renderHeader?: (context: YoupGridHeaderContext<TRow>) => ReactNode;
  rightPinnedOffset: number;
}) {
  const sortable = context.layout.column.sortable !== false;
  const filterValue = getFilterRuleValue(context.filterRule);

  return createElement(
    "div",
    {
      key: context.layout.column.id,
      className: getCellClassName(
        [
          "youp-grid__cell youp-grid__cell--header",
          context.menuOpen ? "youp-grid__cell--menu-open" : "",
          context.dragged ? "youp-grid__cell--column-dragging" : "",
          context.dragOver ? `youp-grid__cell--column-drag-over-${context.dragOverPosition ?? "before"}` : "",
        ]
          .filter(Boolean)
          .join(" "),
        context.layout,
      ),
      role: "columnheader",
      style: getCellStyle(context.layout, { rightPinnedOffset: context.rightPinnedOffset }),
      "aria-sort": context.sorted === "desc" ? "descending" : context.sorted === "asc" ? "ascending" : "none",
      "data-youp-column-id": context.layout.column.id,
      draggable: true,
      onDragStart: context.startColumnDrag,
      onDragOver: context.dragOverColumn,
      onDrop: context.dropColumn,
      onDragEnd: context.endColumnDrag,
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
          filterValue,
          setSort: context.setSort,
          clearSort: context.clearSort,
              clearFilter: () => context.setFilter(""),
              setColumnHidden: context.setColumnHidden,
              setColumnPinned: context.setColumnPinned,
              canMoveColumn: context.canMoveColumn,
              moveColumn: context.moveColumn,
              canResetColumnOrder: context.canResetColumnOrder,
              resetColumnOrder: context.resetColumnOrder,
              closeMenu: context.closeMenu,
            })
      : undefined,
    context.showFilter && context.layout.column.filterable !== false
      ? renderHeaderFilter({
          column: context.layout.column,
          mode: context.filterMode,
          filterRule: context.filterRule,
          filterValue,
          setFilter: context.setFilter,
          setAdvancedFilter: context.setAdvancedFilter,
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
      onDoubleClick: context.autoSizeColumn,
    }),
  );
}

function renderHeaderFilter<TRow>(context: {
  column: ResolvedColumnDef<TRow>;
  mode: YoupGridFilterMode;
  filterRule?: FilterRule;
  filterValue: string;
  setFilter: (value: string) => void;
  setAdvancedFilter: (change: { operator: FilterOperator; value?: unknown }) => void;
}) {
  if (context.mode !== "advanced") {
    return createElement("input", {
      className: "youp-grid__filter",
      value: context.filterValue,
      placeholder: "Filter",
      "aria-label": `Filter ${context.column.headerName}`,
      onChange: (event) => {
        context.setFilter(event.currentTarget.value);
      },
      onClick: (event) => event.stopPropagation(),
    });
  }

  const operator = context.filterRule?.operator ?? "contains";
  const requiresValue = operator !== "isEmpty" && operator !== "isNotEmpty";

  return createElement(
    "div",
    { className: "youp-grid__advanced-filter", onClick: (event) => event.stopPropagation() },
    createElement(
      "select",
      {
        className: "youp-grid__filter-operator",
        value: operator,
        "aria-label": `Filter operator ${context.column.headerName}`,
        onChange: (event: ReactChangeEvent<HTMLSelectElement>) => {
          const nextOperator = event.currentTarget.value as FilterOperator;

          context.setAdvancedFilter({
            operator: nextOperator,
            value: nextOperator === "isEmpty" || nextOperator === "isNotEmpty"
              ? undefined
              : parseAdvancedFilterValue(context.filterValue, nextOperator),
          });
        },
      },
      renderFilterOperatorOption("contains", "Contains"),
      renderFilterOperatorOption("equals", "="),
      renderFilterOperatorOption("startsWith", "Starts"),
      renderFilterOperatorOption("endsWith", "Ends"),
      renderFilterOperatorOption("gt", ">"),
      renderFilterOperatorOption("gte", ">="),
      renderFilterOperatorOption("lt", "<"),
      renderFilterOperatorOption("lte", "<="),
      renderFilterOperatorOption("between", "Between"),
      renderFilterOperatorOption("in", "In"),
      renderFilterOperatorOption("isEmpty", "Empty"),
      renderFilterOperatorOption("isNotEmpty", "Not empty"),
    ),
    requiresValue
      ? createElement("input", {
          className: "youp-grid__filter",
          value: context.filterValue,
          placeholder: operator === "between" ? "min..max" : operator === "in" ? "a,b,c" : "Filter",
          "aria-label": `Filter ${context.column.headerName}`,
          onChange: (event: ReactChangeEvent<HTMLInputElement>) => {
            context.setAdvancedFilter({
              operator,
              value: parseAdvancedFilterValue(event.currentTarget.value, operator),
            });
          },
        })
      : undefined,
  );
}

function renderFilterOperatorOption(operator: FilterOperator, label: string) {
  return createElement("option", { key: operator, value: operator }, label);
}

function parseAdvancedFilterValue(value: string, operator: FilterOperator): unknown {
  if (!value && operator !== "equals") {
    return undefined;
  }

  if (operator === "between") {
    return value.split("..").map((part) => coerceFilterValue(part.trim()));
  }

  if (operator === "in") {
    return value.split(",").map((part) => coerceFilterValue(part.trim())).filter((part) => part !== "");
  }

  return coerceFilterValue(value);
}

function coerceFilterValue(value: string): string | number {
  const numberValue = Number(value);

  return value !== "" && Number.isFinite(numberValue) ? numberValue : value;
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
  canMoveColumn: (columnId: string, direction: ColumnMoveDirection) => boolean;
  moveColumn: (columnId: string, direction: ColumnMoveDirection) => void;
  canResetColumnOrder: boolean;
  resetColumnOrder: () => void;
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
      label: "Move to start",
      disabled: !context.canMoveColumn(context.column.id, "start"),
      onClick: () => runAction(() => context.moveColumn(context.column.id, "start")),
    }),
    renderColumnMenuButton({
      label: "Move left",
      disabled: !context.canMoveColumn(context.column.id, "left"),
      onClick: () => runAction(() => context.moveColumn(context.column.id, "left")),
    }),
    renderColumnMenuButton({
      label: "Move right",
      disabled: !context.canMoveColumn(context.column.id, "right"),
      onClick: () => runAction(() => context.moveColumn(context.column.id, "right")),
    }),
    renderColumnMenuButton({
      label: "Move to end",
      disabled: !context.canMoveColumn(context.column.id, "end"),
      onClick: () => runAction(() => context.moveColumn(context.column.id, "end")),
    }),
    renderColumnMenuButton({
      label: "Reset column order",
      disabled: !context.canResetColumnOrder,
      onClick: () => runAction(context.resetColumnOrder),
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

function renderCellContextMenu(context: {
  state?: CellContextMenuState;
  menuRef: RefObject<HTMLDivElement>;
  editable: boolean;
  hasSelectedRows: boolean;
  canInsertRows: boolean;
  canPasteRows: boolean;
  canDeleteRows: boolean;
  copyRowsLabel: string;
  pasteRowsLabel: string;
  deleteRowLabel: string;
  copy: () => void;
  paste: () => void;
  clearContents: () => void;
  selectRow: () => void;
  clearRowSelection: () => void;
  copyRows: () => void;
  pasteRows: () => void;
  insertRowAbove: () => void;
  insertRowBelow: () => void;
  deleteRows: () => void;
  autoSizeColumn: () => void;
  closeMenu: () => void;
}) {
  if (!context.state) {
    return undefined;
  }

  const runAction = (action: () => void) => {
    action();
    context.closeMenu();
  };
  const placement = context.state.placement;

  return createElement(
    "div",
    {
      ref: context.menuRef,
      className: "youp-grid__cell-context-menu",
      role: "menu",
      style: {
        left: placement?.x ?? context.state.clientX,
        top: placement?.y ?? context.state.clientY,
        visibility: placement ? "visible" : "hidden",
      },
      onClick: (event: ReactMouseEvent<HTMLDivElement>) => {
        event.stopPropagation();
      },
      onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
      },
    },
    renderColumnMenuButton({
      label: "Copy",
      onClick: () => runAction(context.copy),
    }),
    renderColumnMenuButton({
      label: "Paste",
      disabled: !context.editable,
      onClick: () => runAction(context.paste),
    }),
    renderColumnMenuButton({
      label: "Clear contents",
      disabled: !context.editable,
      onClick: () => runAction(context.clearContents),
    }),
    createElement("div", { className: "youp-grid__column-menu-separator", role: "separator" }),
    renderColumnMenuButton({
      label: "Select row",
      onClick: () => runAction(context.selectRow),
    }),
    renderColumnMenuButton({
      label: "Clear row selection",
      disabled: !context.hasSelectedRows,
      onClick: () => runAction(context.clearRowSelection),
    }),
    renderColumnMenuButton({
      label: context.copyRowsLabel,
      onClick: () => runAction(context.copyRows),
    }),
    renderColumnMenuButton({
      label: context.pasteRowsLabel,
      disabled: !context.canPasteRows,
      onClick: () => runAction(context.pasteRows),
    }),
    createElement("div", { className: "youp-grid__column-menu-separator", role: "separator" }),
    renderColumnMenuButton({
      label: "Insert row above",
      disabled: !context.canInsertRows,
      onClick: () => runAction(context.insertRowAbove),
    }),
    renderColumnMenuButton({
      label: "Insert row below",
      disabled: !context.canInsertRows,
      onClick: () => runAction(context.insertRowBelow),
    }),
    renderColumnMenuButton({
      label: context.deleteRowLabel,
      disabled: !context.canDeleteRows,
      onClick: () => runAction(context.deleteRows),
    }),
    createElement("div", { className: "youp-grid__column-menu-separator", role: "separator" }),
    renderColumnMenuButton({
      label: "Auto-size column",
      onClick: () => runAction(context.autoSizeColumn),
    }),
  );
}

function renderGroupRow<TRow>(context: {
  row: RowGroupNode;
  columns: readonly ColumnLayout<TRow>[];
  showRowNumberColumn: boolean;
  showSelectionColumn: boolean;
  selectionColumnOffset: number;
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
    context.showRowNumberColumn ? renderRowNumberGroupCell() : undefined,
    context.showSelectionColumn ? renderSelectionGroupCell(context.selectionColumnOffset) : undefined,
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
        createElement("span", {
          className: [
            "youp-grid__group-caret youp-grid__caret",
            context.row.expanded ? "youp-grid__caret--expanded" : "",
          ].filter(Boolean).join(" "),
          "aria-hidden": true,
        }),
        createElement("span", { className: "youp-grid__group-label" }, context.row.label),
        createElement("span", { className: "youp-grid__group-count" }, `${context.row.rowCount} rows`),
      ),
    ),
  );
}

function renderRowNumberGroupCell() {
  return createElement("div", {
    className: "youp-grid__cell youp-grid__row-number-cell youp-grid__row-number-cell--group",
    role: "gridcell",
    style: getRowNumberCellStyle(),
    "aria-hidden": true,
  });
}

function renderSelectionGroupCell(leftOffset: number) {
  return createElement("div", {
    className: "youp-grid__selection-cell youp-grid__selection-cell--group",
    role: "gridcell",
    style: getSelectionCellStyle(leftOffset),
    "aria-hidden": true,
  });
}

type DetailRenderEntry<TRow> =
  | {
      type: "row";
      row: RowDisplayNode<TRow>;
      displayIndex: number;
      offset: number;
      height: number;
    }
  | {
      type: "detail";
      row: RowNode<TRow>;
      displayIndex: number;
      rowIndex: number;
      offset: number;
      height: number;
    };

function getDetailRenderModel<TRow>(context: {
  displayRows: readonly RowDisplayNode<TRow>[];
  expandedDetailRowIdSet: ReadonlySet<GridRowId>;
  isRowDetailAvailable: (row: RowNode<TRow>, rowIndex: number) => boolean;
  rowHeight: number;
  detailRowHeight: number;
  overscan?: number;
  scrollTop: number;
  viewportHeight: number;
  cellRowIndexById: Map<GridRowId, number>;
}) {
  const entries: DetailRenderEntry<TRow>[] = [];
  const overscanPx = (context.overscan ?? 3) * context.rowHeight;
  let offset = 0;

  context.displayRows.forEach((row, displayIndex) => {
    if (isRenderEntryVisible(offset, context.rowHeight, context.scrollTop, context.viewportHeight, overscanPx)) {
      entries.push({
        type: "row",
        row,
        displayIndex,
        offset,
        height: context.rowHeight,
      });
    }

    offset += context.rowHeight;

    if (isRowGroupNode(row)) {
      return;
    }

    const rowIndex = context.cellRowIndexById.get(row.id) ?? displayIndex;

    if (!context.expandedDetailRowIdSet.has(row.id) || !context.isRowDetailAvailable(row, rowIndex)) {
      return;
    }

    if (isRenderEntryVisible(offset, context.detailRowHeight, context.scrollTop, context.viewportHeight, overscanPx)) {
      entries.push({
        type: "detail",
        row,
        displayIndex,
        rowIndex,
        offset,
        height: context.detailRowHeight,
      });
    }

    offset += context.detailRowHeight;
  });

  return {
    entries,
    totalSize: offset,
  };
}

function isRenderEntryVisible(
  offset: number,
  height: number,
  scrollTop: number,
  viewportHeight: number,
  overscanPx: number,
) {
  return offset + height >= scrollTop - overscanPx && offset <= scrollTop + viewportHeight + overscanPx;
}

function getDetailRenderEntryKey<TRow>(entry: DetailRenderEntry<TRow>) {
  const id = entry.type === "detail" ? entry.row.id : isRowGroupNode(entry.row) ? entry.row.groupId : entry.row.id;

  return `${entry.type}:${rowKey(id)}`;
}

function renderDetailRow<TRow>(context: {
  row: RowNode<TRow>;
  displayIndex: number;
  detailRowHeight: number;
  columns: readonly ColumnLayout<TRow>[];
  showRowNumberColumn: boolean;
  showSelectionColumn: boolean;
  selectionColumnOffset: number;
  detailContext: YoupGridRowDetailContext<TRow>;
  renderRowDetail: (context: YoupGridRowDetailContext<TRow>) => ReactNode;
}) {
  const content = context.renderRowDetail(context.detailContext);

  if (content === null || content === undefined || content === false) {
    return undefined;
  }

  const width = getColumnsWidth(context.columns);

  return createElement(
    "div",
    {
      key: `${rowKey(context.row.id)}:detail`,
      className: "youp-grid__row youp-grid__row--detail",
      role: "row",
      "aria-rowindex": context.displayIndex + 2,
      style: { height: context.detailRowHeight, minHeight: context.detailRowHeight },
    },
    context.showRowNumberColumn
      ? createElement("div", {
          className: "youp-grid__cell youp-grid__row-number-cell youp-grid__row-number-cell--detail",
          role: "gridcell",
          style: getRowNumberCellStyle(),
          "aria-hidden": true,
        })
      : undefined,
    context.showSelectionColumn
      ? createElement("div", {
          className: "youp-grid__selection-cell youp-grid__selection-cell--detail",
          role: "gridcell",
          style: getSelectionCellStyle(context.selectionColumnOffset),
          "aria-hidden": true,
        })
      : undefined,
    createElement(
      "div",
      {
        className: "youp-grid__cell youp-grid__cell--detail",
        role: "gridcell",
        "aria-colspan": context.columns.length,
        style: {
          width,
          flex: `0 0 ${width}px`,
          height: context.detailRowHeight,
          minHeight: context.detailRowHeight,
        },
      },
      content,
    ),
  );
}

function renderDisplayRow<TRow>(context: {
  row: RowDisplayNode<TRow>;
  displayIndex: number;
  columnLayouts: readonly ColumnLayout<TRow>[];
  showRowNumberColumn: boolean;
  showRowSelectionColumn: boolean;
  selectionColumnOffset: number;
  rowHeight: number;
  detailRowHeight: number;
  selectedRowIds: ReadonlySet<GridRowId>;
  cellRowIndexById: Map<GridRowId, number>;
  focusedCell: FocusedCell;
  selectionRange?: GridCellRange;
  fillRange?: NormalizedGridCellRange;
  editingCell?: EditingCell;
  gridEditable: boolean;
  disabledReason?: ReactNode;
  treeData: boolean;
  rowModel: RowModel<TRow>;
  visibleColumns: readonly ResolvedColumnDef<TRow>[];
  canEditGridCell: (
    row: RowNode<TRow>,
    rowIndex: number,
    column: ResolvedColumnDef<TRow>,
  ) => boolean;
  getGridCellMeta: (
    row: RowNode<TRow>,
    rowIndex: number,
    column: ResolvedColumnDef<TRow>,
  ) => YoupGridCellMeta | undefined;
  setRowSelected: (rowId: GridRowId, selected: boolean) => void;
  setFocusedCell: (cell: FocusedCell, extendSelection?: boolean, selectionAnchor?: FocusedCell) => void;
  toggleTreeRowExpanded: (rowId: GridRowId) => void;
  toggleRowGroupExpanded: (groupId: string) => void;
  isRowDetailAvailable: (row: RowNode<TRow>, rowIndex: number) => boolean;
  getRowDetailContext: (
    row: RowNode<TRow>,
    rowIndex: number,
  ) => YoupGridRowDetailContext<TRow>;
  renderRowDetail?: (context: YoupGridRowDetailContext<TRow>) => ReactNode;
  expandedDetailRowIdSet: ReadonlySet<GridRowId>;
  startFillHandle: (event: ReactMouseEvent<HTMLSpanElement>, row: RowNode<TRow>) => void;
  autoSizeColumn: (event: ReactMouseEvent<HTMLElement>, column: ResolvedColumnDef<TRow>) => void;
  applyCellValue: (cell: CellRenderState<TRow>, value: unknown) => void;
  startEditingCell: (cell: EditingCell) => void;
  setEditingCell: (update: (current: EditingCell | undefined) => EditingCell | undefined) => void;
  cancelEditingCell: () => void;
  commitEditingValue: (cell: EditingCell, reason?: YoupGridCellEditCommitReason) => void;
  cellTooltipMode: YoupGridCellTooltipMode;
  activeTooltipCellKey?: string;
  setActiveTooltipCellKey: (cellKey: string | undefined | ((current: string | undefined) => string | undefined)) => void;
  openCellContextMenu?: (
    event: ReactMouseEvent<HTMLDivElement>,
    cell: CellRenderState<TRow>,
  ) => void;
  onRowClick?: (event: YoupGridRowEvent<TRow>) => void;
  onRowDoubleClick?: (event: YoupGridRowEvent<TRow>) => void;
  rowDragReorder: boolean;
  draggedRowId?: GridRowId;
  startRowDrag: (row: RowNode<TRow>) => void;
  dropRow: (row: RowNode<TRow>) => void;
  endRowDrag: () => void;
  handleCellKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>,
    cell: CellRenderState<TRow>,
    row: RowNode<TRow>,
  ) => void;
  renderCell?: (context: YoupGridCellContext<TRow>) => ReactNode;
  renderEditor?: (context: YoupGridCustomEditorContext<TRow>) => ReactNode;
}) {
  if (isRowGroupNode(context.row)) {
    return renderGroupRow({
      row: context.row,
      columns: context.columnLayouts,
      showRowNumberColumn: context.showRowNumberColumn,
      showSelectionColumn: context.showRowSelectionColumn,
      selectionColumnOffset: context.selectionColumnOffset,
      rowHeight: context.rowHeight,
      toggleExpanded: context.toggleRowGroupExpanded,
    });
  }

  const rowNode = context.row as RowNode<TRow>;
  const rowIndex = context.cellRowIndexById.get(rowNode.id) ?? context.displayIndex;
  const detailAvailable = context.isRowDetailAvailable(rowNode, rowIndex);
  const detailExpanded = detailAvailable && context.expandedDetailRowIdSet.has(rowNode.id);
  const detailContext = context.getRowDetailContext(rowNode, rowIndex);
  const rowElement = renderRow({
    row: rowNode,
    columns: context.columnLayouts,
    selected: context.selectedRowIds.has(rowNode.id),
    showRowNumberColumn: context.showRowNumberColumn,
    showSelectionColumn: context.showRowSelectionColumn,
    selectionColumnOffset: context.selectionColumnOffset,
    displayIndex: context.displayIndex,
    rowIndex,
    rowHeight: context.rowHeight,
    focusedCell: context.focusedCell,
    selectionRange: context.selectionRange,
    fillRange: context.fillRange,
    editingCell: context.editingCell,
    editable: context.gridEditable,
    disabledReason: context.disabledReason,
    treeData: context.treeData,
    detailAvailable,
    detailExpanded,
    toggleDetailRowExpanded: detailContext.toggleExpanded,
    canEditCell: context.canEditGridCell,
    getCellMeta: context.getGridCellMeta,
    setRowSelected: (selected) => context.setRowSelected(rowNode.id, selected),
    setFocusedCell: context.setFocusedCell,
    toggleTreeRowExpanded: context.toggleTreeRowExpanded,
    startFillHandle: (event) => context.startFillHandle(event, rowNode),
    autoSizeColumn: context.autoSizeColumn,
    applyCellValue: context.applyCellValue,
    startEditing: context.startEditingCell,
    updateEditingDraft: (draftValue, options) => {
      context.setEditingCell((current) => updateEditingDraft(current, draftValue, options));
    },
    cancelEditing: context.cancelEditingCell,
    commitEditing: context.commitEditingValue,
    cellTooltipMode: context.cellTooltipMode,
    activeTooltipCellKey: context.activeTooltipCellKey,
    openCellTooltip: context.setActiveTooltipCellKey,
    closeCellTooltip: (cellKey) => {
      context.setActiveTooltipCellKey((current) => current === cellKey ? undefined : current);
    },
    openCellContextMenu: context.openCellContextMenu,
    onRowClick: context.onRowClick,
    onRowDoubleClick: context.onRowDoubleClick,
    rowDragReorder: context.rowDragReorder,
    dragged: context.draggedRowId === rowNode.id,
    startRowDrag: () => context.startRowDrag(rowNode),
    dropRow: () => context.dropRow(rowNode),
    endRowDrag: context.endRowDrag,
    onCellKeyDown: (event, cell) => context.handleCellKeyDown(event, cell, rowNode),
    renderCell: context.renderCell,
    renderEditor: context.renderEditor,
  });
  const detailElement = detailExpanded && context.renderRowDetail
    ? renderDetailRow({
        row: rowNode,
        displayIndex: context.displayIndex,
        detailRowHeight: context.detailRowHeight,
        columns: context.columnLayouts,
        showRowNumberColumn: context.showRowNumberColumn,
        showSelectionColumn: context.showRowSelectionColumn,
        selectionColumnOffset: context.selectionColumnOffset,
        detailContext,
        renderRowDetail: context.renderRowDetail,
      })
    : undefined;

  return createElement(Fragment, { key: rowKey(context.row.id) }, rowElement, detailElement);
}

function renderRow<TRow>(context: {
  row: RowNode<TRow>;
  columns: readonly ColumnLayout<TRow>[];
  selected: boolean;
  showRowNumberColumn: boolean;
  showSelectionColumn: boolean;
  selectionColumnOffset: number;
  displayIndex: number;
  rowIndex: number;
  rowHeight: number;
  focusedCell: FocusedCell;
  selectionRange?: GridCellRange;
  fillRange?: NormalizedGridCellRange;
  editingCell?: EditingCell;
  editable: boolean;
  disabledReason?: ReactNode;
  treeData: boolean;
  detailAvailable: boolean;
  detailExpanded: boolean;
  toggleDetailRowExpanded: () => void;
  canEditCell: (row: RowNode<TRow>, rowIndex: number, column: ResolvedColumnDef<TRow>) => boolean;
  getCellMeta: (
    row: RowNode<TRow>,
    rowIndex: number,
    column: ResolvedColumnDef<TRow>,
  ) => YoupGridCellMeta | undefined;
  setRowSelected: (selected: boolean) => void;
  setFocusedCell: (cell: FocusedCell, extendSelection?: boolean, selectionAnchor?: FocusedCell) => void;
  toggleTreeRowExpanded: (rowId: GridRowId) => void;
  startFillHandle: (event: ReactMouseEvent<HTMLSpanElement>) => void;
  autoSizeColumn: (event: ReactMouseEvent<HTMLElement>, column: ResolvedColumnDef<TRow>) => void;
  applyCellValue: (cell: CellRenderState<TRow>, value: unknown) => void;
  startEditing: (cell: EditingCell) => void;
  updateEditingDraft: (draftValue: string, options?: UpdateEditingDraftOptions) => void;
  cancelEditing: () => void;
  commitEditing: (cell: EditingCell, reason?: YoupGridCellEditCommitReason) => void;
  onRowClick?: (event: YoupGridRowEvent<TRow>) => void;
  onRowDoubleClick?: (event: YoupGridRowEvent<TRow>) => void;
  rowDragReorder?: boolean;
  dragged?: boolean;
  startRowDrag?: () => void;
  dropRow?: () => void;
  endRowDrag?: () => void;
  onCellKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>,
    cell: CellRenderState<TRow>,
  ) => void;
  openCellContextMenu?: (
    event: ReactMouseEvent<HTMLDivElement>,
    cell: CellRenderState<TRow>,
  ) => void;
  cellTooltipMode: YoupGridCellTooltipMode;
  activeTooltipCellKey?: string;
  openCellTooltip: (cellKey: string) => void;
  closeCellTooltip: (cellKey: string) => void;
  renderCell?: (context: YoupGridCellContext<TRow>) => ReactNode;
  renderEditor?: (context: YoupGridCustomEditorContext<TRow>) => ReactNode;
}) {
  return createElement(
    "div",
    {
      key: rowKey(context.row.id),
      className: [
        "youp-grid__row",
        context.selected ? "youp-grid__row--selected" : "",
        context.dragged ? "youp-grid__row--dragging" : "",
      ]
        .filter(Boolean)
        .join(" "),
      role: "row",
      "aria-rowindex": context.displayIndex + 1,
      "aria-selected": context.selected,
      "data-youp-row-index": context.rowIndex,
      draggable: context.rowDragReorder,
      style: { height: context.rowHeight },
      onDragStart: context.rowDragReorder
        ? (event: ReactDragEvent<HTMLDivElement>) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", String(context.row.id));
            context.startRowDrag?.();
          }
        : undefined,
      onDragOver: context.rowDragReorder
        ? (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        : undefined,
      onDrop: context.rowDragReorder
        ? (event: ReactDragEvent<HTMLDivElement>) => {
            event.preventDefault();
            context.dropRow?.();
          }
        : undefined,
      onDragEnd: context.rowDragReorder ? context.endRowDrag : undefined,
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
    context.showRowNumberColumn
      ? renderRowNumberCell({
          rowIndex: context.rowIndex,
          displayIndex: context.displayIndex,
        })
      : undefined,
    context.showSelectionColumn
      ? renderSelectionCell({
          rowIndex: context.rowIndex,
          selected: context.selected,
          setSelected: context.setRowSelected,
          leftOffset: context.selectionColumnOffset,
          ariaColIndex: context.showRowNumberColumn ? 2 : 1,
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
        ariaColumnOffset: (context.showRowNumberColumn ? 1 : 0) + (context.showSelectionColumn ? 1 : 0),
        focused,
        selected,
        fillTargeted,
        showFillHandle,
        editing,
        editingCell: context.editingCell,
        editable,
        disabledReason: context.disabledReason,
        treeData: context.treeData,
        detailAvailable: context.detailAvailable,
        detailExpanded: context.detailExpanded,
        toggleDetailRowExpanded: context.toggleDetailRowExpanded,
        meta,
        setFocusedCell: context.setFocusedCell,
        toggleTreeRowExpanded: context.toggleTreeRowExpanded,
        startFillHandle: context.startFillHandle,
        autoSizeColumn: context.autoSizeColumn,
        applyCellValue: context.applyCellValue,
        startEditing: context.startEditing,
        updateEditingDraft: context.updateEditingDraft,
        cancelEditing: context.cancelEditing,
        commitEditing: context.commitEditing,
        onKeyDown: context.onCellKeyDown,
        openContextMenu: context.openCellContextMenu,
        cellTooltipMode: context.cellTooltipMode,
        activeTooltipCellKey: context.activeTooltipCellKey,
        openCellTooltip: context.openCellTooltip,
        closeCellTooltip: context.closeCellTooltip,
        renderCell: context.renderCell,
        renderEditor: context.renderEditor,
      });
    }),
  );
}

function renderRowNumberCell(context: {
  rowIndex: number;
  displayIndex: number;
}) {
  return createElement(
    "div",
    {
      className: "youp-grid__cell youp-grid__row-number-cell",
      role: "gridcell",
      "aria-colindex": 1,
      "aria-label": `Row ${context.rowIndex + 1}`,
      style: getRowNumberCellStyle(),
    },
    context.displayIndex + 1,
  );
}

function renderSelectionCell(context: {
  rowIndex: number;
  selected: boolean;
  setSelected: (selected: boolean) => void;
  leftOffset: number;
  ariaColIndex: number;
}) {
  return createElement(
    "div",
    {
      className: "youp-grid__cell youp-grid__selection-cell",
      role: "gridcell",
      "aria-colindex": context.ariaColIndex,
      style: getSelectionCellStyle(context.leftOffset),
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

function shouldIgnoreCellRangeMouseEvent(event: ReactMouseEvent<HTMLElement>): boolean {
  const target = event.target;

  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest(".youp-grid__fill-handle,button,input,select,textarea,a,[contenteditable='true']"));
}

function getCellRangeMouseTarget(
  event: ReactMouseEvent<HTMLElement>,
  rootElement: HTMLElement | null,
): CellRangeMouseTarget | undefined {
  const target = event.target;

  if (!(target instanceof Element)) {
    return undefined;
  }

  const element = target.closest("[data-youp-row-index][data-youp-column-index]");

  if (!(element instanceof HTMLElement) || !rootElement?.contains(element)) {
    return undefined;
  }

  const rowIndex = Number(element.dataset.youpRowIndex);
  const columnIndex = Number(element.dataset.youpColumnIndex);

  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) {
    return undefined;
  }

  return {
    element,
    cell: {
      rowIndex,
      columnIndex,
    },
  };
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
  treeData: boolean;
  detailAvailable: boolean;
  detailExpanded: boolean;
  toggleDetailRowExpanded: () => void;
  meta?: YoupGridCellMeta;
  setFocusedCell: (cell: FocusedCell, extendSelection?: boolean, selectionAnchor?: FocusedCell) => void;
  toggleTreeRowExpanded: (rowId: GridRowId) => void;
  startFillHandle: (event: ReactMouseEvent<HTMLSpanElement>) => void;
  autoSizeColumn: (event: ReactMouseEvent<HTMLElement>, column: ResolvedColumnDef<TRow>) => void;
  applyCellValue: (cell: CellRenderState<TRow>, value: unknown) => void;
  startEditing: (cell: EditingCell) => void;
  updateEditingDraft: (draftValue: string, options?: UpdateEditingDraftOptions) => void;
  cancelEditing: () => void;
  commitEditing: (cell: EditingCell, reason?: YoupGridCellEditCommitReason) => void;
  onKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>,
    cell: CellRenderState<TRow>,
  ) => void;
  openContextMenu?: (
    event: ReactMouseEvent<HTMLDivElement>,
    cell: CellRenderState<TRow>,
  ) => void;
  cellTooltipMode: YoupGridCellTooltipMode;
  activeTooltipCellKey?: string;
  openCellTooltip: (cellKey: string) => void;
  closeCellTooltip: (cellKey: string) => void;
  renderCell?: (context: YoupGridCellContext<TRow>) => ReactNode;
  renderEditor?: (context: YoupGridCustomEditorContext<TRow>) => ReactNode;
}) {
  const column = context.layout.column;
  const value = column.accessor(context.row.original);
  const editable = context.editable;
  const cellAlign = getColumnAlign(column);
  const cellKey = getCellKey(context.row.id, column.id);
  const showTreePrefix = context.treeData && context.columnIndex === 0;
  const showDetailPrefix = context.detailAvailable && context.columnIndex === 0;
  const hasRichTooltip = context.cellTooltipMode === "rich" && hasTooltipMessage(context.meta);
  const tooltipId = hasRichTooltip && context.activeTooltipCellKey === cellKey
    ? getCellTooltipId(cellKey)
    : undefined;
  const cellContext: YoupGridCellContext<TRow> = {
    row: context.row,
    column,
    value,
    editing: context.editing,
    focused: context.focused,
    editable,
    meta: context.meta,
    treeDepth: context.row.depth,
    hasChildren: context.row.hasChildren,
    expanded: context.row.expanded,
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
        cellTooltipMode: context.cellTooltipMode,
        applyCellValue: context.applyCellValue,
      });

  const treeContent = showTreePrefix && !context.editing
    ? renderTreeCellContent({
        row: context.row,
        content: cellContent,
        toggleExpanded: context.toggleTreeRowExpanded,
      })
    : cellContent;
  const renderedContent = showDetailPrefix && !context.editing
    ? renderDetailCellContent({
        expanded: context.detailExpanded,
        content: treeContent,
        toggleExpanded: context.toggleDetailRowExpanded,
      })
    : treeContent;
  const persistentImeEditor = (context.focused || context.editing) && editable && supportsImeInputProxy(column)
    ? renderPersistentImeEditor({
        cell: cellState,
        editing: context.editing,
        editingCell: context.editingCell,
        startEditing: context.startEditing,
        updateEditingDraft: context.updateEditingDraft,
        commitEditing: context.commitEditing,
        onKeyDown: context.onKeyDown,
      })
    : undefined;

  return createElement(
    "div",
    {
      key: column.id,
      className: getCellClassName(
        [
          "youp-grid__cell",
          `youp-grid__cell--align-${cellAlign}`,
          context.focused ? "youp-grid__cell--focused" : "",
          context.selected ? "youp-grid__cell--range-selected" : "",
          context.fillTargeted ? "youp-grid__cell--fill-target" : "",
          context.editing ? "youp-grid__cell--editing" : "",
          !editable ? "youp-grid__cell--disabled" : "",
          showTreePrefix ? "youp-grid__cell--tree" : "",
          showDetailPrefix ? "youp-grid__cell--detail-toggle-cell" : "",
          tooltipId ? "youp-grid__cell--tooltip-open" : "",
          context.meta ? `youp-grid__cell--status-${context.meta.status}` : "",
        ].filter(Boolean).join(" "),
        context.layout,
      ),
      role: "gridcell",
      tabIndex: context.focused && !context.editing ? 0 : -1,
      title: getCellTitle(context.meta, context.disabledReason, editable, context.cellTooltipMode),
      "aria-describedby": tooltipId,
      "aria-colindex": context.columnIndex + context.ariaColumnOffset + 1,
      "aria-readonly": !editable || undefined,
      "data-youp-row-index": context.rowIndex,
      "data-youp-column-index": context.columnIndex,
      "data-youp-column-id": column.id,
      style: getCellStyle(context.layout),
      onClick: (event: ReactMouseEvent<HTMLDivElement>) => {
        const cellElement = event.currentTarget;
        context.setFocusedCell(
          { rowIndex: context.rowIndex, columnIndex: context.columnIndex },
          event.shiftKey,
        );
        focusGridCellTarget(cellElement);
        requestAnimationFrame(() => focusImeInputProxy(cellElement));
      },
      onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => {
        if (isCellRightBorderDoubleClick(event)) {
          context.autoSizeColumn(event, column);
          return;
        }

        if (editable) {
          if (column.editor === "checkbox") {
            context.applyCellValue(cellState, !Boolean(value));
          } else {
            context.startEditing(createEditingCell(cellState, value));
          }
        }
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => context.onKeyDown(event, cellState),
      onCompositionStart: (event: ReactCompositionEvent<HTMLDivElement>) => {
        if (
          event.target === event.currentTarget &&
          !context.editing &&
          editable &&
          column.editor !== "checkbox"
        ) {
          context.startEditing(createEditingCell(cellState, ""));
        }
      },
      onCompositionUpdate: (event: ReactCompositionEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget && editable && column.editor !== "checkbox") {
          context.updateEditingDraft(event.data);
        }
      },
      onCompositionEnd: (event: ReactCompositionEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget && editable && column.editor !== "checkbox") {
          context.updateEditingDraft(event.data);
        }
      },
      onContextMenu: context.openContextMenu
        ? (event: ReactMouseEvent<HTMLDivElement>) => context.openContextMenu?.(event, cellState)
        : undefined,
      onMouseEnter: () => {
        if (hasRichTooltip) {
          context.openCellTooltip(cellKey);
        }
      },
      onMouseLeave: () => {
        if (hasRichTooltip) {
          context.closeCellTooltip(cellKey);
        }
      },
      onFocus: () => {
        if (hasRichTooltip) {
          context.openCellTooltip(cellKey);
        }
      },
      onBlur: (event: ReactFocusEvent<HTMLDivElement>) => {
        if (!hasRichTooltip) {
          return;
        }

        const nextTarget = event.relatedTarget;
        if (nextTarget && event.currentTarget.contains(nextTarget as Node)) {
          return;
        }

        context.closeCellTooltip(cellKey);
      },
    },
    createElement(
      Fragment,
      undefined,
      context.editing ? undefined : renderedContent,
      context.editing
        ? renderCellEditor({
            cell: cellState,
            editingCell: context.editingCell,
            updateEditingDraft: context.updateEditingDraft,
            commitEditing: context.commitEditing,
            onKeyDown: context.onKeyDown,
            cancelEditing: context.cancelEditing,
            renderEditor: context.renderEditor,
            imeEditor: persistentImeEditor,
          })
        : persistentImeEditor,
    ),
    renderCellStatus(context.meta, context.cellTooltipMode),
    renderCellTooltip(context.meta, tooltipId),
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

function getColumnAlign<TRow>(column: ResolvedColumnDef<TRow>): ColumnAlign {
  if (column.align) {
    return column.align;
  }

  if (column.editor === "number") {
    return "right";
  }

  if (column.editor === "checkbox") {
    return "center";
  }

  return "left";
}

function renderDefaultCellContent<TRow>(context: {
  cell: CellRenderState<TRow>;
  row: TRow;
  disabledReason?: ReactNode;
  cellTooltipMode: YoupGridCellTooltipMode;
  applyCellValue: (cell: CellRenderState<TRow>, value: unknown) => void;
}) {
  if (context.cell.column.editor === "checkbox") {
    return createElement("input", {
      className: "youp-grid__cell-checkbox",
      type: "checkbox",
      checked: Boolean(context.cell.value),
      disabled: !context.cell.editable,
      title: getCellTitle(
        context.cell.meta,
        context.disabledReason,
        context.cell.editable,
        context.cellTooltipMode,
      ),
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

  if (context.cell.column.editor === "tags") {
    const tags = getTagDisplayItems(context.cell.column, context.cell.value);

    if (tags.length > 0) {
      return renderTagList(tags);
    }
  }

  if (context.cell.column.editor === "select" || context.cell.column.editor === "combobox") {
    const option = findEditorOptionByValue(context.cell.column.options, context.cell.value);

    if (option?.color || option?.description) {
      return renderOptionBadge(option);
    }
  }

  const text = formatCellValue(context.cell.column, context.row, context.cell.value);
  const placeholder = context.cell.column.placeholder;
  const hasPlaceholder = text.length === 0 && Boolean(placeholder);

  return createElement(
    "span",
    {
      className: [
        "youp-grid__cell-text",
        hasPlaceholder ? "youp-grid__cell-placeholder" : "",
      ].filter(Boolean).join(" "),
    },
    hasPlaceholder ? placeholder : text,
  );
}

function renderOptionBadge(option: NormalizedEditorOption) {
  return createElement(
    "span",
    {
      className: [
        "youp-grid__option-badge",
        option.disabled ? "youp-grid__option-badge--disabled" : "",
      ].filter(Boolean).join(" "),
      title: option.description,
    },
    option.color
      ? createElement("span", {
          className: "youp-grid__option-color",
          style: { "--youp-grid-option-color": option.color } as CSSProperties,
          "aria-hidden": "true",
        })
      : undefined,
    createElement("span", { className: "youp-grid__option-label" }, option.label),
  );
}

function renderTagList(tags: readonly NormalizedEditorOption[]) {
  const visibleTags = tags.slice(0, MAX_VISIBLE_TAG_CHIPS);
  const hiddenCount = tags.length - visibleTags.length;
  const chips: ReactNode[] = visibleTags.map((tag, index) =>
    renderTagChip(tag, `${tag.inputValue}-${index}`),
  );

  if (hiddenCount > 0) {
    chips.push(
      createElement(
        "span",
        {
          key: "overflow",
          className: "youp-grid__tag youp-grid__tag--overflow",
          "aria-label": `${hiddenCount} more tags`,
        },
        `+${hiddenCount}`,
      ),
    );
  }

  return createElement(
    "span",
    {
      className: "youp-grid__tag-list",
      title: tags.map((tag) => tag.label).join(", "),
    },
    chips,
  );
}

function renderTagChip(tag: NormalizedEditorOption, key: string) {
  return createElement(
    "span",
    {
      key,
      className: [
        "youp-grid__tag",
        tag.disabled ? "youp-grid__tag--disabled" : "",
      ].filter(Boolean).join(" "),
      title: tag.description,
    },
    tag.color
      ? createElement("span", {
          className: "youp-grid__tag-color",
          style: { "--youp-grid-option-color": tag.color } as CSSProperties,
          "aria-hidden": "true",
        })
      : undefined,
    createElement("span", { className: "youp-grid__tag-label" }, tag.label),
  );
}

function renderTreeCellContent<TRow>(context: {
  row: RowNode<TRow>;
  content: ReactNode;
  toggleExpanded: (rowId: GridRowId) => void;
}) {
  const depth = Math.max(0, context.row.depth ?? 0);
  const toggle = context.row.hasChildren
    ? createElement(
        "button",
        {
          className: "youp-grid__tree-toggle",
          type: "button",
          "aria-label": context.row.expanded ? "Collapse row" : "Expand row",
          "aria-expanded": context.row.expanded,
          onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
            context.toggleExpanded(context.row.id);
          },
          onDoubleClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
            event.stopPropagation();
          },
          onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
            event.stopPropagation();
          },
        },
        createElement(
          "span",
          {
            className: [
              "youp-grid__tree-caret youp-grid__caret",
              context.row.expanded ? "youp-grid__caret--expanded" : "",
            ].filter(Boolean).join(" "),
            "aria-hidden": true,
          },
        ),
      )
    : createElement("span", { className: "youp-grid__tree-toggle-spacer", "aria-hidden": true });

  return createElement(
    "span",
    {
      className: "youp-grid__cell-tree-content",
      style: { paddingLeft: depth * 18 },
    },
    toggle,
    createElement("span", { className: "youp-grid__cell-tree-value" }, context.content),
  );
}

function renderDetailCellContent(context: {
  expanded: boolean;
  content: ReactNode;
  toggleExpanded: () => void;
}) {
  return createElement(
    "span",
    { className: "youp-grid__cell-detail-content" },
    createElement(
      "button",
      {
        className: "youp-grid__detail-toggle",
        type: "button",
        "aria-label": context.expanded ? "Collapse detail row" : "Expand detail row",
        "aria-expanded": context.expanded,
        onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          context.toggleExpanded();
        },
        onDoubleClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
        },
        onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => {
          event.stopPropagation();
        },
      },
      createElement(
        "span",
        {
          className: [
            "youp-grid__detail-caret youp-grid__caret",
            context.expanded ? "youp-grid__caret--expanded" : "",
          ].filter(Boolean).join(" "),
          "aria-hidden": true,
        },
      ),
    ),
    createElement("span", { className: "youp-grid__cell-detail-value" }, context.content),
  );
}

function renderCellEditor<TRow>(context: {
  cell: CellRenderState<TRow>;
  editingCell?: EditingCell;
  updateEditingDraft: (draftValue: string, options?: UpdateEditingDraftOptions) => void;
  commitEditing: (cell: EditingCell, reason?: YoupGridCellEditCommitReason) => void;
  cancelEditing: () => void;
  renderEditor?: (context: YoupGridCustomEditorContext<TRow>) => ReactNode;
  imeEditor?: ReactNode;
  onKeyDown: (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    cell: CellRenderState<TRow>,
  ) => void;
}) {
  if (context.renderEditor) {
    const draftValue = context.editingCell?.draftValue ?? "";
    const customEditor = context.renderEditor({
      row: context.cell.row.original,
      rowNode: context.cell.row,
      rowId: context.cell.row.id,
      rowIndex: context.cell.rowIndex,
      column: context.cell.column,
      columnId: context.cell.column.id,
      value: context.cell.value,
      draftValue,
      editable: context.cell.editable,
      setDraftValue: context.updateEditingDraft,
      commit: (nextDraftValue = draftValue, reason = "blur") => {
        context.commitEditing(createEditingCell(context.cell, nextDraftValue), reason);
      },
      cancel: context.cancelEditing,
    });

    if (customEditor !== undefined && customEditor !== null) {
      return customEditor;
    }
  }

  if (context.imeEditor !== undefined) {
    return context.imeEditor;
  }

  if (context.cell.column.editor === "select") {
    const options = normalizeEditorOptions(context.cell.column.options);

    return createElement(
      "select",
      {
        className: "youp-grid__cell-editor youp-grid__cell-editor--select",
        value: context.editingCell?.draftValue ?? "",
        autoFocus: true,
        disabled: !context.cell.editable,
        onMouseDown: stopEditorMouseEvent,
        onClick: stopEditorMouseEvent,
        onDoubleClick: stopEditorMouseEvent,
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
        {
          key: option.inputValue,
          value: option.inputValue,
          disabled: option.disabled,
          title: option.description,
        },
        option.label,
      )),
    );
  }

  if (context.cell.column.editor === "combobox") {
    const options = normalizeEditorOptions(context.cell.column.options);
    const listId = `youp-grid-combobox-${getCellKey(context.cell.row.id, context.cell.column.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;

    return createElement(
      Fragment,
      undefined,
      createElement("input", {
        className: "youp-grid__cell-editor youp-grid__cell-editor--combobox",
        type: "text",
        list: listId,
        value: context.editingCell?.draftValue ?? "",
        placeholder: context.cell.column.placeholder,
        autoFocus: true,
        disabled: !context.cell.editable,
        onMouseDown: stopEditorMouseEvent,
        onClick: stopEditorMouseEvent,
        onDoubleClick: stopEditorMouseEvent,
        onChange: (event: ReactChangeEvent<HTMLInputElement>) => {
          context.updateEditingDraft(event.currentTarget.value, {
            preserveInitialPrintableKeyDraft: shouldPreserveInitialPrintableKeyDraft(
              context.editingCell,
              event.nativeEvent,
            ),
          });
        },
        onCompositionStart: (event: ReactCompositionEvent<HTMLInputElement>) => {
          beginEditorComposition(event.currentTarget);
          clearInitialPrintableKeyDraftForComposition(context, event, "");
        },
        onCompositionEnd: (event: ReactCompositionEvent<HTMLInputElement>) => {
          endEditorComposition(event.currentTarget);
          const nextDraftValue = stripInitialPrintableKeyDraft(
            context.editingCell,
            event.currentTarget.value,
          );
          event.currentTarget.value = nextDraftValue;
          context.updateEditingDraft(nextDraftValue);
        },
        onBlur: (event: ReactFocusEvent<HTMLInputElement>) => {
          endEditorComposition(event.currentTarget);
          context.commitEditing(
            createEditingCell(context.cell, event.currentTarget.value),
            "blur",
          );
        },
        onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => {
          event.stopPropagation();
          if (isCompositionEditingKey(event) || isEditorCompositionActive(event.currentTarget, event.nativeEvent)) {
            return;
          }

          context.onKeyDown(event, context.cell);
        },
      }),
      createElement(
        "datalist",
        { id: listId },
        options
          .filter((option) => !option.disabled)
          .map((option) => createElement(
            "option",
            { key: option.inputValue, value: option.label },
            option.description,
          )),
      ),
    );
  }

  if (context.cell.column.editor === "tags") {
    return renderTagsEditor(context);
  }

  return createElement("input", {
    className: "youp-grid__cell-editor",
    type: getInputEditorType(context.cell.column.editor),
    value: context.editingCell?.draftValue ?? "",
    placeholder: context.cell.column.placeholder,
    autoFocus: true,
    disabled: !context.cell.editable,
    onMouseDown: stopEditorMouseEvent,
    onClick: stopEditorMouseEvent,
    onDoubleClick: stopEditorMouseEvent,
    onChange: (event: ReactChangeEvent<HTMLInputElement>) => {
      context.updateEditingDraft(event.currentTarget.value, {
        preserveInitialPrintableKeyDraft: shouldPreserveInitialPrintableKeyDraft(
          context.editingCell,
          event.nativeEvent,
        ),
      });
    },
    onCompositionStart: (event: ReactCompositionEvent<HTMLInputElement>) => {
      beginEditorComposition(event.currentTarget);
      clearInitialPrintableKeyDraftForComposition(context, event, "");
    },
    onCompositionEnd: (event: ReactCompositionEvent<HTMLInputElement>) => {
      endEditorComposition(event.currentTarget);
      const nextDraftValue = stripInitialPrintableKeyDraft(
        context.editingCell,
        event.currentTarget.value,
      );
      event.currentTarget.value = nextDraftValue;
      context.updateEditingDraft(nextDraftValue);
    },
    onBlur: (event: ReactFocusEvent<HTMLInputElement>) => {
      endEditorComposition(event.currentTarget);
      context.commitEditing(
        createEditingCell(context.cell, event.currentTarget.value),
        "blur",
      );
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (isCompositionEditingKey(event) || isEditorCompositionActive(event.currentTarget, event.nativeEvent)) {
        return;
      }

      context.onKeyDown(event, context.cell);
    },
  });
}

function supportsImeInputProxy<TRow>(column: ResolvedColumnDef<TRow>): boolean {
  return column.editor === undefined || column.editor === "text" || column.editor === "combobox";
}

function renderPersistentImeEditor<TRow>(context: {
  cell: CellRenderState<TRow>;
  editing: boolean;
  editingCell?: EditingCell;
  startEditing: (cell: EditingCell) => void;
  updateEditingDraft: (draftValue: string, options?: UpdateEditingDraftOptions) => void;
  commitEditing: (cell: EditingCell, reason?: YoupGridCellEditCommitReason) => void;
  onKeyDown: (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    cell: CellRenderState<TRow>,
  ) => void;
}) {
  const combobox = context.cell.column.editor === "combobox";
  const listId = combobox
    ? `youp-grid-combobox-${getCellKey(context.cell.row.id, context.cell.column.id).replace(/[^a-zA-Z0-9_-]/g, "_")}`
    : undefined;
  const input = createElement("input", {
    key: "__ime-input",
    className: context.editing
      ? [
          "youp-grid__cell-editor",
          combobox ? "youp-grid__cell-editor--combobox" : "",
        ].filter(Boolean).join(" ")
      : "youp-grid__ime-input-proxy",
    type: "text",
    list: context.editing ? listId : undefined,
    value: context.editing ? context.editingCell?.draftValue ?? "" : "",
    placeholder: context.editing ? context.cell.column.placeholder : undefined,
    tabIndex: -1,
    autoFocus: context.editing,
    autoComplete: "off",
    spellCheck: false,
    disabled: !context.cell.editable,
    "aria-label": `Edit ${context.cell.column.headerName}`,
    "data-youp-ime-input-proxy": "",
    onMouseDown: context.editing ? stopEditorMouseEvent : undefined,
    onClick: context.editing ? stopEditorMouseEvent : undefined,
    onDoubleClick: context.editing ? stopEditorMouseEvent : undefined,
    onChange: (event: ReactChangeEvent<HTMLInputElement>) => {
      if (!context.editing) {
        context.startEditing(createEditingCell(context.cell, event.currentTarget.value));
        return;
      }

      context.updateEditingDraft(event.currentTarget.value, {
        preserveInitialPrintableKeyDraft: shouldPreserveInitialPrintableKeyDraft(
          context.editingCell,
          event.nativeEvent,
        ),
      });
    },
    onCompositionStart: (event: ReactCompositionEvent<HTMLInputElement>) => {
      beginEditorComposition(event.currentTarget);
      if (context.editing) {
        clearInitialPrintableKeyDraftForComposition(context, event, "");
        return;
      }

      event.currentTarget.value = "";
      event.currentTarget.classList.add("youp-grid__ime-input-proxy--composing");
      context.startEditing(createEditingCell(context.cell, ""));
    },
    onCompositionEnd: (event: ReactCompositionEvent<HTMLInputElement>) => {
      endEditorComposition(event.currentTarget);
      const nextDraftValue = stripInitialPrintableKeyDraft(
        context.editingCell,
        event.currentTarget.value || event.data,
      );
      event.currentTarget.value = nextDraftValue;
      if (context.editing) {
        context.updateEditingDraft(nextDraftValue);
      } else if (nextDraftValue.length > 0) {
        context.startEditing(createEditingCell(context.cell, nextDraftValue));
      }
    },
    onInput: (event: ReactFormEvent<HTMLInputElement>) => {
      if (
        !context.editing &&
        !isEditorCompositionActive(event.currentTarget, event.nativeEvent) &&
        event.currentTarget.value.length > 0
      ) {
        context.startEditing(createEditingCell(context.cell, event.currentTarget.value));
      }
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (context.editing) {
        event.stopPropagation();
        if (isCompositionEditingKey(event) || isEditorCompositionActive(event.currentTarget, event.nativeEvent)) {
          return;
        }

        context.onKeyDown(event, context.cell);
        return;
      }

      if (
        isCompositionEditingKey(event) ||
        isEditorCompositionActive(event.currentTarget, event.nativeEvent) ||
        (event.key.length === 1 && !isAsciiPrintableKey(event.key))
      ) {
        event.stopPropagation();
      }
    },
    onBlur: (event: ReactFocusEvent<HTMLInputElement>) => {
      endEditorComposition(event.currentTarget);
      if (context.editing) {
        context.commitEditing(
          createEditingCell(context.cell, event.currentTarget.value),
          "blur",
        );
      } else {
        event.currentTarget.classList.remove("youp-grid__ime-input-proxy--composing");
        event.currentTarget.value = "";
      }
    },
  });

  if (!combobox || !listId) {
    return input;
  }

  const options = normalizeEditorOptions(context.cell.column.options);
  return createElement(
    Fragment,
    { key: "__ime-editor" },
    input,
    createElement(
      "datalist",
      { id: listId, key: "__ime-options" },
      options
        .filter((option) => !option.disabled)
        .map((option) => createElement(
          "option",
          { key: option.inputValue, value: option.label },
          option.description,
        )),
    ),
  );
}

function getInputEditorType(editor: ResolvedColumnDef<unknown>["editor"]): string {
  if (editor === "number" || editor === "date") {
    return editor;
  }

  if (editor === "datetime") {
    return "datetime-local";
  }

  return "text";
}

function renderTagsEditor<TRow>(context: {
  cell: CellRenderState<TRow>;
  editingCell?: EditingCell;
  updateEditingDraft: (draftValue: string, options?: UpdateEditingDraftOptions) => void;
  commitEditing: (cell: EditingCell, reason?: YoupGridCellEditCommitReason) => void;
  onKeyDown: (
    event: ReactKeyboardEvent<HTMLInputElement | HTMLSelectElement>,
    cell: CellRenderState<TRow>,
  ) => void;
}) {
  const draft = context.editingCell?.draftValue ?? "";
  const parts = parseTagEditorDraft(draft);
  const tags = parts.tags.map((tag) => getTagDisplayItem(context.cell.column, tag));
  const commitDraft = (draftValue: string, reason: YoupGridCellEditCommitReason) => {
    context.commitEditing(createEditingCell(context.cell, draftValue), reason);
  };

  return createElement(
    "div",
    {
      className: "youp-grid__cell-editor youp-grid__cell-editor--tags",
      onMouseDown: stopEditorMouseEvent,
      onClick: (event: ReactMouseEvent<HTMLDivElement>) => event.stopPropagation(),
      onDoubleClick: stopEditorMouseEvent,
    },
    tags.map((tag, index) =>
      createElement(
        "span",
        {
          key: `${tag.inputValue}-${index}`,
          className: [
            "youp-grid__tag",
            tag.disabled ? "youp-grid__tag--disabled" : "",
          ].filter(Boolean).join(" "),
          title: tag.description,
        },
        tag.color
          ? createElement("span", {
              className: "youp-grid__tag-color",
              style: { "--youp-grid-option-color": tag.color } as CSSProperties,
              "aria-hidden": "true",
            })
          : undefined,
        createElement("span", { className: "youp-grid__tag-label" }, tag.label),
        createElement(
          "button",
          {
            type: "button",
            className: "youp-grid__tag-remove",
            "aria-label": `Remove ${tag.label}`,
            disabled: !context.cell.editable,
            onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => event.preventDefault(),
            onClick: (event: ReactMouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              const nextTags = parts.tags.filter((_, tagIndex) => tagIndex !== index);
              context.updateEditingDraft(serializeTagEditorDraft(nextTags, parts.input));
            },
          },
          "×",
        ),
      ),
    ),
    createElement("input", {
      className: "youp-grid__cell-editor youp-grid__tag-input",
      value: parts.input,
      placeholder: tags.length === 0 ? context.cell.column.placeholder : undefined,
      autoFocus: true,
      disabled: !context.cell.editable,
      "data-youp-editor-draft": serializeTagEditorDraft(parts.tags, parts.input),
      onMouseDown: stopEditorMouseEvent,
      onClick: stopEditorMouseEvent,
      onDoubleClick: stopEditorMouseEvent,
      onChange: (event: ReactChangeEvent<HTMLInputElement>) => {
        context.updateEditingDraft(serializeTagEditorDraft(parts.tags, event.currentTarget.value), {
          preserveInitialPrintableKeyDraft: shouldPreserveInitialPrintableKeyDraft(
            context.editingCell,
            event.nativeEvent,
          ),
        });
      },
      onCompositionStart: (event: ReactCompositionEvent<HTMLInputElement>) => {
        beginEditorComposition(event.currentTarget);
        clearInitialPrintableKeyDraftForComposition(
          context,
          event,
          serializeTagEditorDraft(parts.tags, ""),
        );
      },
      onCompositionEnd: (event: ReactCompositionEvent<HTMLInputElement>) => {
        endEditorComposition(event.currentTarget);
        const nextInputValue = stripInitialPrintableKeyDraft(
          context.editingCell,
          event.currentTarget.value,
        );
        event.currentTarget.value = nextInputValue;
        context.updateEditingDraft(serializeTagEditorDraft(parts.tags, nextInputValue));
      },
      onBlur: (event: ReactFocusEvent<HTMLInputElement>) => {
        endEditorComposition(event.currentTarget);
        commitDraft(serializeTagEditorDraftWithInput(parts.tags, event.currentTarget.value), "blur");
      },
      onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => {
        event.stopPropagation();
        if (isCompositionEditingKey(event) || isEditorCompositionActive(event.currentTarget, event.nativeEvent)) {
          return;
        }

        const inputValue = event.currentTarget.value;

        if ((event.key === "Enter" || event.key === ",") && inputValue.trim().length > 0) {
          event.preventDefault();
          context.updateEditingDraft(serializeTagEditorDraft([...parts.tags, inputValue], ""));
          return;
        }

        if (event.key === "Backspace" && inputValue.length === 0 && parts.tags.length > 0) {
          event.preventDefault();
          context.updateEditingDraft(serializeTagEditorDraft(parts.tags.slice(0, -1), ""));
          return;
        }

        context.onKeyDown(event, context.cell);
      },
    }),
  );
}

function stopEditorMouseEvent(event: ReactMouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function clearInitialPrintableKeyDraftForComposition(
  context: {
    editingCell?: EditingCell;
    updateEditingDraft: (draftValue: string, options?: UpdateEditingDraftOptions) => void;
  },
  event: ReactCompositionEvent<HTMLInputElement>,
  nextDraftValue: string,
) {
  const initialDraft = context.editingCell?.initialPrintableKeyDraft;
  if (
    !context.editingCell?.startedWithPrintableKey ||
    initialDraft === undefined ||
    event.currentTarget.value !== initialDraft
  ) {
    return;
  }

  event.currentTarget.value = "";
  context.updateEditingDraft(nextDraftValue);
}

function stripInitialPrintableKeyDraft(editingCell: EditingCell | undefined, value: string): string {
  const initialDraft = editingCell?.initialPrintableKeyDraft;
  if (!editingCell?.startedWithPrintableKey || initialDraft === undefined || !value.startsWith(initialDraft)) {
    return value;
  }

  return value.slice(initialDraft.length);
}

function beginEditorComposition(input: HTMLInputElement): void {
  composingEditorInputs.add(input);
}

function endEditorComposition(input: HTMLInputElement): void {
  composingEditorInputs.delete(input);
}

function shouldPreserveInitialPrintableKeyDraft(
  editingCell: EditingCell | undefined,
  event: Event,
): boolean {
  return Boolean(
    editingCell?.startedWithPrintableKey &&
    editingCell.initialPrintableKeyDraft !== undefined &&
    isNativeCompositionEvent(event),
  );
}

function isEditorCompositionActive(input: HTMLInputElement, event: Event): boolean {
  return composingEditorInputs.has(input) || isNativeCompositionEvent(event);
}

function isNativeCompositionEvent(event: Event): boolean {
  return Boolean((event as InputEvent).isComposing);
}

function renderCellStatus(meta: YoupGridCellMeta | undefined, tooltipMode: YoupGridCellTooltipMode) {
  if (!meta) {
    return undefined;
  }

  return createElement("span", {
    className: `youp-grid__cell-status youp-grid__cell-status--${meta.status}`,
    title: tooltipMode === "native" && typeof meta.message === "string" ? meta.message : undefined,
    "aria-hidden": true,
  });
}

function renderCellTooltip(meta: YoupGridCellMeta | undefined, tooltipId: string | undefined) {
  if (!tooltipId || !meta?.message) {
    return undefined;
  }

  return createElement(
    "span",
    {
      id: tooltipId,
      className: "youp-grid__cell-tooltip",
      role: "tooltip",
    },
    meta.message,
  );
}

type GridButtonIconName = "columns" | "csv" | "excel" | "fit" | "import" | "next" | "previous";

function renderGridButtonContent(icon: GridButtonIconName, label: string) {
  return createElement(
    Fragment,
    undefined,
    renderGridButtonIcon(icon),
    createElement("span", { className: "youp-grid__button-label" }, label),
  );
}

function renderGridButtonIcon(icon: GridButtonIconName) {
  const iconProps = {
    className: "youp-grid__button-icon",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 2,
    "aria-hidden": true,
    focusable: "false",
  };

  if (icon === "columns") {
    return createElement(
      "svg",
      iconProps,
      createElement("path", { d: "M4 5h16" }),
      createElement("path", { d: "M4 12h16" }),
      createElement("path", { d: "M4 19h16" }),
      createElement("path", { d: "M8 5v14" }),
      createElement("path", { d: "M16 5v14" }),
    );
  }

  if (icon === "csv") {
    return createElement(
      "svg",
      iconProps,
      createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }),
      createElement("path", { d: "M14 2v6h6" }),
      createElement("path", { d: "M8 15h8" }),
      createElement("path", { d: "m13 12 3 3-3 3" }),
    );
  }

  if (icon === "excel") {
    return createElement(
      "svg",
      iconProps,
      createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }),
      createElement("path", { d: "M14 2v6h6" }),
      createElement("path", { d: "M8 13h8" }),
      createElement("path", { d: "M8 17h8" }),
      createElement("path", { d: "M12 13v4" }),
    );
  }

  if (icon === "fit") {
    return createElement(
      "svg",
      iconProps,
      createElement("path", { d: "M4 8V4h4" }),
      createElement("path", { d: "M20 8V4h-4" }),
      createElement("path", { d: "M4 16v4h4" }),
      createElement("path", { d: "M20 16v4h-4" }),
      createElement("path", { d: "M9 12h6" }),
    );
  }

  if (icon === "import") {
    return createElement(
      "svg",
      iconProps,
      createElement("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }),
      createElement("path", { d: "M14 2v6h6" }),
      createElement("path", { d: "M12 18v-6" }),
      createElement("path", { d: "m9 15 3 3 3-3" }),
    );
  }

  if (icon === "previous") {
    return createElement("svg", iconProps, createElement("path", { d: "m15 18-6-6 6-6" }));
  }

  return createElement("svg", iconProps, createElement("path", { d: "m9 18 6-6-6-6" }));
}

function renderColumnToolbar<TRow>(context: {
  showColumnChooser: boolean;
  showCsvExport: boolean;
  showExcelExport: boolean;
  showImport: boolean;
  importDisabled: boolean;
  showDensityControl: boolean;
  showSizeColumnsToFit: boolean;
  density: YoupGridDensity;
  open: boolean;
  columns: readonly ResolvedColumnDef<TRow>[];
  search: string;
  setSearch: (search: string) => void;
  presets?: readonly { id: string; label: string; columnIds: readonly string[] }[];
  applyPreset: (preset: { id: string; label: string; columnIds: readonly string[] }) => void;
  toggleOpen: () => void;
  setDensity: (density: YoupGridDensity) => void;
  setColumnHidden: (columnId: string, hidden: boolean) => void;
  setColumnPinned: (columnId: string, pinned: ColumnPin | undefined) => void;
  canMoveColumn: (columnId: string, direction: ColumnMoveDirection) => boolean;
  moveColumn: (columnId: string, direction: ColumnMoveDirection) => void;
  canResetColumnOrder: boolean;
  resetColumnOrder: () => void;
  sizeColumnsToFit: () => void;
  exportCsv: () => void;
  exportExcel: () => void;
  openImportFilePicker: () => void;
}) {
  if (
    !context.showColumnChooser &&
    !context.showCsvExport &&
    !context.showExcelExport &&
    !context.showImport &&
    !context.showDensityControl &&
    !context.showSizeColumnsToFit
  ) {
    return undefined;
  }

  const normalizedSearch = context.search.trim().toLocaleLowerCase();
  const filteredColumns = normalizedSearch
    ? context.columns.filter((column) => {
        return (
          column.headerName.toLocaleLowerCase().includes(normalizedSearch) ||
          column.id.toLocaleLowerCase().includes(normalizedSearch)
        );
      })
    : context.columns;

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
          renderGridButtonContent("columns", "Columns"),
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
          renderGridButtonContent("csv", "Export CSV"),
        )
      : undefined,
    context.showExcelExport
      ? createElement(
          "button",
          {
            className: "youp-grid__toolbar-button",
            type: "button",
            onClick: context.exportExcel,
          },
          renderGridButtonContent("excel", "Export Excel"),
        )
      : undefined,
    context.showImport
      ? createElement(
          "button",
          {
            className: "youp-grid__toolbar-button",
            type: "button",
            disabled: context.importDisabled,
            onClick: context.openImportFilePicker,
          },
          renderGridButtonContent("import", "Import"),
        )
      : undefined,
    context.showSizeColumnsToFit
      ? createElement(
          "button",
          {
            className: "youp-grid__toolbar-button",
            type: "button",
            onClick: context.sizeColumnsToFit,
          },
          renderGridButtonContent("fit", "Fit columns"),
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
          createElement(
            "button",
            {
              className: "youp-grid__column-panel-button",
              type: "button",
              disabled: !context.canResetColumnOrder,
              onClick: context.resetColumnOrder,
            },
            "Reset order",
          ),
          context.presets && context.presets.length > 0
            ? createElement(
                "div",
                { className: "youp-grid__column-presets", role: "group", "aria-label": "Column presets" },
                context.presets.map((preset) =>
                  createElement(
                    "button",
                    {
                      key: preset.id,
                      className: "youp-grid__column-panel-button",
                      type: "button",
                      onClick: () => context.applyPreset(preset),
                    },
                    preset.label,
                  ),
                ),
              )
            : undefined,
          createElement("input", {
            className: "youp-grid__column-search",
            value: context.search,
            placeholder: "Search columns",
            "aria-label": "Search columns",
            onChange: (event: ReactChangeEvent<HTMLInputElement>) => context.setSearch(event.currentTarget.value),
          }),
          filteredColumns.map((column) => {
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
              createElement(
                "div",
                { className: "youp-grid__order-controls", role: "group", "aria-label": `Order ${column.headerName}` },
                renderOrderButton(column, "start", "Start", context.canMoveColumn, context.moveColumn),
                renderOrderButton(column, "left", "Left", context.canMoveColumn, context.moveColumn),
                renderOrderButton(column, "right", "Right", context.canMoveColumn, context.moveColumn),
                renderOrderButton(column, "end", "End", context.canMoveColumn, context.moveColumn),
              ),
            );
          }),
        )
      : undefined,
  );
}

function renderOrderButton<TRow>(
  column: ResolvedColumnDef<TRow>,
  direction: ColumnMoveDirection,
  label: string,
  canMoveColumn: (columnId: string, direction: ColumnMoveDirection) => boolean,
  moveColumn: (columnId: string, direction: ColumnMoveDirection) => void,
) {
  return createElement(
    "button",
    {
      className: "youp-grid__pin-button",
      type: "button",
      disabled: !canMoveColumn(column.id, direction),
      onClick: () => moveColumn(column.id, direction),
    },
    label,
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

type ColumnDropPosition = "before" | "after";

type ColumnMoveDirection = "left" | "right" | "start" | "end";

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

function canReorderColumn<TRow>(
  columns: readonly ResolvedColumnDef<TRow>[],
  sourceColumnId: string | undefined,
  targetColumnId: string,
): sourceColumnId is string {
  if (!sourceColumnId || sourceColumnId === targetColumnId) {
    return false;
  }

  const sourceColumn = columns.find((column) => column.id === sourceColumnId);
  const targetColumn = columns.find((column) => column.id === targetColumnId);

  return Boolean(sourceColumn && targetColumn && sourceColumn.pinned === targetColumn.pinned);
}

function getReorderedColumnIds<TRow>(context: {
  columns: readonly ResolvedColumnDef<TRow>[];
  sourceColumnId: string;
  targetColumnId: string;
  position: ColumnDropPosition;
}): string[] | undefined {
  if (!canReorderColumn(context.columns, context.sourceColumnId, context.targetColumnId)) {
    return undefined;
  }

  const columnIds = context.columns.map((column) => column.id);
  const sourceIndex = columnIds.indexOf(context.sourceColumnId);
  const targetIndex = columnIds.indexOf(context.targetColumnId);

  if (sourceIndex < 0 || targetIndex < 0) {
    return undefined;
  }

  const nextColumnIds = moveItem(columnIds, sourceIndex, targetIndex, context.position);

  return nextColumnIds.every((columnId, index) => columnId === columnIds[index]) ? undefined : nextColumnIds;
}

function getColumnMoveTarget<TRow>(
  columns: readonly ResolvedColumnDef<TRow>[],
  columnId: string,
  direction: ColumnMoveDirection,
): { columnId: string; position: ColumnDropPosition } | undefined {
  const sourceColumn = columns.find((column) => column.id === columnId);

  if (!sourceColumn) {
    return undefined;
  }

  const groupColumns = columns.filter((column) => column.pinned === sourceColumn.pinned);
  const groupIndex = groupColumns.findIndex((column) => column.id === columnId);

  if (groupIndex < 0) {
    return undefined;
  }

  if ((direction === "left" || direction === "start") && groupIndex === 0) {
    return undefined;
  }

  if ((direction === "right" || direction === "end") && groupIndex === groupColumns.length - 1) {
    return undefined;
  }

  if (direction === "left") {
    return { columnId: groupColumns[groupIndex - 1].id, position: "before" };
  }

  if (direction === "right") {
    return { columnId: groupColumns[groupIndex + 1].id, position: "after" };
  }

  if (direction === "start") {
    return { columnId: groupColumns[0].id, position: "before" };
  }

  return { columnId: groupColumns[groupColumns.length - 1].id, position: "after" };
}

function getColumnDefIds<TRow>(columns: readonly ColumnDef<TRow>[]): string[] {
  return columns.map((column) => {
    if (column.id) {
      return column.id;
    }

    if (column.field) {
      return String(column.field);
    }

    throw new Error("Column requires either `id` or `field`.");
  });
}

function areColumnIdsEqual(
  leftColumnIds: readonly string[],
  rightColumnIds: readonly string[],
): boolean {
  return (
    leftColumnIds.length === rightColumnIds.length &&
    leftColumnIds.every((columnId, index) => columnId === rightColumnIds[index])
  );
}

function moveItem<TItem>(
  items: readonly TItem[],
  sourceIndex: number,
  targetIndex: number,
  position: ColumnDropPosition,
): TItem[] {
  const nextItems = [...items];
  const [item] = nextItems.splice(sourceIndex, 1);
  const insertIndex = position === "before"
    ? sourceIndex < targetIndex ? targetIndex - 1 : targetIndex
    : sourceIndex < targetIndex ? targetIndex : targetIndex + 1;

  nextItems.splice(insertIndex, 0, item);

  return nextItems;
}

function getColumnDropPosition(event: ReactDragEvent<HTMLElement>): ColumnDropPosition {
  const rect = event.currentTarget.getBoundingClientRect();

  return event.clientX > rect.left + rect.width / 2 ? "after" : "before";
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

function getCellStyle<TRow>(
  layout: ColumnLayout<TRow>,
  options: { rightPinnedOffset?: number } = {},
): CSSProperties {
  const width = getColumnWidth(layout.column);
  const style: CSSProperties = {
    width,
    flex: `0 0 ${width}px`,
  };

  if (layout.pinned === "left") {
    style.left = layout.stickyOffset ?? 0;
  }

  if (layout.pinned === "right") {
    style.right = (layout.stickyOffset ?? 0) + (options.rightPinnedOffset ?? 0);
  }

  return style;
}

function getHeaderGroupStyle<TRow>(
  layout: HeaderGroupLayout<TRow>,
  options: { rightPinnedOffset?: number } = {},
): CSSProperties {
  const style: CSSProperties = {
    width: layout.width,
    flex: `0 0 ${layout.width}px`,
  };

  if (layout.pinned === "left") {
    style.left = layout.stickyOffset ?? 0;
  }

  if (layout.pinned === "right") {
    style.right = (layout.stickyOffset ?? 0) + (options.rightPinnedOffset ?? 0);
  }

  return style;
}

function getRowNumberCellStyle(): CSSProperties {
  return {
    left: 0,
    width: ROW_NUMBER_COLUMN_WIDTH,
    flex: `0 0 ${ROW_NUMBER_COLUMN_WIDTH}px`,
  };
}

function getSelectionCellStyle(leftOffset = 0): CSSProperties {
  return {
    left: leftOffset,
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
      renderGridButtonContent("previous", "Previous"),
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
      renderGridButtonContent("next", "Next"),
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
      renderGridButtonContent("previous", "Previous"),
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
      renderGridButtonContent("next", "Next"),
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

function autoSizeColumnToFit<TRow>(context: {
  event: ReactMouseEvent<HTMLElement>;
  column: ResolvedColumnDef<TRow>;
  rows: readonly RowNode<TRow>[];
  resizeColumn: (width: number) => void;
}) {
  context.event.preventDefault();
  context.event.stopPropagation();

  context.resizeColumn(getAutoSizeColumnWidth({
    anchor: context.event.currentTarget,
    column: context.column,
    rows: context.rows,
  }));
}

function getAutoSizeColumnWidth<TRow>(context: {
  anchor: HTMLElement;
  column: ResolvedColumnDef<TRow>;
  rows: readonly RowNode<TRow>[];
}): number {
  const metrics = getAutoSizeMetrics(context.anchor, context.column.id);
  const minWidth = context.column.minWidth ?? 64;
  const maxWidth = context.column.maxWidth ?? Number.MAX_SAFE_INTEGER;
  let width = measureAutoSizeText(context.column.headerName, metrics.headerFont) +
    metrics.headerHorizontalPadding +
    metrics.headerControlWidth +
    AUTOSIZE_CELL_EXTRA_WIDTH;

  for (const row of context.rows) {
    const text = getAutoSizeCellText(context.column, row.original);
    width = Math.max(
      width,
      measureAutoSizeText(text, metrics.cellFont) + metrics.cellHorizontalPadding + AUTOSIZE_CELL_EXTRA_WIDTH,
    );
  }

  return Math.ceil(clamp(width, minWidth, maxWidth));
}

function getAutoSizeMetrics(anchor: HTMLElement, columnId: string): {
  headerFont: string;
  cellFont: string;
  headerHorizontalPadding: number;
  cellHorizontalPadding: number;
  headerControlWidth: number;
} {
  const anchorCell = anchor.closest<HTMLElement>(".youp-grid__cell");
  const root = anchor.closest<HTMLElement>(".youp-grid");
  const headerCell = anchorCell?.getAttribute("role") === "columnheader"
    ? anchorCell
    : findColumnElement(root, "columnheader", columnId);
  const bodyCell = anchorCell?.getAttribute("role") === "gridcell"
    ? anchorCell
    : findColumnElement(root, "gridcell", columnId);
  const headerCellStyle = headerCell ? window.getComputedStyle(headerCell) : undefined;
  const bodyCellStyle = bodyCell ? window.getComputedStyle(bodyCell) : headerCellStyle;
  const headerMain = headerCell?.querySelector<HTMLElement>(".youp-grid__header-main");
  const headerMainStyle = headerMain ? window.getComputedStyle(headerMain) : undefined;
  const menuButton = headerCell?.querySelector<HTMLElement>(".youp-grid__column-menu-button");
  const headerHorizontalPadding = headerCellStyle
    ? getPixelValue(headerCellStyle.paddingLeft) + getPixelValue(headerCellStyle.paddingRight)
    : 24;
  const cellHorizontalPadding = bodyCellStyle
    ? getPixelValue(bodyCellStyle.paddingLeft) + getPixelValue(bodyCellStyle.paddingRight)
    : headerHorizontalPadding;
  const headerControlWidth = menuButton
    ? menuButton.offsetWidth + getPixelValue(headerMainStyle?.columnGap ?? headerMainStyle?.gap ?? "0")
    : 0;

  return {
    headerFont: headerCellStyle ? getFontValue(headerCellStyle) : "13px sans-serif",
    cellFont: bodyCellStyle ? getFontValue(bodyCellStyle) : "13px sans-serif",
    headerHorizontalPadding,
    cellHorizontalPadding,
    headerControlWidth,
  };
}

function findColumnElement(
  root: HTMLElement | null,
  role: "columnheader" | "gridcell",
  columnId: string,
): HTMLElement | undefined {
  if (!root) {
    return undefined;
  }

  return Array.from(root.querySelectorAll<HTMLElement>(`[role='${role}'][data-youp-column-id]`))
    .find((element) => element.dataset.youpColumnId === columnId);
}

function isCellRightBorderDoubleClick(event: ReactMouseEvent<HTMLElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();

  return Math.abs(rect.right - event.clientX) <= AUTOSIZE_CELL_BORDER_THRESHOLD;
}

function getAutoSizeCellText<TRow>(column: ResolvedColumnDef<TRow>, row: TRow): string {
  const text = formatCellValue(column, row, column.accessor(row));

  return text.length === 0 && column.placeholder ? column.placeholder : text;
}

function measureAutoSizeText(text: string, font: string): number {
  if (typeof document === "undefined") {
    return text.length * 8;
  }

  autosizeMeasureCanvas ??= document.createElement("canvas");

  const context = autosizeMeasureCanvas.getContext("2d");

  if (!context) {
    return text.length * 8;
  }

  context.font = font;

  return context.measureText(text).width;
}

function getFontValue(style: CSSStyleDeclaration): string {
  return style.font || [
    style.fontStyle,
    style.fontVariant,
    style.fontWeight,
    `${style.fontSize}/${style.lineHeight}`,
    style.fontFamily,
  ].join(" ");
}

function getPixelValue(value: string): number {
  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function getClampedContextMenuPlacement(context: {
  anchorX: number;
  anchorY: number;
  menuWidth: number;
  menuHeight: number;
}): ContextMenuPlacement {
  const viewportWidth = typeof window === "undefined" ? context.anchorX + context.menuWidth : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? context.anchorY + context.menuHeight : window.innerHeight;
  const padding = CONTEXT_MENU_VIEWPORT_PADDING;
  const menuWidth = Math.max(1, context.menuWidth);
  const menuHeight = Math.max(1, context.menuHeight);
  const maxX = Math.max(padding, viewportWidth - menuWidth - padding);
  const maxY = Math.max(padding, viewportHeight - menuHeight - padding);
  const preferredX = context.anchorX + menuWidth + padding > viewportWidth
    ? context.anchorX - menuWidth
    : context.anchorX;
  const preferredY = context.anchorY + menuHeight + padding > viewportHeight
    ? context.anchorY - menuHeight
    : context.anchorY;

  return {
    x: Math.round(Math.min(Math.max(preferredX, padding), maxX)),
    y: Math.round(Math.min(Math.max(preferredY, padding), maxY)),
  };
}

type ContextMenuPlacement = {
  x: number;
  y: number;
};

type FocusedCell = {
  rowIndex: number;
  columnIndex: number;
};

type CellSelectionDragState = {
  anchor: FocusedCell;
  focus: FocusedCell;
  moved: boolean;
};

type CellRangeMouseTarget = {
  element: HTMLElement;
  cell: FocusedCell;
};

type CellContextMenuState = FocusedCell & {
  clientX: number;
  clientY: number;
  anchor: HTMLElement;
  placement?: ContextMenuPlacement;
};

type RowClipboardEntry<TRow> = {
  row: TRow;
  rowId: GridRowId;
  rowIndex: number;
  visibleRowIndex: number;
};

type EditingCell = FocusedCell & {
  rowId: GridRowId;
  columnId: string;
  draftValue: string;
  startedWithPrintableKey?: boolean;
  initialPrintableKeyDraft?: string;
};
type UpdateEditingDraftOptions = {
  preserveInitialPrintableKeyDraft?: boolean;
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

type PendingClipboardRowInsert<TRow> = {
  row: TRow;
  rowNode: RowNode<TRow>;
  rowIndex: number;
  visibleRowIndex: number;
  anchorRow: TRow;
  anchorRowId: GridRowId;
  anchorRowIndex: number;
};

function handleCellKeyDown<TRow>(context: {
  event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>;
  cell: CellRenderState<TRow>;
  navigationCell?: FocusedCell;
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

  const navigationCell = context.navigationCell ?? {
    rowIndex: context.cell.rowIndex,
    columnIndex: context.cell.columnIndex,
  };
  const editingCell = context.event.currentTarget.classList.contains("youp-grid__cell-editor")
    ? createEditingCell(
        context.cell,
        (context.event.currentTarget as HTMLInputElement | HTMLSelectElement).dataset.youpEditorDraft ??
          (context.event.currentTarget as HTMLInputElement | HTMLSelectElement).value,
      )
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
      context.setFocusedCell(navigationCell, true);
    } else {
      context.toggleSelected();
    }
    return;
  }

  if (isTextEditingKey(context.event)) {
    if (context.cell.editable && context.cell.column.editor !== "checkbox") {
      if (canUseKeyAsInitialDraft(context.event)) {
        context.event.preventDefault();
        context.startEditing(
          createEditingCell(context.cell, context.event.key, { startedWithPrintableKey: true }),
        );
      } else {
        context.startEditing(createEditingCell(context.cell, ""));
      }
    }
    return;
  }

  const nextCell = getNextNavigationCell({
    event: context.event,
    cell: navigationCell,
    rowCount: context.rowCount,
    columnCount: context.columnCount,
  });

  if (!nextCell) {
    return;
  }

  context.event.preventDefault();
  moveFocusedCell({
    ...context,
    nextCell,
    extendSelection: context.event.shiftKey,
    selectionAnchor: navigationCell,
  });
}

function getNextNavigationCell(context: {
  event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>;
  cell: FocusedCell;
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

function getNextTabCell(
  cell: FocusedCell,
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

  if (cellElement) {
    focusGridCellTarget(cellElement);
  }

  return cellElement ?? undefined;
}

function focusGridCellTarget(cellElement: HTMLElement): void {
  const inputProxy = cellElement.querySelector<HTMLInputElement>("[data-youp-ime-input-proxy]");
  (inputProxy ?? cellElement).focus({ preventScroll: true });
}

function focusImeInputProxy(cellElement: HTMLElement): void {
  cellElement.querySelector<HTMLInputElement>("[data-youp-ime-input-proxy]")
    ?.focus({ preventScroll: true });
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

function updateEditingDraft(
  current: EditingCell | undefined,
  draftValue: string,
  options?: UpdateEditingDraftOptions,
): EditingCell | undefined {
  if (!current) {
    return current;
  }

  if (options?.preserveInitialPrintableKeyDraft) {
    return { ...current, draftValue };
  }

  return {
    ...current,
    draftValue,
    startedWithPrintableKey: undefined,
    initialPrintableKeyDraft: undefined,
  };
}

function createEditingCell<TRow>(
  cell: CellRenderState<TRow>,
  value: unknown,
  options?: { startedWithPrintableKey?: boolean },
): EditingCell {
  const draftValue = getEditorDraftValue(cell.column, value);

  return {
    rowId: cell.row.id,
    rowIndex: cell.rowIndex,
    columnId: cell.column.id,
    columnIndex: cell.columnIndex,
    draftValue,
    startedWithPrintableKey: options?.startedWithPrintableKey,
    initialPrintableKeyDraft: options?.startedWithPrintableKey ? draftValue : undefined,
  };
}

function createPastedRow<TRow>(context: {
  row: TRow;
  rowIndex: number;
  sourceRow: TRow;
  sourceRowId: GridRowId;
  columns: readonly ResolvedColumnDef<TRow>[];
  getRowId?: (row: TRow, index: number) => GridRowId;
}): TRow {
  if (!isObjectRecord(context.row)) {
    return context.row;
  }

  const rowId = context.getRowId?.(context.row, context.rowIndex);
  let nextRow: Record<string, unknown> = context.row;

  context.columns.forEach((column) => {
    if (!column.field) {
      return;
    }

    const sourceValue = column.accessor(context.sourceRow);

    if (
      isSameRowIdValue(sourceValue, context.sourceRowId) &&
      isSameRowIdValue(column.accessor(context.row), rowId)
    ) {
      return;
    }

    nextRow = setFieldValue(nextRow, column.field, sourceValue) as Record<string, unknown>;
  });

  return nextRow as TRow;
}

function setFieldValue(row: Record<string, unknown>, field: string, value: unknown): unknown {
  if (!field.includes(".")) {
    return {
      ...row,
      [field]: value,
    };
  }

  const keys = field.split(".");
  const root = { ...row };
  let cursor: Record<string, unknown> = root;

  keys.slice(0, -1).forEach((key) => {
    const current = cursor[key];
    const next = isObjectRecord(current) ? { ...current } : {};
    cursor[key] = next;
    cursor = next;
  });

  cursor[keys[keys.length - 1]] = value;

  return root;
}

function isSameRowIdValue(value: unknown, rowId: GridRowId | undefined): boolean {
  if (rowId === undefined) {
    return false;
  }

  return value === rowId ||
    ((typeof value === "string" || typeof value === "number") && String(value) === String(rowId));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  context.event.preventDefault();
  context.event.clipboardData.setData("text/plain", getGridClipboardText(context));
}

function getGridClipboardText<TRow>(context: {
  focusedCell: FocusedCell;
  selectionRange?: GridCellRange;
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
}) {
  const range = context.selectionRange ?? {
    anchor: context.focusedCell,
    focus: context.focusedCell,
  };

  return serializeGridRange({
    rows: context.rows,
    columns: context.columns,
    range,
  });
}

function handleGridPaste<TRow>(context: {
  event: ReactClipboardEvent<HTMLDivElement>;
  focusedCell: FocusedCell;
  selectionRange?: GridCellRange;
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
  sourceRows?: readonly TRow[];
  createRow?: (context: YoupGridCreateRowContext<TRow>) => TRow;
  getRowId?: (row: TRow, index: number) => GridRowId;
  onRowsChange?: YoupGridProps<TRow>["onRowsChange"];
  applyCellValueChanges: (
    changes: PendingCellValueChange<TRow>[],
    source: YoupGridCellValueChangeSource,
  ) => void;
  canEditCell: (row: RowNode<TRow>, rowIndex: number, column: ResolvedColumnDef<TRow>) => boolean;
}) {
  const applied = applyGridClipboardText({
    text: context.event.clipboardData.getData("text/plain"),
    focusedCell: context.focusedCell,
    selectionRange: context.selectionRange,
    rows: context.rows,
    columns: context.columns,
    sourceRows: context.sourceRows,
    createRow: context.createRow,
    getRowId: context.getRowId,
    onRowsChange: context.onRowsChange,
    applyCellValueChanges: context.applyCellValueChanges,
    canEditCell: context.canEditCell,
  });

  if (applied) {
    context.event.preventDefault();
  }
}

function applyGridClipboardText<TRow>(context: {
  text: string;
  focusedCell: FocusedCell;
  selectionRange?: GridCellRange;
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
  sourceRows?: readonly TRow[];
  createRow?: (context: YoupGridCreateRowContext<TRow>) => TRow;
  getRowId?: (row: TRow, index: number) => GridRowId;
  onRowsChange?: YoupGridProps<TRow>["onRowsChange"];
  applyCellValueChanges: (
    changes: PendingCellValueChange<TRow>[],
    source: YoupGridCellValueChangeSource,
  ) => void;
  canEditCell: (row: RowNode<TRow>, rowIndex: number, column: ResolvedColumnDef<TRow>) => boolean;
}) {
  const values = parseClipboardText(context.text);

  if (values.length === 0) {
    return false;
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
  let pasteRows = context.rows;
  let insertedRows: PendingClipboardRowInsert<TRow>[] = [];
  let rowsAfterInsert: TRow[] | undefined;
  const missingRowCount = getClipboardPasteMissingRowCount({
    rows: context.rows,
    values,
    startCell,
    fillRange,
  });

  if (
    missingRowCount > 0 &&
    context.sourceRows &&
    context.createRow &&
    context.onRowsChange
  ) {
    const inserted = createClipboardPasteRows({
      sourceRows: context.sourceRows,
      visibleRows: context.rows,
      missingRowCount,
      createRow: context.createRow,
      getRowId: context.getRowId,
    });

    if (inserted) {
      insertedRows = inserted.insertedRows;
      rowsAfterInsert = inserted.rows;
      pasteRows = [
        ...context.rows,
        ...insertedRows.map((insertedRow) => insertedRow.rowNode),
      ];
    }
  }

  const changes: PendingCellValueChange<TRow>[] = [];
  const insertedRowIds = new Set(insertedRows.map((insertedRow) => insertedRow.rowNode.id));

  for (const cell of getClipboardPasteCells({
    values,
    startCell,
    rowCount: pasteRows.length,
    columnCount: context.columns.length,
    fillRange,
  })) {
    const row = pasteRows[cell.rowIndex];
    const column = context.columns[cell.columnIndex];

    if (!row || !column || !context.canEditCell(row, cell.rowIndex, column)) {
      continue;
    }

    const previousValue = column.accessor(row.original);
    const value = parseDraftValue(column, row.original, cell.value);

    if (insertedRowIds.has(row.id) && isSameRowIdValue(previousValue, row.id)) {
      continue;
    }

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

  if (insertedRows.length > 0 && rowsAfterInsert && context.onRowsChange) {
    const rowsChange = applyClipboardInsertedRowValues({
      rows: rowsAfterInsert,
      insertedRows,
      changes,
    });

    context.onRowsChange({
      rows: rowsChange.rows,
      changes: rowsChange.insertedRows.map((insertedRow) => ({
        type: "insert",
        row: insertedRow.row,
        rowIndex: insertedRow.rowIndex,
        visibleRowIndex: insertedRow.visibleRowIndex,
        position: "below",
        anchorRow: insertedRow.anchorRow,
        anchorRowId: insertedRow.anchorRowId,
        anchorRowIndex: insertedRow.anchorRowIndex,
        reason: "paste",
      })),
      source: "clipboard",
    });
  }

  context.applyCellValueChanges(changes, "paste");
  return true;
}

function getClipboardPasteMissingRowCount<TRow>(context: {
  rows: readonly RowNode<TRow>[];
  values: readonly (readonly string[])[];
  startCell: FocusedCell;
  fillRange?: NormalizedGridCellRange;
}): number {
  if (context.fillRange || context.rows.length === 0) {
    return 0;
  }

  const pasteRowCount = getClipboardPasteRowCount({
    values: context.values,
    fillRange: context.fillRange,
  });

  return Math.max(0, context.startCell.rowIndex + pasteRowCount - context.rows.length);
}

function createClipboardPasteRows<TRow>(context: {
  sourceRows: readonly TRow[];
  visibleRows: readonly RowNode<TRow>[];
  missingRowCount: number;
  createRow: (createContext: YoupGridCreateRowContext<TRow>) => TRow;
  getRowId?: (row: TRow, index: number) => GridRowId;
}): { rows: TRow[]; insertedRows: PendingClipboardRowInsert<TRow>[] } | undefined {
  const firstAnchor = context.visibleRows[context.visibleRows.length - 1];

  if (!firstAnchor) {
    return undefined;
  }

  let rows = [...context.sourceRows];
  let anchorRow = firstAnchor.original;
  let anchorRowId = firstAnchor.id;
  let anchorRowIndex = firstAnchor.index;
  const insertStartRowIndex = firstAnchor.index + 1;
  const insertedRows: PendingClipboardRowInsert<TRow>[] = [];

  for (let offset = 0; offset < context.missingRowCount; offset += 1) {
    const rowIndex = insertStartRowIndex + offset;
    const visibleRowIndex = context.visibleRows.length + offset;
    const row = context.createRow({
      rows,
      rowIndex,
      visibleRowIndex,
      position: "below",
      anchorRow,
      anchorRowId,
      anchorRowIndex,
      reason: "paste",
    });
    const rowId = context.getRowId?.(row, rowIndex) ?? rowIndex;
    const rowNode = {
      id: rowId,
      index: rowIndex,
      original: row,
    };

    rows = [
      ...rows.slice(0, rowIndex),
      row,
      ...rows.slice(rowIndex),
    ];
    insertedRows.push({
      row,
      rowNode,
      rowIndex,
      visibleRowIndex,
      anchorRow,
      anchorRowId,
      anchorRowIndex,
    });
    anchorRow = row;
    anchorRowId = rowId;
    anchorRowIndex = rowIndex;
  }

  return { rows, insertedRows };
}

function applyClipboardInsertedRowValues<TRow>(context: {
  rows: TRow[];
  insertedRows: readonly PendingClipboardRowInsert<TRow>[];
  changes: readonly PendingCellValueChange<TRow>[];
}): { rows: TRow[]; insertedRows: PendingClipboardRowInsert<TRow>[] } {
  let rows = context.rows;
  const insertedRows = context.insertedRows.map((insertedRow) => ({ ...insertedRow }));
  const insertedRowById = new Map(
    insertedRows.map((insertedRow) => [insertedRow.rowNode.id, insertedRow]),
  );

  for (const change of context.changes) {
    const insertedRow = insertedRowById.get(change.rowId);

    if (!insertedRow || !change.column.field || !isObjectRecord(rows[insertedRow.rowIndex])) {
      continue;
    }

    const row = setFieldValue(
      rows[insertedRow.rowIndex] as Record<string, unknown>,
      change.column.field,
      change.value,
    ) as TRow;

    rows = [
      ...rows.slice(0, insertedRow.rowIndex),
      row,
      ...rows.slice(insertedRow.rowIndex + 1),
    ];
    insertedRow.row = row;
    insertedRow.rowNode = {
      ...insertedRow.rowNode,
      original: row,
    };
  }

  return { rows, insertedRows };
}

function writeClipboardText(text: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return Promise.resolve();
  }

  return navigator.clipboard.writeText(text);
}

function readClipboardText(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    return Promise.resolve("");
  }

  return navigator.clipboard.readText();
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

  if (column.editor === "select" || column.editor === "combobox") {
    const option = findEditorOptionByValue(column.options, value);

    if (option) {
      return option.label;
    }
  }

  if (column.editor === "tags") {
    return getTagDisplayItems(column, value).map((tag) => tag.label).join(", ");
  }

  return String(value ?? "");
}

function getEditorDraftValue<TRow>(column: ResolvedColumnDef<TRow>, value: unknown): string {
  if (column.editor === "select") {
    const option = findEditorOptionByValue(column.options, value);

    if (option) {
      return option.inputValue;
    }
  }

  if (column.editor === "combobox") {
    const option = findEditorOptionByValue(column.options, value);

    if (option) {
      return option.label;
    }
  }

  if (column.editor === "tags") {
    return serializeTagEditorDraft(getTagDisplayItems(column, value).map((tag) => tag.inputValue), "");
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

  if (column.editor === "select" || column.editor === "combobox") {
    const option = findEditorOptionByInput(column.options, draftValue);

    return option ? option.value : draftValue;
  }

  if (column.editor === "tags") {
    return parseTagEditorValue(column, draftValue);
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

  if (column.editor === "tags") {
    return [];
  }

  return "";
}

type NormalizedEditorOption = {
  value: ColumnEditorOptionValue;
  label: string;
  inputValue: string;
  disabled: boolean;
  color?: string;
  description?: string;
};

function normalizeEditorOptions(options?: readonly ColumnEditorOption[]): NormalizedEditorOption[] {
  return (options ?? []).map((option) => {
    const value = getEditorOptionValue(option);
    const objectOption = typeof option === "object" ? option : undefined;

    return {
      value,
      label: objectOption ? objectOption.label : String(option),
      inputValue: String(value),
      disabled: Boolean(objectOption?.disabled),
      color: objectOption?.color,
      description: objectOption?.description,
    };
  });
}

function getEditorOptionValue(option: ColumnEditorOption): ColumnEditorOptionValue {
  return typeof option === "object" ? option.value : option;
}

function findEditorOptionByValue(
  options: readonly ColumnEditorOption[] | undefined,
  value: unknown,
): NormalizedEditorOption | undefined {
  const normalizedOptions = normalizeEditorOptions(options);

  return normalizedOptions.find((option) => Object.is(option.value, value)) ??
    normalizedOptions.find((option) => option.inputValue === String(value));
}

function findEditorOptionByInput(
  options: readonly ColumnEditorOption[] | undefined,
  input: string,
): NormalizedEditorOption | undefined {
  return normalizeEditorOptions(options)
    .filter((option) => !option.disabled)
    .find((option) => option.inputValue === input || option.label === input);
}

function findEditorOptionByDisplayInput(
  options: readonly ColumnEditorOption[] | undefined,
  input: string,
): NormalizedEditorOption | undefined {
  return normalizeEditorOptions(options)
    .find((option) => option.inputValue === input || option.label === input);
}

function parseTagEditorDraft(draft: string): { tags: string[]; input: string } {
  if (!draft.includes(",")) {
    return { tags: [], input: draft };
  }

  const parts = draft.split(",");
  const input = draft.endsWith(",") ? "" : parts.pop() ?? "";

  return {
    tags: parts.map((part) => part.trim()).filter(Boolean),
    input: input.trimStart(),
  };
}

function serializeTagEditorDraft(tags: readonly string[], input: string): string {
  const cleanTags = tags.map((tag) => tag.trim()).filter(Boolean);
  const cleanInput = input.trimStart();

  if (cleanInput.length > 0) {
    return cleanTags.length > 0 ? `${cleanTags.join(", ")}, ${cleanInput}` : cleanInput;
  }

  return cleanTags.length > 0 ? `${cleanTags.join(", ")},` : "";
}

function serializeTagEditorDraftWithInput(tags: readonly string[], input: string): string {
  const cleanInput = input.trim();

  return cleanInput.length > 0
    ? serializeTagEditorDraft([...tags, cleanInput], "")
    : serializeTagEditorDraft(tags, "");
}

function parseTagEditorValue<TRow>(column: ResolvedColumnDef<TRow>, draft: string): unknown[] {
  const parts = parseTagEditorDraft(draft);
  const tagInputs = parts.input.trim().length > 0 ? [...parts.tags, parts.input] : parts.tags;

  return tagInputs.map((tag) => findEditorOptionByInput(column.options, tag)?.value ?? tag);
}

function getTagDisplayItems<TRow>(
  column: ResolvedColumnDef<TRow>,
  value: unknown,
): NormalizedEditorOption[] {
  return getTagInputValues(value).map((tag) => getTagDisplayItem(column, tag));
}

function getTagDisplayItem<TRow>(column: ResolvedColumnDef<TRow>, value: unknown): NormalizedEditorOption {
  const inputValue = String(value ?? "");

  return (
    findEditorOptionByValue(column.options, value) ??
    findEditorOptionByDisplayInput(column.options, inputValue) ?? {
      value: inputValue,
      label: inputValue,
      inputValue,
      disabled: false,
    }
  );
}

function getTagInputValues(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined || value === "") {
    return [];
  }

  if (typeof value === "string" && value.includes(",")) {
    return value.split(",").map((part) => part.trim()).filter(Boolean);
  }

  return [value];
}

function getCellTitle(
  meta: YoupGridCellMeta | undefined,
  disabledReason: ReactNode | undefined,
  editable: boolean,
  tooltipMode: YoupGridCellTooltipMode,
): string | undefined {
  if (tooltipMode === "native" && typeof meta?.message === "string") {
    return meta.message;
  }

  if (!editable && typeof disabledReason === "string") {
    return disabledReason;
  }

  return undefined;
}

function hasTooltipMessage(meta?: YoupGridCellMeta): boolean {
  return Boolean(meta?.message);
}

function getCellKey(rowId: GridRowId, columnId: string): string {
  return `${String(rowId)}:${columnId}`;
}

function getCellTooltipId(cellKey: string): string {
  return `youp-grid-cell-tooltip-${cellKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function isTextEditingKey(
  event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>,
): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return false;
  }

  return event.key.length === 1 || isCompositionEditingKey(event);
}

function canUseKeyAsInitialDraft(
  event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>,
): boolean {
  return event.key.length === 1 && isAsciiPrintableKey(event.key) && !isCompositionEditingKey(event);
}

function isCompositionEditingKey(
  event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>,
): boolean {
  return (
    event.nativeEvent.isComposing ||
    event.key === "Process" ||
    event.key === "Dead" ||
    event.key === "Unidentified" ||
    event.keyCode === 229
  );
}

function isAsciiPrintableKey(key: string): boolean {
  return key >= " " && key <= "~";
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

function getFilterRule(state: { filters?: FilterRule[] }, columnId: string): FilterRule | undefined {
  return state.filters?.find((filter) => filter.columnId === columnId);
}

function getFilterRuleValue(filterRule: FilterRule | undefined): string {
  const value = filterRule?.value;

  if (Array.isArray(value)) {
    return filterRule?.operator === "between" ? value.join("..") : value.join(",");
  }

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

function resolveImportDelimiter(
  delimiter: YoupGridProps<unknown>["importDelimiter"],
  fileName: string,
  text: string,
): "," | "\t" | ";" {
  if (delimiter && delimiter !== "auto") {
    return delimiter;
  }

  if (fileName.toLocaleLowerCase().endsWith(".tsv")) {
    return "\t";
  }

  const sample = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates: readonly ("," | "\t" | ";")[] = [",", "\t", ";"];
  return candidates.reduce((selected, candidate) => {
    return countOccurrences(sample, candidate) > countOccurrences(sample, selected) ? candidate : selected;
  }, ",");
}

function countOccurrences(value: string, needle: string) {
  if (needle.length === 0) {
    return 0;
  }
  return value.split(needle).length - 1;
}
