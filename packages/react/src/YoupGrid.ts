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
  normalizeCellRange,
  parseClipboardText,
  pushValueHistoryEntry,
  redoValueHistory,
  serializeGridRange,
  undoValueHistory,
  type AggregationResult,
  type ColumnAlign,
  type ColumnDef,
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
import { createPortal } from "react-dom";
import { Fragment, createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent as ReactChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  CSSProperties,
  DragEvent as ReactDragEvent,
  FocusEvent as ReactFocusEvent,
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
  YoupGridDensity,
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

let autosizeMeasureCanvas: HTMLCanvasElement | undefined;

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
  const [cellContextMenu, setCellContextMenu] = useState<CellContextMenuState | undefined>();
  const [rowClipboard, setRowClipboard] = useState<RowClipboardEntry<TRow>[]>([]);
  const [internalExpandedDetailRowIds, setInternalExpandedDetailRowIds] = useState<GridRowId[]>(() => [
    ...(props.defaultExpandedDetailRowIds ?? []),
  ]);
  const [draggedColumnId, setDraggedColumnId] = useState<string | undefined>();
  const [dragOverColumnId, setDragOverColumnId] = useState<string | undefined>();
  const [dragOverColumnPosition, setDragOverColumnPosition] = useState<ColumnDropPosition | undefined>();
  const [activeTooltipCellKey, setActiveTooltipCellKey] = useState<string | undefined>();
  const showRowNumberColumn = props.showRowNumberColumn ?? false;
  const showRowSelectionColumn = props.showRowSelectionColumn ?? false;
  const pinRowSelectionColumn = props.pinRowSelectionColumn ?? false;
  const showCellContextMenu = props.showCellContextMenu ?? false;
  const cellTooltipMode = props.cellTooltip?.mode ?? "native";
  const gridEditable = (props.editable ?? true) && !props.readOnly;
  const detailRowHeight = props.detailRowHeight ?? DEFAULT_DETAIL_ROW_HEIGHT;
  const detailRowsEnabled = Boolean(props.renderRowDetail);
  const expandedDetailRowIds = props.expandedDetailRowIds ?? internalExpandedDetailRowIds;
  const expandedDetailRowIdSet = useMemo(
    () => new Set(expandedDetailRowIds),
    [expandedDetailRowIds],
  );
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
  const originalColumnIds = useMemo(() => getColumnDefIds(props.columns), [props.columns]);
  const resetColumnDrag = () => {
    setDraggedColumnId(undefined);
    setDragOverColumnId(undefined);
    setDragOverColumnPosition(undefined);
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
  const gridStyle = {
    ...props.style,
  };
  const renderedRows = (detailRowsEnabled
    ? displayRows.map((row, index) => ({ row, displayIndex: index }))
    : virtualRange.items
      .map((item) => {
        const row = displayRows[item.index];

        return row ? { row, displayIndex: item.index } : undefined;
      }))
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
      rows: rowModel.visibleRows,
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
          rows: rowModel.visibleRows,
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
      rows: rowModel.visibleRows,
      columns: visibleColumns,
      canEditCell: canEditGridCell,
      applyCellValueChanges,
    });
  };
  const selectCellContextMenuRow = () => {
    if (!cellContextMenu) {
      return;
    }

    const row = rowModel.visibleRows[cellContextMenu.rowIndex];

    if (row) {
      controller.setRowSelected(row.id, true);
    }
  };
  const getCellContextMenuTargetRows = () => {
    if (!cellContextMenu) {
      return [];
    }

    const row = rowModel.visibleRows[cellContextMenu.rowIndex];

    if (!row || isRowGroupNode(row)) {
      return [];
    }

    if (selectedRowIds.has(row.id)) {
      return rowModel.visibleRows.filter((visibleRow): visibleRow is RowNode<TRow> => {
        return !isRowGroupNode(visibleRow) && selectedRowIds.has(visibleRow.id);
      });
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

    rowModel.visibleRows.forEach((row, index) => {
      if (!isRowGroupNode(row)) {
        visibleRowIndexByRowId.set(row.id, index);
      }
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

    const anchorRow = rowModel.visibleRows[cellContextMenu.rowIndex];

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

    const anchorRow = rowModel.visibleRows[cellContextMenu.rowIndex];

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

    rowModel.visibleRows.forEach((row, index) => {
      if (!isRowGroupNode(row)) {
        visibleRowIndexByRowId.set(row.id, index);
      }
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
      Math.max(0, rowModel.visibleRows.length - targetRows.length - 1),
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
          rows: rowModel.visibleRows,
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
    displayIndexByVisibleRowIndex: Map<number, number>;
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
      rowCount: context.rowModel.visibleRows.length,
      columnCount: context.columnLayouts.length,
      rowHeight: context.rowHeight,
      bodyElement: context.bodyElement,
      getDisplayRowIndex: (rowIndex) => context.displayIndexByVisibleRowIndex.get(rowIndex) ?? rowIndex,
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
      density,
      open: columnChooserOpen,
      columns: rowModel.columns,
      showExcelExport: props.showExcelExport ?? true,
      toggleOpen: () => setColumnChooserOpen((current) => !current),
      setDensity,
      setColumnHidden: controller.setColumnHidden,
      setColumnPinned: controller.setColumnPinned,
      canMoveColumn,
      moveColumn,
      canResetColumnOrder,
      resetColumnOrder,
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
            sourceRows: props.rows,
            createRow: props.createRow,
            getRowId: props.getRowId,
            onRowsChange: props.onRowsChange,
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
              showRowNumberColumn
                ? renderRowNumberHeaderGroupCell()
                : undefined,
              showRowSelectionColumn
                ? renderSelectionHeaderGroupCell(selectionColumnOffset)
                : undefined,
              headerGroupLayouts.map((layout) => renderHeaderGroupCell(layout)),
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
                  rows: rowModel.visibleRows,
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
        rowModel.visibleRows.length === 0 && !props.loading && !props.error
          ? createElement("div", { className: "youp-grid__empty" }, props.emptyContent ?? "No rows")
          : rowModel.visibleRows.length === 0
            ? undefined
            : detailRowsEnabled
              ? createElement(
                  "div",
                  { className: "youp-grid__detail-window" },
                  renderedRows.map(({ row, displayIndex }) => {
                    return renderDisplayRow({
                      row,
                      displayIndex,
                      columnLayouts,
                      showRowNumberColumn,
                      showRowSelectionColumn,
                      selectionColumnOffset,
                      rowHeight,
                      detailRowHeight,
                      selectedRowIds,
                      visibleRowIndexById,
                      focusedCell,
                      selectionRange,
                      fillRange,
                      editingCell,
                      gridEditable,
                      disabledReason: props.disabledReason,
                      treeData: props.treeData ?? false,
                      rowModel,
                      visibleColumns,
                      canEditGridCell,
                      getGridCellMeta,
                      setRowSelected: controller.setRowSelected,
                      setFocusedCell,
                      toggleTreeRowExpanded: controller.toggleTreeRowExpanded,
                      toggleRowGroupExpanded: controller.toggleRowGroupExpanded,
                      isRowDetailAvailable,
                      getRowDetailContext,
                      renderRowDetail: props.renderRowDetail,
                      expandedDetailRowIdSet,
                      startFillHandle: (event, sourceRow) => {
                        if (!gridEditable) {
                          return;
                        }

                        startGridFillHandle({
                          event,
                          sourceRange: normalizeCellRange(selectionRange ?? {
                            anchor: focusedCell,
                            focus: focusedCell,
                          }),
                          rowModel,
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
                          rows: rowModel.visibleRows,
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
                      handleCellKeyDown: (event, cell, sourceRow) => {
                        handleGridCellKeyDown({
                          event,
                          cell,
                          row: sourceRow,
                          rowModel,
                          columnLayouts,
                          rowHeight,
                          bodyElement: bodyRef.current,
                          displayIndexByVisibleRowIndex,
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
                              rows: rowModel.visibleRows,
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
                    });
                  }),
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

                const rowIndex = visibleRowIndexById.get(row.id) ?? displayIndex;

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
                  autoSizeColumn: (event, column) => {
                    autoSizeColumnToFit({
                      event,
                      column,
                      rows: rowModel.visibleRows,
                      resizeColumn: (width) => controller.setColumnWidth(column.id, width),
                    });
                  },
                  applyCellValue,
                  startEditing: startEditingCell,
                  updateEditingDraft: (draftValue) => {
                    setEditingCell((current) => current ? { ...current, draftValue } : current);
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
        showRowNumberColumn,
        showSelectionColumn: showRowSelectionColumn,
        selectionColumnOffset,
      }),
    ),
    cellContextMenuPortal,
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
  showRowNumberColumn: boolean;
  showSelectionColumn: boolean;
  selectionColumnOffset: number;
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
            style: getCellStyle(layout),
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
  filterValue: string;
  showFilter: boolean;
  setFilter: (value: string) => void;
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
}) {
  const sortable = context.layout.column.sortable !== false;

  return createElement(
    "div",
    {
      key: context.layout.column.id,
      className: getCellClassName(
        [
          "youp-grid__cell youp-grid__cell--header",
          context.dragged ? "youp-grid__cell--column-dragging" : "",
          context.dragOver ? `youp-grid__cell--column-drag-over-${context.dragOverPosition ?? "before"}` : "",
        ]
          .filter(Boolean)
          .join(" "),
        context.layout,
      ),
      role: "columnheader",
      style: getCellStyle(context.layout),
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
          filterValue: context.filterValue,
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
      onDoubleClick: context.autoSizeColumn,
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
        createElement("span", { className: "youp-grid__group-caret", "aria-hidden": true }, context.row.expanded ? "v" : ">"),
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
      style: { minHeight: context.detailRowHeight },
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
  visibleRowIndexById: Map<GridRowId, number>;
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
  handleCellKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement | HTMLInputElement | HTMLSelectElement>,
    cell: CellRenderState<TRow>,
    row: RowNode<TRow>,
  ) => void;
  renderCell?: (context: YoupGridCellContext<TRow>) => ReactNode;
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
  const rowIndex = context.visibleRowIndexById.get(rowNode.id) ?? context.displayIndex;
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
    updateEditingDraft: (draftValue) => {
      context.setEditingCell((current) => current ? { ...current, draftValue } : current);
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
    onCellKeyDown: (event, cell) => context.handleCellKeyDown(event, cell, rowNode),
    renderCell: context.renderCell,
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
  updateEditingDraft: (draftValue: string) => void;
  cancelEditing: () => void;
  commitEditing: (cell: EditingCell, reason?: YoupGridCellEditCommitReason) => void;
  onRowClick?: (event: YoupGridRowEvent<TRow>) => void;
  onRowDoubleClick?: (event: YoupGridRowEvent<TRow>) => void;
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
  updateEditingDraft: (draftValue: string) => void;
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
        event.currentTarget.focus({ preventScroll: true });
        context.setFocusedCell(
          { rowIndex: context.rowIndex, columnIndex: context.columnIndex },
          event.shiftKey,
        );
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
    context.editing
      ? renderCellEditor({
          cell: cellState,
          editingCell: context.editingCell,
          updateEditingDraft: context.updateEditingDraft,
          commitEditing: context.commitEditing,
          onKeyDown: context.onKeyDown,
        })
      : renderedContent,
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
          { className: "youp-grid__tree-caret", "aria-hidden": true },
          context.row.expanded ? "v" : ">",
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
        { className: "youp-grid__detail-caret", "aria-hidden": true },
        context.expanded ? "v" : ">",
      ),
    ),
    createElement("span", { className: "youp-grid__cell-detail-value" }, context.content),
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

function renderColumnToolbar<TRow>(context: {
  showColumnChooser: boolean;
  showCsvExport: boolean;
  showExcelExport: boolean;
  showDensityControl: boolean;
  density: YoupGridDensity;
  open: boolean;
  columns: readonly ResolvedColumnDef<TRow>[];
  toggleOpen: () => void;
  setDensity: (density: YoupGridDensity) => void;
  setColumnHidden: (columnId: string, hidden: boolean) => void;
  setColumnPinned: (columnId: string, pinned: ColumnPin | undefined) => void;
  canMoveColumn: (columnId: string, direction: ColumnMoveDirection) => boolean;
  moveColumn: (columnId: string, direction: ColumnMoveDirection) => void;
  canResetColumnOrder: boolean;
  resetColumnOrder: () => void;
  exportCsv: () => void;
  exportExcel: () => void;
}) {
  if (
    !context.showColumnChooser &&
    !context.showCsvExport &&
    !context.showExcelExport &&
    !context.showDensityControl
  ) {
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
    context.showExcelExport
      ? createElement(
          "button",
          {
            className: "youp-grid__toolbar-button",
            type: "button",
            onClick: context.exportExcel,
          },
          "Export Excel",
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

  if (isTextEditingKey(context.event)) {
    if (context.cell.editable && context.cell.column.editor !== "checkbox") {
      if (canUseKeyAsInitialDraft(context.event)) {
        context.event.preventDefault();
        context.startEditing(createEditingCell(context.cell, context.event.key));
      } else {
        context.startEditing(createEditingCell(context.cell, ""));
      }
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
