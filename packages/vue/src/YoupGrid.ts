import type {
  ColumnAlign,
  ColumnDef,
  ColumnEditorOption,
  ColumnPin,
  GridRowId,
  GridRowModelType,
  GridState,
  ResolvedColumnDef,
  RowDisplayNode,
  RowGroupNode,
  RowNode,
  SortDirection,
} from "@youp-grid/core";
import {
  createRemoteCacheKey,
  exportGridCsv,
  exportGridExcel,
  getClipboardPasteCells,
  getClipboardPasteRowCount,
  getInfiniteScrollTrigger,
  parseClipboardText,
} from "@youp-grid/core";
import {
  computed,
  defineComponent,
  h,
  nextTick,
  ref,
  Teleport,
  watch,
  type PropType,
  type Ref,
  type Slots,
  type StyleValue,
  type VNodeChild,
} from "vue";

import type {
  YoupGridCellsValueChange,
  YoupGridCanEditCellContext,
  YoupGridCellEditCommit,
  YoupGridCellEditCommitReason,
  YoupGridCellMeta,
  YoupGridCellSlotContext,
  YoupGridCellTooltipMode,
  YoupGridCellTooltipOptions,
  YoupGridCellValueChange,
  YoupGridCreateRowContext,
  YoupGridDensity,
  YoupGridHeaderSlotContext,
  YoupGridPaginationOptions,
  YoupGridRowEvent,
  YoupGridRowInsertPosition,
  YoupGridRowsChange,
  YoupGridRowsEndReachedEvent,
  YoupGridStateChange,
} from "./types.ts";
import { useYoupGrid } from "./useYoupGrid.ts";

const DEFAULT_COLUMN_WIDTH = 160;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
const DEFAULT_INFINITE_SCROLL_THRESHOLD = 5;
const ROW_NUMBER_COLUMN_WIDTH = 44;
const ROW_SELECTION_COLUMN_WIDTH = 44;
const MIN_AUTOSIZE_COLUMN_WIDTH = 48;
const MAX_AUTOSIZE_COLUMN_WIDTH = 640;
const CONTEXT_MENU_VIEWPORT_PADDING = 8;

let autosizeMeasureCanvas: HTMLCanvasElement | undefined;

type ActiveEdit = {
  rowId: GridRowId;
  columnId: string;
  draft: string;
};

type ActiveCellContextMenu<TRow = unknown> = {
  rowNode: RowNode<TRow>;
  column: ResolvedColumnDef<TRow>;
  columnIndex: number;
  clientX: number;
  clientY: number;
  placement?: ContextMenuPlacement;
};

type ContextMenuPlacement = {
  x: number;
  y: number;
};

type RowClipboardEntry<TRow = unknown> = {
  row: TRow;
  rowId: GridRowId;
  rowIndex: number;
  visibleRowIndex: number;
};

type PendingClipboardRowInsert<TRow = unknown> = {
  row: TRow;
  rowNode: RowNode<TRow>;
  rowIndex: number;
  visibleRowIndex: number;
  anchorRow: TRow;
  anchorRowId: GridRowId;
  anchorRowIndex: number;
};

type NormalizedPaginationOptions = {
  pageSizeOptions: readonly number[];
};

type PaginationRenderContext = {
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  rowCount: number;
  visibleRowCount: number;
  pageSizeOptions: readonly number[];
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
};

export const YoupGrid = defineComponent({
  name: "YoupGrid",
  props: {
    rows: {
      type: Array as PropType<readonly unknown[]>,
      required: true,
    },
    columns: {
      type: Array as PropType<readonly ColumnDef<unknown>[]>,
      required: true,
    },
    state: {
      type: Object as PropType<GridState>,
      default: undefined,
    },
    defaultState: {
      type: Object as PropType<GridState>,
      default: undefined,
    },
    className: {
      type: String,
      default: undefined,
    },
    style: {
      type: [String, Object, Array] as PropType<StyleValue>,
      default: undefined,
    },
    height: {
      type: [Number, String],
      default: undefined,
    },
    rowHeight: {
      type: Number,
      default: undefined,
    },
    overscan: {
      type: Number,
      default: undefined,
    },
    infiniteScroll: {
      type: Boolean,
      default: false,
    },
    infiniteScrollThreshold: {
      type: Number,
      default: undefined,
    },
    infiniteScrollLoading: {
      type: Boolean,
      default: undefined,
    },
    hasMoreRows: {
      type: Boolean,
      default: undefined,
    },
    getRowId: {
      type: Function as PropType<(row: unknown, index: number) => GridRowId>,
      default: undefined,
    },
    treeData: {
      type: Boolean,
      default: false,
    },
    getParentRowId: {
      type: Function as PropType<
        (row: unknown, index: number) => GridRowId | null | undefined
      >,
      default: undefined,
    },
    rowModelType: {
      type: String as PropType<GridRowModelType>,
      default: undefined,
    },
    serverRowCount: {
      type: Number,
      default: undefined,
    },
    serverFilteredRowCount: {
      type: Number,
      default: undefined,
    },
    emptyText: {
      type: String,
      default: "No rows",
    },
    emptyContent: {
      type: null as unknown as PropType<VNodeChild>,
      default: undefined,
    },
    loading: {
      type: Boolean,
      default: false,
    },
    loadingContent: {
      type: null as unknown as PropType<VNodeChild>,
      default: undefined,
    },
    error: {
      type: [String, Object, Boolean] as PropType<string | Error | boolean | null | undefined>,
      default: undefined,
    },
    errorContent: {
      type: null as unknown as PropType<VNodeChild>,
      default: undefined,
    },
    pagination: {
      type: [Boolean, Object] as PropType<boolean | YoupGridPaginationOptions>,
      default: false,
    },
    showPagination: {
      type: Boolean,
      default: undefined,
    },
    showColumnChooser: {
      type: Boolean,
      default: undefined,
    },
    showCsvExport: {
      type: Boolean,
      default: undefined,
    },
    showExcelExport: {
      type: Boolean,
      default: undefined,
    },
    showDensityControl: {
      type: Boolean,
      default: undefined,
    },
    showFilters: {
      type: Boolean,
      default: undefined,
    },
    csvFileName: {
      type: String,
      default: undefined,
    },
    excelFileName: {
      type: String,
      default: undefined,
    },
    density: {
      type: String as PropType<YoupGridDensity>,
      default: undefined,
    },
    defaultDensity: {
      type: String as PropType<YoupGridDensity>,
      default: "standard",
    },
    onDensityChange: {
      type: Function as PropType<(density: YoupGridDensity) => void>,
      default: undefined,
    },
    sortOnHeaderClick: {
      type: Boolean,
      default: true,
    },
    showRowNumberColumn: {
      type: Boolean,
      default: false,
    },
    showRowSelectionColumn: {
      type: Boolean,
      default: false,
    },
    pinRowSelectionColumn: {
      type: Boolean,
      default: false,
    },
    showCellContextMenu: {
      type: Boolean,
      default: false,
    },
    editable: {
      type: Boolean,
      default: true,
    },
    readOnly: {
      type: Boolean,
      default: false,
    },
    canEditCell: {
      type: Function as PropType<(context: YoupGridCanEditCellContext<unknown>) => boolean>,
      default: undefined,
    },
    disabledReason: {
      type: null as unknown as PropType<VNodeChild>,
      default: undefined,
    },
    createRow: {
      type: Function as PropType<(context: YoupGridCreateRowContext<unknown>) => unknown>,
      default: undefined,
    },
    cellMeta: {
      type: Object as PropType<Record<string, YoupGridCellMeta | undefined>>,
      default: undefined,
    },
    getCellMeta: {
      type: Function as PropType<
        (context: YoupGridCanEditCellContext<unknown>) => YoupGridCellMeta | undefined
      >,
      default: undefined,
    },
    cellTooltip: {
      type: Object as PropType<YoupGridCellTooltipOptions>,
      default: undefined,
    },
  },
  emits: {
    stateChange: (_change: YoupGridStateChange<unknown>) => true,
    rowClick: (_event: YoupGridRowEvent<unknown>) => true,
    rowDoubleClick: (_event: YoupGridRowEvent<unknown>) => true,
    cellValueChange: (_change: YoupGridCellValueChange<unknown>) => true,
    cellsValueChange: (_change: YoupGridCellsValueChange<unknown>) => true,
    cellEditCommit: (_commit: YoupGridCellEditCommit<unknown>) => true,
    rowsChange: (_change: YoupGridRowsChange<unknown>) => true,
    rowsEndReached: (_event: YoupGridRowsEndReachedEvent<unknown>) => true,
    densityChange: (_density: YoupGridDensity) => true,
  },
  setup(props, { emit, slots }) {
    const rootRef = ref<HTMLElement | null>(null);
    const cellContextMenuRef = ref<HTMLElement | null>(null);
    const activeEdit = ref<ActiveEdit>();
    const activeTooltipCellKey = ref<string>();
    const activeCellContextMenu = ref<ActiveCellContextMenu>();
    const rowClipboard = ref<RowClipboardEntry[]>([]);
    const columnChooserOpen = ref(false);
    const internalDensity = ref<YoupGridDensity>(props.defaultDensity);
    const lastRowsEndReachedKey = ref<string>();
    const grid = useYoupGrid<unknown>(() => ({
      rows: props.rows,
      columns: props.columns,
      state: withDefaultPagination(props.state, props.pagination),
      defaultState: withDefaultPagination(props.defaultState, props.pagination),
      getRowId: props.getRowId,
      treeData: props.treeData,
      getParentRowId: props.getParentRowId,
      rowModelType: props.rowModelType,
      serverRowCount: props.serverRowCount,
      serverFilteredRowCount: props.serverFilteredRowCount,
      onStateChange: (change) => emit("stateChange", change),
    }));

    const visibleColumns = computed(() => grid.rowModel.value.visibleColumns);
    const density = computed(() => props.density ?? internalDensity.value);
    const gridEditable = computed(() => props.editable && !props.readOnly);
    const infiniteScrollLoading = computed(
      () => props.infiniteScrollLoading ?? props.loading,
    );
    const infiniteScrollTrigger = computed(() => {
      const rowCount = grid.rowModel.value.visibleRows.length;

      return getInfiniteScrollTrigger({
        rowCount,
        lastVisibleRowIndex: rowCount - 1,
        threshold: props.infiniteScrollThreshold ?? DEFAULT_INFINITE_SCROLL_THRESHOLD,
        hasMoreRows: props.hasMoreRows,
        loading: infiniteScrollLoading.value,
      });
    });
    const infiniteScrollLoadKey = computed(
      () => `${createRemoteCacheKey(grid.state.value)}:${infiniteScrollTrigger.value.rowCount}`,
    );
    const paginationOptions = computed(() => normalizePaginationOptions(props.pagination));
    const leadingColumnCount = computed(
      () => Number(props.showRowNumberColumn) + Number(props.showRowSelectionColumn),
    );
    const gridTemplateColumns = computed(() =>
      [
        props.showRowNumberColumn ? `${ROW_NUMBER_COLUMN_WIDTH}px` : undefined,
        props.showRowSelectionColumn ? `${ROW_SELECTION_COLUMN_WIDTH}px` : undefined,
        ...visibleColumns.value.map((column) => `${getColumnWidth(column)}px`),
      ]
        .filter((column): column is string => column !== undefined)
        .join(" "),
    );
    const selectedRowIds = computed(
      () => new Set<GridRowId>(grid.state.value.selectedRowIds ?? []),
    );
    const visibleRowIds = computed(() =>
      grid.rowModel.value.visibleRows.map((rowNode) => rowNode.id),
    );
    const selectedVisibleRowCount = computed(
      () => visibleRowIds.value.filter((rowId) => selectedRowIds.value.has(rowId)).length,
    );
    const allVisibleRowsSelected = computed(
      () =>
        visibleRowIds.value.length > 0 &&
        selectedVisibleRowCount.value === visibleRowIds.value.length,
    );
    const someVisibleRowsSelected = computed(
      () => selectedVisibleRowCount.value > 0 && !allVisibleRowsSelected.value,
    );
    const selectionColumnOffset = computed(() =>
      props.showRowSelectionColumn && props.pinRowSelectionColumn && props.showRowNumberColumn
        ? ROW_NUMBER_COLUMN_WIDTH
        : 0,
    );
    const cellTooltipMode = computed<YoupGridCellTooltipMode>(
      () => props.cellTooltip?.mode ?? "native",
    );
    watch(
      () => [
        props.infiniteScroll,
        infiniteScrollTrigger.value.shouldLoadMore,
        infiniteScrollLoadKey.value,
      ] as const,
      ([enabled, shouldLoadMore, loadKey]) => {
        if (!enabled || !shouldLoadMore || lastRowsEndReachedKey.value === loadKey) {
          return;
        }

        const trigger = infiniteScrollTrigger.value;
        lastRowsEndReachedKey.value = loadKey;
        emit("rowsEndReached", {
          state: grid.state.value,
          rowModel: grid.rowModel.value,
          rowCount: trigger.rowCount,
          lastVisibleRowIndex: trigger.lastVisibleRowIndex,
          threshold: trigger.threshold,
          remainingRows: trigger.remainingRows,
        });
      },
      { immediate: true },
    );
    watch(
      () =>
        [
          cellTooltipMode.value,
          props.cellTooltip?.autoOpenCellKey,
          props.cellTooltip?.autoOpenDurationMs,
        ] as const,
      ([mode, cellKey, durationMs], _previous, onCleanup) => {
        if (mode !== "rich") {
          activeTooltipCellKey.value = undefined;
          return;
        }

        if (!cellKey) {
          return;
        }

        activeTooltipCellKey.value = cellKey;
        const duration = durationMs ?? 2000;

        if (duration <= 0) {
          return;
        }

        const timeout = setTimeout(() => {
          if (activeTooltipCellKey.value === cellKey) {
            activeTooltipCellKey.value = undefined;
          }
        }, duration);

        onCleanup(() => clearTimeout(timeout));
      },
      { immediate: true },
    );
    const canEditCell = (
      rowNode: RowNode<unknown>,
      column: ResolvedColumnDef<unknown>,
    ) => {
      if (!gridEditable.value || column.editable === false) {
        return false;
      }

      return props.canEditCell?.(getCellEditContext(rowNode, column)) ?? true;
    };
    const getCellMeta = (
      rowNode: RowNode<unknown>,
      column: ResolvedColumnDef<unknown>,
    ) =>
      props.getCellMeta?.(getCellEditContext(rowNode, column)) ??
      props.cellMeta?.[getCellKey(rowNode.id, column.id)];
    const setActiveTooltipCellKey = (cellKey?: string) => {
      activeTooltipCellKey.value = cellKey;
    };
    const setVisibleRowsSelected = (selected: boolean) => {
      const currentSelectedRowIds = grid.state.value.selectedRowIds ?? [];
      const currentSelection = new Set<GridRowId>(currentSelectedRowIds);

      if (selected) {
        visibleRowIds.value.forEach((rowId) => currentSelection.add(rowId));
      } else {
        visibleRowIds.value.forEach((rowId) => currentSelection.delete(rowId));
      }

      grid.setSelectedRows([...currentSelection]);
    };
    const startCellEdit = (
      rowNode: RowNode<unknown>,
      column: ResolvedColumnDef<unknown>,
    ) => {
      if (!canEditCell(rowNode, column) || column.editor === "checkbox") {
        return;
      }

      const value = column.accessor(rowNode.original);
      activeEdit.value = {
        rowId: rowNode.id,
        columnId: column.id,
        draft: getEditorDraftValue(column, value),
      };
    };
    const updateDraft = (draft: string) => {
      if (!activeEdit.value) {
        return;
      }

      activeEdit.value = {
        ...activeEdit.value,
        draft,
      };
    };
    const cancelCellEdit = () => {
      activeEdit.value = undefined;
    };
    const commitCellEdit = (
      rowNode: RowNode<unknown>,
      column: ResolvedColumnDef<unknown>,
      reason: YoupGridCellEditCommitReason,
      draft = activeEdit.value?.draft,
    ) => {
      if (activeEdit.value?.rowId !== rowNode.id || activeEdit.value.columnId !== column.id) {
        return;
      }

      if (!canEditCell(rowNode, column) || draft === undefined) {
        cancelCellEdit();
        return;
      }

      const value = parseEditorValue(column, draft, rowNode.original);
      const previousValue = column.accessor(rowNode.original);
      const change = createCellValueChange(rowNode, column, value, previousValue);

      emit("cellEditCommit", {
        ...change,
        reason,
      });

      if (!Object.is(value, previousValue)) {
        emit("cellValueChange", change);
      }

      cancelCellEdit();
    };
    const commitCheckboxEdit = (
      rowNode: RowNode<unknown>,
      column: ResolvedColumnDef<unknown>,
      checked: boolean,
    ) => {
      if (!canEditCell(rowNode, column)) {
        return;
      }

      const previousValue = column.accessor(rowNode.original);
      const change = createCellValueChange(rowNode, column, checked, previousValue);

      emit("cellEditCommit", {
        ...change,
        reason: "blur",
      });

      if (Object.is(checked, previousValue)) {
        return;
      }

      emit("cellValueChange", change);
    };
    const emitCellValueChanges = (
      changes: YoupGridCellValueChange<unknown>[],
      source: YoupGridCellValueChange<unknown>["source"],
    ) => {
      if (changes.length === 0) {
        return;
      }

      for (const change of changes) {
        emit("cellValueChange", change);
      }

      if (source === "paste" || source === "fill") {
        emit("cellsValueChange", {
          changes,
          source,
        });
      }
    };
    const applyCellValueChange = (
      rowNode: RowNode<unknown>,
      column: ResolvedColumnDef<unknown>,
      value: unknown,
      source: YoupGridCellValueChange<unknown>["source"],
    ) => {
      if (!canEditCell(rowNode, column)) {
        return;
      }

      const previousValue = column.accessor(rowNode.original);

      if (Object.is(value, previousValue)) {
        return;
      }

      const change = createCellValueChange(rowNode, column, value, previousValue, source);

      emitCellValueChanges([change], source);
    };
    const pasteClipboardText = (
      text: string,
      rowNode: RowNode<unknown>,
      columnIndex: number,
    ) => {
      const values = parseClipboardText(text);

      if (!gridEditable.value || values.length === 0) {
        return false;
      }

      const visibleRows = grid.rowModel.value.visibleRows;
      const startRowIndex = getVisibleRowIndex(visibleRows, rowNode.id);
      let pasteRows = visibleRows;
      let insertedRows: PendingClipboardRowInsert<unknown>[] = [];
      let rowsAfterInsert: unknown[] | undefined;
      const missingRowCount = getClipboardPasteMissingRowCount({
        rows: visibleRows,
        values,
        startRowIndex,
      });

      if (missingRowCount > 0 && props.createRow) {
        const inserted = createClipboardPasteRows({
          sourceRows: props.rows,
          visibleRows,
          missingRowCount,
          createRow: props.createRow,
          getRowId: props.getRowId,
        });

        if (inserted) {
          insertedRows = inserted.insertedRows;
          rowsAfterInsert = inserted.rows;
          pasteRows = [
            ...visibleRows,
            ...insertedRows.map((insertedRow) => insertedRow.rowNode),
          ];
        }
      }

      const changes: YoupGridCellValueChange<unknown>[] = [];
      const insertedRowIds = new Set(insertedRows.map((insertedRow) => insertedRow.rowNode.id));

      for (const cell of getClipboardPasteCells({
        values,
        startCell: { rowIndex: startRowIndex, columnIndex },
        rowCount: pasteRows.length,
        columnCount: visibleColumns.value.length,
      })) {
        const targetRowNode = pasteRows[cell.rowIndex];
        const column = visibleColumns.value[cell.columnIndex];

        if (!targetRowNode || !column || !canEditCell(targetRowNode, column)) {
          continue;
        }

        const previousValue = column.accessor(targetRowNode.original);
        const value = parseEditorValue(column, cell.value, targetRowNode.original);

        if (insertedRowIds.has(targetRowNode.id) && isSameRowIdValue(previousValue, targetRowNode.id)) {
          continue;
        }

        if (Object.is(value, previousValue)) {
          continue;
        }

        changes.push(createCellValueChange(targetRowNode, column, value, previousValue, "paste"));
      }

      if (insertedRows.length > 0 && rowsAfterInsert) {
        const rowsChange = applyClipboardInsertedRowValues({
          rows: rowsAfterInsert,
          insertedRows,
          changes,
        });

        emit("rowsChange", {
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

      emitCellValueChanges(changes, "paste");
      return true;
    };
    const setDensity = (nextDensity: YoupGridDensity) => {
      if (props.density === undefined) {
        internalDensity.value = nextDensity;
      }

      props.onDensityChange?.(nextDensity);
      emit("densityChange", nextDensity);
    };
    const exportCsv = () => {
      downloadTextFile({
        fileName: props.csvFileName ?? "youp-grid.csv",
        mimeType: "text/csv;charset=utf-8",
        text: exportGridCsv({
          rows: grid.rowModel.value.visibleRows,
          columns: visibleColumns.value,
        }),
      });
    };
    const exportExcel = () => {
      downloadTextFile({
        fileName: props.excelFileName ?? "youp-grid.xls",
        mimeType: "application/vnd.ms-excel;charset=utf-8",
        text: exportGridExcel({
          rows: grid.rowModel.value.visibleRows,
          columns: visibleColumns.value,
        }),
      });
    };
    const closeCellContextMenu = () => {
      activeCellContextMenu.value = undefined;
    };
    const openCellContextMenu = (
      event: MouseEvent,
      rowNode: RowNode<unknown>,
      column: ResolvedColumnDef<unknown>,
      columnIndex: number,
    ) => {
      if (!props.showCellContextMenu || activeEdit.value) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      activeCellContextMenu.value = {
        rowNode,
        column,
        columnIndex,
        clientX: event.clientX,
        clientY: event.clientY,
      };
    };
    watch(activeCellContextMenu, (menu, _previous, onCleanup) => {
      if (!menu || typeof document === "undefined") {
        return;
      }

      const closeMenu = (event: MouseEvent) => {
        if (event.target instanceof Node && cellContextMenuRef.value?.contains(event.target)) {
          return;
        }

        activeCellContextMenu.value = undefined;
      };
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          activeCellContextMenu.value = undefined;
        }
      };

      document.addEventListener("click", closeMenu);
      document.addEventListener("contextmenu", closeMenu);
      document.addEventListener("keydown", handleKeyDown);
      onCleanup(() => {
        document.removeEventListener("click", closeMenu);
        document.removeEventListener("contextmenu", closeMenu);
        document.removeEventListener("keydown", handleKeyDown);
      });
    });
    watch(
      activeCellContextMenu,
      () => {
        void nextTick(() => {
          const menu = activeCellContextMenu.value;
          const menuElement = cellContextMenuRef.value;

          if (!menu || !menuElement) {
            return;
          }

          const menuRect = menuElement.getBoundingClientRect();
          const placement = getClampedContextMenuPlacement({
            anchorX: menu.clientX,
            anchorY: menu.clientY,
            menuWidth: menuRect.width,
            menuHeight: menuRect.height,
          });

          if (menu.placement?.x === placement.x && menu.placement.y === placement.y) {
            return;
          }

          activeCellContextMenu.value = { ...menu, placement };
        });
      },
      { flush: "post" },
    );
    const copyCellContextMenuCell = () => {
      const menu = activeCellContextMenu.value;

      if (!menu) {
        return;
      }

      const value = menu.column.accessor(menu.rowNode.original);
      void writeClipboardText(formatCellValue(menu.column, value, menu.rowNode.original))
        .catch(() => undefined);
    };
    const pasteCellContextMenuCell = () => {
      const menu = activeCellContextMenu.value;

      if (!menu || !canEditCell(menu.rowNode, menu.column)) {
        return;
      }

      void readClipboardText()
        .then((text) => {
          const value = parseEditorValue(
            menu.column,
            getFirstClipboardCell(text),
            menu.rowNode.original,
          );
          applyCellValueChange(menu.rowNode, menu.column, value, "paste");
        })
        .catch(() => undefined);
    };
    const clearCellContextMenuCell = () => {
      const menu = activeCellContextMenu.value;

      if (!menu) {
        return;
      }

      applyCellValueChange(
        menu.rowNode,
        menu.column,
        parseEditorValue(menu.column, "", menu.rowNode.original),
        "delete",
      );
    };
    const selectCellContextMenuRow = () => {
      const menu = activeCellContextMenu.value;

      if (menu) {
        grid.setRowSelected(menu.rowNode.id, true);
      }
    };
    const clearCellContextMenuRowSelection = () => {
      grid.setSelectedRows([]);
    };
    const getCellContextMenuTargetRows = () => {
      const menu = activeCellContextMenu.value;

      if (!menu) {
        return [];
      }

      if (selectedRowIds.value.has(menu.rowNode.id)) {
        return grid.rowModel.value.visibleRows.filter((row): row is RowNode<unknown> => {
          return !isGroupNode(row) && selectedRowIds.value.has(row.id);
        });
      }

      return [menu.rowNode];
    };
    const copyCellContextMenuRows = () => {
      const targetRows = getCellContextMenuTargetRows();

      if (targetRows.length === 0) {
        return;
      }

      const visibleRowIndexByRowId = new Map<GridRowId, number>();

      grid.rowModel.value.visibleRows.forEach((row, index) => {
        if (!isGroupNode(row)) {
          visibleRowIndexByRowId.set(row.id, index);
        }
      });

      rowClipboard.value = targetRows.map((row) => ({
        row: row.original,
        rowId: row.id,
        rowIndex: row.index,
        visibleRowIndex: visibleRowIndexByRowId.get(row.id) ?? row.index,
      }));
    };
    const insertCellContextMenuRow = (position: YoupGridRowInsertPosition) => {
      const menu = activeCellContextMenu.value;

      if (!menu || !gridEditable.value || !props.createRow) {
        return;
      }

      const rowIndex = menu.rowNode.index + (position === "below" ? 1 : 0);
      const visibleRowIndex = getVisibleRowIndex(grid.rowModel.value.visibleRows, menu.rowNode.id) +
        (position === "below" ? 1 : 0);
      const row = props.createRow({
        rows: props.rows,
        rowIndex,
        visibleRowIndex,
        position,
        anchorRow: menu.rowNode.original,
        anchorRowId: menu.rowNode.id,
        anchorRowIndex: menu.rowNode.index,
      });

      emit("rowsChange", {
        rows: [
          ...props.rows.slice(0, rowIndex),
          row,
          ...props.rows.slice(rowIndex),
        ],
        changes: [{
          type: "insert",
          row,
          rowIndex,
          visibleRowIndex,
          position,
          anchorRow: menu.rowNode.original,
          anchorRowId: menu.rowNode.id,
          anchorRowIndex: menu.rowNode.index,
        }],
        source: "context-menu",
      });
    };
    const pasteCellContextMenuRows = () => {
      const menu = activeCellContextMenu.value;

      if (!menu || !gridEditable.value || !props.createRow || rowClipboard.value.length === 0) {
        return;
      }

      const createRow = props.createRow;
      const rowIndex = menu.rowNode.index + 1;
      const visibleRowIndex = getVisibleRowIndex(grid.rowModel.value.visibleRows, menu.rowNode.id) + 1;
      const insertedRows = rowClipboard.value.map((source, offset) => {
        const nextRowIndex = rowIndex + offset;
        const nextVisibleRowIndex = visibleRowIndex + offset;
        const row = createPastedRow({
          row: createRow({
            rows: props.rows,
            rowIndex: nextRowIndex,
            visibleRowIndex: nextVisibleRowIndex,
            position: "below",
            anchorRow: menu.rowNode.original,
            anchorRowId: menu.rowNode.id,
            anchorRowIndex: menu.rowNode.index,
            reason: "paste",
            sourceRow: source.row,
            sourceRowId: source.rowId,
            sourceRowIndex: source.rowIndex,
            sourceVisibleRowIndex: source.visibleRowIndex,
          }),
          rowIndex: nextRowIndex,
          sourceRow: source.row,
          sourceRowId: source.rowId,
          columns: visibleColumns.value,
          getRowId: props.getRowId,
        });

        return {
          row,
          rowIndex: nextRowIndex,
          visibleRowIndex: nextVisibleRowIndex,
          source,
        };
      });

      emit("rowsChange", {
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
          anchorRow: menu.rowNode.original,
          anchorRowId: menu.rowNode.id,
          anchorRowIndex: menu.rowNode.index,
          reason: "paste",
          sourceRow: source.row,
          sourceRowId: source.rowId,
          sourceRowIndex: source.rowIndex,
          sourceVisibleRowIndex: source.visibleRowIndex,
        })),
        source: "context-menu",
      });
    };
    const deleteCellContextMenuRows = () => {
      if (!gridEditable.value) {
        return;
      }

      const targetRows = getCellContextMenuTargetRows();

      if (targetRows.length === 0) {
        return;
      }

      const visibleRowIndexByRowId = new Map<GridRowId, number>();
      grid.rowModel.value.visibleRows.forEach((row, index) => {
        if (!isGroupNode(row)) {
          visibleRowIndexByRowId.set(row.id, index);
        }
      });

      const deleteRowIds = new Set(targetRows.map((row) => row.id));
      const deleteRowIndexes = new Set(targetRows.map((row) => row.index));

      emit("rowsChange", {
        rows: props.rows.filter((_, index) => !deleteRowIndexes.has(index)),
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
      grid.setSelectedRows((grid.state.value.selectedRowIds ?? []).filter((rowId) => !deleteRowIds.has(rowId)));
    };
    const autoSizeCellContextMenuColumn = () => {
      const menu = activeCellContextMenu.value;

      if (!menu) {
        return;
      }

      grid.setColumnWidth(
        menu.column.id,
        getAutoSizeColumnWidth({
          column: menu.column,
          rows: grid.rowModel.value.visibleRows,
        }),
      );
    };

    return () => {
      const rowModel = grid.rowModel.value;
      const columns = visibleColumns.value;
      const templateColumns = gridTemplateColumns.value;
      const cellContextMenu = activeCellContextMenu.value;
      const pagination = paginationOptions.value;
      const paginationState = grid.state.value.pagination;
      const pageSize = paginationState?.pageSize ?? pagination?.pageSizeOptions[0] ?? DEFAULT_PAGE_SIZE;
      const pageCount = getPageCount(rowModel.pageCount, rowModel.filteredRowCount, pageSize);
      const pageIndex = getPageIndex(paginationState?.pageIndex, pageCount);
      const cellContextMenuNode = renderCellContextMenu({
        state: cellContextMenu,
        menuRef: cellContextMenuRef,
        editable: cellContextMenu
          ? canEditCell(cellContextMenu.rowNode, cellContextMenu.column)
          : false,
        hasSelectedRows: selectedRowIds.value.size > 0,
        copy: copyCellContextMenuCell,
        paste: pasteCellContextMenuCell,
        clearContents: clearCellContextMenuCell,
        selectRow: selectCellContextMenuRow,
        clearRowSelection: clearCellContextMenuRowSelection,
        copyRows: copyCellContextMenuRows,
        pasteRows: pasteCellContextMenuRows,
        insertRowAbove: () => insertCellContextMenuRow("above"),
        insertRowBelow: () => insertCellContextMenuRow("below"),
        deleteRows: deleteCellContextMenuRows,
        autoSizeColumn: autoSizeCellContextMenuColumn,
        canInsertRows: Boolean(props.createRow && gridEditable.value),
        canPasteRows: Boolean(props.createRow && gridEditable.value && rowClipboard.value.length > 0),
        canDeleteRows: gridEditable.value && getCellContextMenuTargetRows().length > 0,
        copyRowsLabel: getCellContextMenuTargetRows().length > 1 ? "Copy selected rows" : "Copy row",
        pasteRowsLabel: rowClipboard.value.length > 1
          ? `Paste ${rowClipboard.value.length} rows below`
          : "Paste row below",
        deleteRowCount: getCellContextMenuTargetRows().length,
        closeMenu: closeCellContextMenu,
      });
      const cellContextMenuPortal = cellContextMenuNode
        ? h(Teleport, { to: "body" }, [cellContextMenuNode])
        : undefined;

      return h(
        "div",
        {
          ref: rootRef,
          class: [
            "youp-grid-vue",
            `youp-grid-vue--density-${density.value}`,
            !gridEditable.value ? "youp-grid-vue--read-only" : undefined,
            props.showRowNumberColumn ? "youp-grid-vue--row-number-column" : undefined,
            props.showRowSelectionColumn && props.pinRowSelectionColumn
              ? "youp-grid-vue--selection-column-pinned"
              : undefined,
            props.className,
          ],
          role: "grid",
          "aria-colcount": columns.length + leadingColumnCount.value,
          "aria-rowcount": rowModel.totalRowCount,
          onClick: closeCellContextMenu,
          onKeydown: (event: KeyboardEvent) => {
            if (event.key === "Escape") {
              closeCellContextMenu();
            }
          },
        },
        [
          renderColumnToolbar({
            showColumnChooser: props.showColumnChooser ?? true,
            showCsvExport: props.showCsvExport ?? true,
            showExcelExport: props.showExcelExport ?? true,
            showDensityControl: props.showDensityControl ?? true,
            density: density.value,
            open: columnChooserOpen.value,
            columns: grid.rowModel.value.columns,
            toggleOpen: () => {
              columnChooserOpen.value = !columnChooserOpen.value;
            },
            setDensity,
            setColumnHidden: grid.setColumnHidden,
            setColumnPinned: grid.setColumnPinned,
            exportCsv,
            exportExcel,
          }),
          h("div", { class: "youp-grid-vue__viewport" }, [
            h(
              "div",
              {
                class: ["youp-grid-vue__row", "youp-grid-vue__row--header"],
                role: "row",
                style: { gridTemplateColumns: templateColumns },
              },
              [
                props.showRowNumberColumn ? renderRowNumberHeaderCell() : undefined,
                props.showRowSelectionColumn
                  ? renderSelectionHeaderCell({
                      ariaColIndex: props.showRowNumberColumn ? 2 : 1,
                      checked: allVisibleRowsSelected.value,
                      mixed: someVisibleRowsSelected.value,
                      disabled: visibleRowIds.value.length === 0,
                      leftOffset: selectionColumnOffset.value,
                      onToggleSelected: setVisibleRowsSelected,
                    })
                  : undefined,
                ...columns.map((column, columnIndex) =>
                  renderHeaderCell({
                    column,
                    columnIndex,
                    ariaColumnOffset: leadingColumnCount.value,
                    sortDirection: getSortDirection(grid.state.value, column.id),
                    sortOnHeaderClick: props.sortOnHeaderClick,
                    slots,
                    onToggleSort: () => grid.toggleSort(column.id),
                    filterValue: getFilterValue(grid.state.value, column.id),
                    showFilter: props.showFilters ?? true,
                    setFilter: (value) => {
                      if (value) {
                        grid.setFilter(column.id, value);
                      } else {
                        grid.clearFilter(column.id);
                      }
                    },
                    resizeColumn: (width) => grid.setColumnWidth(column.id, width),
                    autoSizeColumn: () =>
                      grid.setColumnWidth(
                        column.id,
                        getAutoSizeColumnWidth({
                          column,
                          rows: rowModel.visibleRows,
                        }),
                      ),
                  }),
                ),
              ],
            ),
            rowModel.displayRows.length > 0
              ? rowModel.displayRows.map((displayNode, displayIndex) =>
                  renderDisplayRow({
                    displayNode,
                    displayIndex,
                    columns,
                    leadingColumnCount: leadingColumnCount.value,
                    templateColumns,
                    showRowNumberColumn: props.showRowNumberColumn,
                    showRowSelectionColumn: props.showRowSelectionColumn,
                    selectionColumnOffset: selectionColumnOffset.value,
                    selectedRowIds: selectedRowIds.value,
                    slots,
                    onToggleGroup: (groupId) => grid.toggleRowGroupExpanded(groupId),
                    onToggleTreeRow: (rowId) => grid.toggleTreeRowExpanded(rowId),
                    onSetRowSelected: (rowId, selected) => grid.setRowSelected(rowId, selected),
                    onRowClick: (event) => emit("rowClick", event),
                    onRowDoubleClick: (event) => emit("rowDoubleClick", event),
                    activeEdit: activeEdit.value,
                    activeTooltipCellKey: activeTooltipCellKey.value,
                    cellTooltipMode: cellTooltipMode.value,
                    canEditCell,
                    pasteClipboardText,
                    getCellMeta,
                    setActiveTooltipCellKey,
                    startCellEdit,
                    updateDraft,
                    cancelCellEdit,
                    commitCellEdit,
                    commitCheckboxEdit,
                    openCellContextMenu,
                  }),
                )
              : h(
                  "div",
                  {
                    class: "youp-grid-vue__empty",
                    role: "row",
                  },
                  props.emptyText,
                ),
          ]),
          pagination
            ? renderPaginationFooter({
                pageIndex,
                pageSize,
                pageCount,
                rowCount: rowModel.filteredRowCount,
                visibleRowCount: rowModel.visibleRowCount,
                pageSizeOptions: pagination.pageSizeOptions,
                onPageChange: grid.setPage,
                onPageSizeChange: grid.setPageSize,
              })
            : undefined,
          cellContextMenuPortal,
        ],
      );
    };
  },
});

function withDefaultPagination(
  state: GridState | undefined,
  pagination: boolean | YoupGridPaginationOptions | undefined,
): GridState | undefined {
  const options = normalizePaginationOptions(pagination);

  if (!options || state?.pagination) {
    return state;
  }

  return {
    ...state,
    pagination: {
      pageIndex: 0,
      pageSize: options.pageSizeOptions[0] ?? DEFAULT_PAGE_SIZE,
    },
  };
}

function normalizePaginationOptions(
  pagination: boolean | YoupGridPaginationOptions | undefined,
): NormalizedPaginationOptions | undefined {
  if (!pagination) {
    return undefined;
  }

  if (pagination === true) {
    return { pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS };
  }

  const pageSizeOptions = normalizePageSizeOptions(pagination.pageSizeOptions);
  return { pageSizeOptions };
}

function normalizePageSizeOptions(options?: readonly number[]): readonly number[] {
  const source = options && options.length > 0 ? options : DEFAULT_PAGE_SIZE_OPTIONS;
  const values = source
    .map((value) => Math.trunc(value))
    .filter((value) => Number.isFinite(value) && value > 0);

  return [...new Set(values)];
}

function getPageCount(pageCount: number | undefined, rowCount: number, pageSize: number): number {
  return Math.max(1, pageCount ?? Math.ceil(Math.max(0, rowCount) / Math.max(1, pageSize)));
}

function getPageIndex(pageIndex: number | undefined, pageCount: number): number {
  return clamp(Math.trunc(pageIndex ?? 0), 0, Math.max(0, pageCount - 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function renderPaginationFooter(context: PaginationRenderContext) {
  const canMovePrevious = context.pageIndex > 0;
  const canMoveNext = context.pageIndex < context.pageCount - 1;
  const rowRange = getPaginationRowRange(
    context.rowCount,
    context.pageIndex,
    context.pageSize,
    context.visibleRowCount,
  );
  const pageSizeOptions = normalizePageSizeOptions([
    ...context.pageSizeOptions,
    context.pageSize,
  ]);

  return h(
    "div",
    {
      class: "youp-grid-vue__pagination",
      role: "navigation",
      "aria-label": "Pagination",
    },
    [
      h(
        "div",
        { class: "youp-grid-vue__pagination-status" },
        `${rowRange.start}-${rowRange.end} / ${context.rowCount}`,
      ),
      h("div", { class: "youp-grid-vue__pagination-controls" }, [
        h(
          "select",
          {
            class: "youp-grid-vue__pagination-size",
            value: context.pageSize,
            "aria-label": "Rows per page",
            onChange: (event: Event) => {
              const target = event.currentTarget as HTMLSelectElement | null;
              const pageSize = Number(target?.value);

              if (Number.isFinite(pageSize) && pageSize > 0) {
                context.onPageSizeChange(pageSize);
              }
            },
          },
          pageSizeOptions.map((pageSize) =>
            h("option", { value: pageSize }, String(pageSize)),
          ),
        ),
        h(
          "button",
          {
            type: "button",
            class: "youp-grid-vue__pagination-button",
            disabled: !canMovePrevious,
            "aria-label": "Previous page",
            onClick: () => context.onPageChange(context.pageIndex - 1),
          },
          "<",
        ),
        h(
          "span",
          { class: "youp-grid-vue__pagination-page" },
          `${context.pageIndex + 1} / ${context.pageCount}`,
        ),
        h(
          "button",
          {
            type: "button",
            class: "youp-grid-vue__pagination-button",
            disabled: !canMoveNext,
            "aria-label": "Next page",
            onClick: () => context.onPageChange(context.pageIndex + 1),
          },
          ">",
        ),
      ]),
    ],
  );
}

function getPaginationRowRange(
  rowCount: number,
  pageIndex: number,
  pageSize: number,
  visibleRowCount: number,
): { start: number; end: number } {
  if (rowCount <= 0) {
    return { start: 0, end: 0 };
  }

  const start = pageIndex * pageSize + 1;
  const visibleCount = visibleRowCount > 0 ? visibleRowCount : pageSize;

  return {
    start,
    end: Math.min(rowCount, start + visibleCount - 1),
  };
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

  return h(
    "div",
    { class: "youp-grid-vue__toolbar" },
    [
      context.showColumnChooser
        ? h(
            "button",
            {
              type: "button",
              class: "youp-grid-vue__toolbar-button",
              "aria-expanded": context.open,
              onClick: context.toggleOpen,
            },
            "Columns",
          )
        : undefined,
      context.showCsvExport
        ? h(
            "button",
            {
              type: "button",
              class: "youp-grid-vue__toolbar-button",
              onClick: context.exportCsv,
            },
            "Export CSV",
          )
        : undefined,
      context.showExcelExport
        ? h(
            "button",
            {
              type: "button",
              class: "youp-grid-vue__toolbar-button",
              onClick: context.exportExcel,
            },
            "Export Excel",
          )
        : undefined,
      context.showDensityControl
        ? h(
            "label",
            { class: "youp-grid-vue__density-control" },
            [
              "Density",
              h(
                "select",
                {
                  value: context.density,
                  onChange: (event: Event) => {
                    const target = event.currentTarget as HTMLSelectElement | null;
                    context.setDensity((target?.value ?? "standard") as YoupGridDensity);
                  },
                },
                [
                  renderDensityOption("compact", "Compact"),
                  renderDensityOption("standard", "Standard"),
                  renderDensityOption("comfortable", "Comfortable"),
                ],
              ),
            ],
          )
        : undefined,
      context.showColumnChooser && context.open
        ? h(
            "div",
            { class: "youp-grid-vue__column-panel" },
            context.columns.map((column) =>
              h(
                "div",
                { key: column.id, class: "youp-grid-vue__column-panel-row" },
                [
                  h(
                    "label",
                    { class: "youp-grid-vue__column-toggle" },
                    [
                      h("input", {
                        type: "checkbox",
                        checked: !column.hidden,
                        onChange: (event: Event) => {
                          const target = event.currentTarget as HTMLInputElement | null;
                          context.setColumnHidden(column.id, !Boolean(target?.checked));
                        },
                      }),
                      column.headerName,
                    ],
                  ),
                  h(
                    "div",
                    {
                      class: "youp-grid-vue__pin-controls",
                      role: "group",
                      "aria-label": `Pin ${column.headerName}`,
                    },
                    [
                      renderPinButton(column, undefined, "None", context.setColumnPinned),
                      renderPinButton(column, "left", "Left", context.setColumnPinned),
                      renderPinButton(column, "right", "Right", context.setColumnPinned),
                    ],
                  ),
                ],
              ),
            ),
          )
        : undefined,
    ],
  );
}

function renderDensityOption(value: YoupGridDensity, label: string) {
  return h("option", { value }, label);
}

function renderPinButton<TRow>(
  column: ResolvedColumnDef<TRow>,
  pin: ColumnPin | undefined,
  label: string,
  setColumnPinned: (columnId: string, pinned: ColumnPin | undefined) => void,
) {
  const active = column.pinned === pin || (!column.pinned && pin === undefined);

  return h(
    "button",
    {
      type: "button",
      class: [
        "youp-grid-vue__pin-button",
        active ? "youp-grid-vue__pin-button--active" : undefined,
      ],
      "aria-pressed": String(active),
      onClick: () => setColumnPinned(column.id, pin),
    },
    label,
  );
}

function renderRowNumberHeaderCell() {
  return h(
    "div",
    {
      class: [
        "youp-grid-vue__cell",
        "youp-grid-vue__cell--header",
        "youp-grid-vue__row-number-cell",
      ],
      role: "columnheader",
      "aria-colindex": 1,
      "aria-label": "Row number",
      style: getRowNumberCellStyle(),
    },
    "#",
  );
}

function renderSelectionHeaderCell(context: {
  ariaColIndex: number;
  checked: boolean;
  mixed: boolean;
  disabled: boolean;
  leftOffset: number;
  onToggleSelected: (selected: boolean) => void;
}) {
  return h(
    "div",
    {
      class: [
        "youp-grid-vue__cell",
        "youp-grid-vue__cell--header",
        "youp-grid-vue__selection-cell",
      ],
      role: "columnheader",
      "aria-colindex": context.ariaColIndex,
      "aria-label": "Row selection",
      style: getSelectionCellStyle(context.leftOffset),
    },
    h("input", {
      type: "checkbox",
      class: "youp-grid-vue__selection-checkbox",
      checked: context.checked,
      disabled: context.disabled,
      "aria-label": "Select visible rows",
      "aria-checked": context.mixed ? "mixed" : String(context.checked),
      onClick: (event: MouseEvent) => event.stopPropagation(),
      onChange: (event: Event) => {
        const target = event.currentTarget as HTMLInputElement | null;
        context.onToggleSelected(Boolean(target?.checked));
      },
    }),
  );
}

function renderHeaderCell<TRow>(context: {
  column: ResolvedColumnDef<TRow>;
  columnIndex: number;
  ariaColumnOffset: number;
  sortDirection?: SortDirection;
  sortOnHeaderClick: boolean;
  slots: Slots;
  onToggleSort: () => void;
  filterValue: string;
  showFilter: boolean;
  setFilter: (value: string) => void;
  resizeColumn: (width: number) => void;
  autoSizeColumn: () => void;
}) {
  const align = getColumnAlign(context.column);
  const slotContext: YoupGridHeaderSlotContext<TRow> = {
    column: context.column,
    columnId: context.column.id,
    columnIndex: context.columnIndex,
    align,
    sortDirection: context.sortDirection,
    resizeColumn: context.resizeColumn,
    autoSizeColumn: context.autoSizeColumn,
  };
  const content = renderHeaderSlot(context.slots, slotContext, context.column.headerName);
  const sortable = context.sortOnHeaderClick && context.column.sortable !== false;
  const showFilter = context.showFilter && context.column.filterable !== false;
  const headerControl = sortable
    ? h(
        "button",
        {
          type: "button",
          class: "youp-grid-vue__header-button",
          onClick: context.onToggleSort,
        },
        [
          h("span", { class: "youp-grid-vue__header-label" }, content),
          context.sortDirection
            ? h(
                "span",
                { class: "youp-grid-vue__sort-indicator" },
                context.sortDirection,
              )
            : undefined,
        ],
      )
    : h(
        "span",
        { class: ["youp-grid-vue__header-label", "youp-grid-vue__header-label--static"] },
        content,
      );

  return h(
    "div",
    {
      class: [
        "youp-grid-vue__cell",
        "youp-grid-vue__cell--header",
        `youp-grid-vue__cell--align-${align}`,
      ],
      role: "columnheader",
      "aria-colindex": context.ariaColumnOffset + context.columnIndex + 1,
      "aria-sort": getAriaSort(context.sortDirection),
    },
    [
      headerControl,
      showFilter
        ? h("input", {
            class: "youp-grid-vue__filter-input",
            value: context.filterValue,
            placeholder: "Filter",
            "aria-label": `Filter ${context.column.headerName}`,
            onClick: (event: MouseEvent) => event.stopPropagation(),
            onDblclick: (event: MouseEvent) => event.stopPropagation(),
            onInput: (event: Event) => {
              const target = event.currentTarget as HTMLInputElement | null;
              context.setFilter(target?.value ?? "");
            },
          })
        : undefined,
      h("span", {
        class: "youp-grid-vue__column-resizer",
        role: "separator",
        "aria-orientation": "vertical",
        onMousedown: (event: MouseEvent) =>
          startColumnResizeDrag(event, {
            column: context.column,
            resizeColumn: context.resizeColumn,
          }),
        onDblclick: (event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          context.autoSizeColumn();
        },
      }),
    ],
  );
}

function renderDisplayRow<TRow>(context: {
  displayNode: RowDisplayNode<TRow>;
  displayIndex: number;
  columns: readonly ResolvedColumnDef<TRow>[];
  leadingColumnCount: number;
  templateColumns: string;
  showRowNumberColumn: boolean;
  showRowSelectionColumn: boolean;
  selectionColumnOffset: number;
  selectedRowIds: ReadonlySet<GridRowId>;
  slots: Slots;
  onToggleGroup: (groupId: string) => void;
  onToggleTreeRow: (rowId: GridRowId) => void;
  onSetRowSelected: (rowId: GridRowId, selected: boolean) => void;
  onRowClick: (event: YoupGridRowEvent<TRow>) => void;
  onRowDoubleClick: (event: YoupGridRowEvent<TRow>) => void;
  activeEdit?: ActiveEdit;
  activeTooltipCellKey?: string;
  cellTooltipMode: YoupGridCellTooltipMode;
  canEditCell: (rowNode: RowNode<TRow>, column: ResolvedColumnDef<TRow>) => boolean;
  pasteClipboardText: (
    text: string,
    rowNode: RowNode<TRow>,
    columnIndex: number,
  ) => boolean;
  getCellMeta: (
    rowNode: RowNode<TRow>,
    column: ResolvedColumnDef<TRow>,
  ) => YoupGridCellMeta | undefined;
  setActiveTooltipCellKey: (cellKey?: string) => void;
  startCellEdit: (rowNode: RowNode<TRow>, column: ResolvedColumnDef<TRow>) => void;
  updateDraft: (draft: string) => void;
  cancelCellEdit: () => void;
  commitCellEdit: (
    rowNode: RowNode<TRow>,
    column: ResolvedColumnDef<TRow>,
    reason: YoupGridCellEditCommitReason,
    draft?: string,
  ) => void;
  commitCheckboxEdit: (
    rowNode: RowNode<TRow>,
    column: ResolvedColumnDef<TRow>,
    checked: boolean,
  ) => void;
  openCellContextMenu: (
    event: MouseEvent,
    rowNode: RowNode<TRow>,
    column: ResolvedColumnDef<TRow>,
    columnIndex: number,
  ) => void;
}) {
  if (isGroupNode(context.displayNode)) {
    return renderGroupRow({
      displayNode: context.displayNode,
      displayIndex: context.displayIndex,
      columns: context.columns,
      leadingColumnCount: context.leadingColumnCount,
      templateColumns: context.templateColumns,
      onToggleGroup: context.onToggleGroup,
    });
  }

  return renderDataRow({
    rowNode: context.displayNode,
    displayIndex: context.displayIndex,
    columns: context.columns,
    leadingColumnCount: context.leadingColumnCount,
    templateColumns: context.templateColumns,
    showRowNumberColumn: context.showRowNumberColumn,
    showRowSelectionColumn: context.showRowSelectionColumn,
    selectionColumnOffset: context.selectionColumnOffset,
    selected: context.selectedRowIds.has(context.displayNode.id),
    slots: context.slots,
    onToggleTreeRow: context.onToggleTreeRow,
    onSetRowSelected: context.onSetRowSelected,
    onRowClick: context.onRowClick,
    onRowDoubleClick: context.onRowDoubleClick,
    activeEdit: context.activeEdit,
    activeTooltipCellKey: context.activeTooltipCellKey,
    cellTooltipMode: context.cellTooltipMode,
    canEditCell: context.canEditCell,
    pasteClipboardText: context.pasteClipboardText,
    getCellMeta: context.getCellMeta,
    setActiveTooltipCellKey: context.setActiveTooltipCellKey,
    startCellEdit: context.startCellEdit,
    updateDraft: context.updateDraft,
    cancelCellEdit: context.cancelCellEdit,
    commitCellEdit: context.commitCellEdit,
    commitCheckboxEdit: context.commitCheckboxEdit,
    openCellContextMenu: context.openCellContextMenu,
  });
}

function renderGroupRow<TRow>(context: {
  displayNode: RowGroupNode;
  displayIndex: number;
  columns: readonly ResolvedColumnDef<TRow>[];
  leadingColumnCount: number;
  templateColumns: string;
  onToggleGroup: (groupId: string) => void;
}) {
  return h(
    "div",
    {
      class: ["youp-grid-vue__row", "youp-grid-vue__row--group"],
      role: "row",
      "aria-rowindex": context.displayIndex + 2,
      style: { gridTemplateColumns: context.templateColumns },
    },
    h(
      "div",
      {
        class: "youp-grid-vue__group-cell",
        role: "gridcell",
        style: {
          gridColumn: `1 / span ${Math.max(
            context.columns.length + context.leadingColumnCount,
            1,
          )}`,
          paddingLeft: `${12 + context.displayNode.depth * 16}px`,
        },
      },
      h(
        "button",
        {
          type: "button",
          class: "youp-grid-vue__group-button",
          "aria-expanded": context.displayNode.expanded,
          onClick: () => context.onToggleGroup(context.displayNode.groupId),
        },
        [
          h("span", { class: "youp-grid-vue__expander" }, context.displayNode.expanded ? "-" : "+"),
          h("span", context.displayNode.label),
          h("span", { class: "youp-grid-vue__group-count" }, String(context.displayNode.rowCount)),
        ],
      ),
    ),
  );
}

function renderDataRow<TRow>(context: {
  rowNode: RowNode<TRow>;
  displayIndex: number;
  columns: readonly ResolvedColumnDef<TRow>[];
  leadingColumnCount: number;
  templateColumns: string;
  showRowNumberColumn: boolean;
  showRowSelectionColumn: boolean;
  selectionColumnOffset: number;
  selected: boolean;
  slots: Slots;
  onToggleTreeRow: (rowId: GridRowId) => void;
  onSetRowSelected: (rowId: GridRowId, selected: boolean) => void;
  onRowClick: (event: YoupGridRowEvent<TRow>) => void;
  onRowDoubleClick: (event: YoupGridRowEvent<TRow>) => void;
  activeEdit?: ActiveEdit;
  activeTooltipCellKey?: string;
  cellTooltipMode: YoupGridCellTooltipMode;
  canEditCell: (rowNode: RowNode<TRow>, column: ResolvedColumnDef<TRow>) => boolean;
  pasteClipboardText: (
    text: string,
    rowNode: RowNode<TRow>,
    columnIndex: number,
  ) => boolean;
  getCellMeta: (
    rowNode: RowNode<TRow>,
    column: ResolvedColumnDef<TRow>,
  ) => YoupGridCellMeta | undefined;
  setActiveTooltipCellKey: (cellKey?: string) => void;
  startCellEdit: (rowNode: RowNode<TRow>, column: ResolvedColumnDef<TRow>) => void;
  updateDraft: (draft: string) => void;
  cancelCellEdit: () => void;
  commitCellEdit: (
    rowNode: RowNode<TRow>,
    column: ResolvedColumnDef<TRow>,
    reason: YoupGridCellEditCommitReason,
    draft?: string,
  ) => void;
  commitCheckboxEdit: (
    rowNode: RowNode<TRow>,
    column: ResolvedColumnDef<TRow>,
    checked: boolean,
  ) => void;
  openCellContextMenu: (
    event: MouseEvent,
    rowNode: RowNode<TRow>,
    column: ResolvedColumnDef<TRow>,
    columnIndex: number,
  ) => void;
}) {
  return h(
    "div",
    {
      class: [
        "youp-grid-vue__row",
        context.selected ? "youp-grid-vue__row--selected" : undefined,
      ],
      role: "row",
      "aria-rowindex": context.displayIndex + 2,
      style: { gridTemplateColumns: context.templateColumns },
      onClick: (event: MouseEvent) =>
        context.onRowClick({
          row: context.rowNode.original,
          rowId: context.rowNode.id,
          rowIndex: context.rowNode.index,
          rowNode: context.rowNode,
          event,
        }),
      onDblclick: (event: MouseEvent) =>
        context.onRowDoubleClick({
          row: context.rowNode.original,
          rowId: context.rowNode.id,
          rowIndex: context.rowNode.index,
          rowNode: context.rowNode,
          event,
        }),
    },
    [
      context.showRowNumberColumn
        ? renderRowNumberCell({
            rowNode: context.rowNode,
            displayIndex: context.displayIndex,
          })
        : undefined,
      context.showRowSelectionColumn
        ? renderSelectionCell({
            rowNode: context.rowNode,
            ariaColIndex: context.showRowNumberColumn ? 2 : 1,
            selected: context.selected,
            leftOffset: context.selectionColumnOffset,
            onSetRowSelected: context.onSetRowSelected,
          })
        : undefined,
      ...context.columns.map((column, columnIndex) =>
        renderDataCell({
          rowNode: context.rowNode,
          column,
          columnIndex,
          ariaColumnOffset: context.leadingColumnCount,
          slots: context.slots,
          onToggleTreeRow: context.onToggleTreeRow,
          activeEdit: context.activeEdit,
          activeTooltipCellKey: context.activeTooltipCellKey,
          cellTooltipMode: context.cellTooltipMode,
          editable: context.canEditCell(context.rowNode, column),
          pasteClipboardText: context.pasteClipboardText,
          meta: context.getCellMeta(context.rowNode, column),
          setActiveTooltipCellKey: context.setActiveTooltipCellKey,
          startCellEdit: context.startCellEdit,
          updateDraft: context.updateDraft,
          cancelCellEdit: context.cancelCellEdit,
          commitCellEdit: context.commitCellEdit,
          commitCheckboxEdit: context.commitCheckboxEdit,
          openCellContextMenu: context.openCellContextMenu,
        }),
      ),
    ],
  );
}

function renderRowNumberCell<TRow>(context: {
  rowNode: RowNode<TRow>;
  displayIndex: number;
}) {
  return h(
    "div",
    {
      class: ["youp-grid-vue__cell", "youp-grid-vue__row-number-cell"],
      role: "gridcell",
      "aria-colindex": 1,
      "aria-label": `Row ${context.rowNode.index + 1}`,
      style: getRowNumberCellStyle(),
    },
    String(context.displayIndex + 1),
  );
}

function renderSelectionCell<TRow>(context: {
  rowNode: RowNode<TRow>;
  ariaColIndex: number;
  selected: boolean;
  leftOffset: number;
  onSetRowSelected: (rowId: GridRowId, selected: boolean) => void;
}) {
  return h(
    "div",
    {
      class: ["youp-grid-vue__cell", "youp-grid-vue__selection-cell"],
      role: "gridcell",
      "aria-colindex": context.ariaColIndex,
      style: getSelectionCellStyle(context.leftOffset),
    },
    h("input", {
      type: "checkbox",
      class: "youp-grid-vue__selection-checkbox",
      checked: context.selected,
      "aria-label": `Select row ${context.rowNode.index + 1}`,
      onClick: (event: MouseEvent) => event.stopPropagation(),
      onChange: (event: Event) => {
        const target = event.currentTarget as HTMLInputElement | null;
        context.onSetRowSelected(context.rowNode.id, Boolean(target?.checked));
      },
    }),
  );
}

function getRowNumberCellStyle() {
  return {
    left: "0px",
  };
}

function getSelectionCellStyle(leftOffset: number) {
  return {
    left: `${leftOffset}px`,
  };
}

function renderDataCell<TRow>(context: {
  rowNode: RowNode<TRow>;
  column: ResolvedColumnDef<TRow>;
  columnIndex: number;
  ariaColumnOffset: number;
  slots: Slots;
  onToggleTreeRow: (rowId: GridRowId) => void;
  activeEdit?: ActiveEdit;
  activeTooltipCellKey?: string;
  cellTooltipMode: YoupGridCellTooltipMode;
  editable: boolean;
  pasteClipboardText: (
    text: string,
    rowNode: RowNode<TRow>,
    columnIndex: number,
  ) => boolean;
  meta?: YoupGridCellMeta;
  setActiveTooltipCellKey: (cellKey?: string) => void;
  startCellEdit: (rowNode: RowNode<TRow>, column: ResolvedColumnDef<TRow>) => void;
  updateDraft: (draft: string) => void;
  cancelCellEdit: () => void;
  commitCellEdit: (
    rowNode: RowNode<TRow>,
    column: ResolvedColumnDef<TRow>,
    reason: YoupGridCellEditCommitReason,
    draft?: string,
  ) => void;
  commitCheckboxEdit: (
    rowNode: RowNode<TRow>,
    column: ResolvedColumnDef<TRow>,
    checked: boolean,
  ) => void;
  openCellContextMenu: (
    event: MouseEvent,
    rowNode: RowNode<TRow>,
    column: ResolvedColumnDef<TRow>,
    columnIndex: number,
  ) => void;
}) {
  const value = context.column.accessor(context.rowNode.original);
  const formattedValue = formatCellValue(context.column, value, context.rowNode.original);
  const align = getColumnAlign(context.column);
  const editing =
    context.activeEdit?.rowId === context.rowNode.id &&
    context.activeEdit.columnId === context.column.id;
  const cellKey = getCellKey(context.rowNode.id, context.column.id);
  const tooltipId =
    context.cellTooltipMode === "rich" &&
    hasTooltipMessage(context.meta) &&
    context.activeTooltipCellKey === cellKey
      ? getCellTooltipId(cellKey)
      : undefined;
  const slotContext: YoupGridCellSlotContext<TRow> = {
    row: context.rowNode.original,
    rowId: context.rowNode.id,
    rowIndex: context.rowNode.index,
    column: context.column,
    columnId: context.column.id,
    columnIndex: context.columnIndex,
    value,
    formattedValue,
    align,
    editable: context.editable,
    meta: context.meta,
  };
  const slotContent = renderCellSlot(context.slots, slotContext);
  const content = editing
    ? renderEditor({
        rowNode: context.rowNode,
        column: context.column,
        draft: context.activeEdit?.draft ?? "",
        updateDraft: context.updateDraft,
        cancelCellEdit: context.cancelCellEdit,
        commitCellEdit: context.commitCellEdit,
      })
    : slotContent ??
      renderDefaultCellContent({
        rowNode: context.rowNode,
        column: context.column,
        columnIndex: context.columnIndex,
        value,
        formattedValue,
        editable: context.editable,
        onToggleTreeRow: context.onToggleTreeRow,
        onToggleCheckbox: (checked) =>
          context.commitCheckboxEdit(context.rowNode, context.column, checked),
      });
  const children = normalizeCellChildren(content);
  const status = renderCellStatus(context.meta, context.cellTooltipMode);
  const tooltip = renderCellTooltip(context.meta, tooltipId);

  if (status) {
    children.push(status);
  }

  if (tooltip) {
    children.push(tooltip);
  }

  return h(
    "div",
    {
      class: [
        "youp-grid-vue__cell",
        `youp-grid-vue__cell--align-${align}`,
        context.editable ? "youp-grid-vue__cell--editable" : undefined,
        editing ? "youp-grid-vue__cell--editing" : undefined,
        tooltipId ? "youp-grid-vue__cell--tooltip-open" : undefined,
        formattedValue.length === 0 && context.column.placeholder
          ? "youp-grid-vue__cell--placeholder"
          : undefined,
      ],
      role: "gridcell",
      "aria-colindex": context.ariaColumnOffset + context.columnIndex + 1,
      "aria-describedby": tooltipId,
      tabindex: context.editable ? 0 : undefined,
      title: getCellTitle(context.meta, context.cellTooltipMode, formattedValue),
      onContextmenu: (event: MouseEvent) =>
        context.openCellContextMenu(event, context.rowNode, context.column, context.columnIndex),
      onPaste: (event: ClipboardEvent) => {
        if (!context.editable || editing) {
          return;
        }

        const text = event.clipboardData?.getData("text/plain") ?? "";

        if (context.pasteClipboardText(text, context.rowNode, context.columnIndex)) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onDblclick: () => context.startCellEdit(context.rowNode, context.column),
      onFocus: () => {
        if (context.cellTooltipMode === "rich" && hasTooltipMessage(context.meta)) {
          context.setActiveTooltipCellKey(cellKey);
        }
      },
      onBlur: () =>
        clearTooltipWhenCurrent(context.activeTooltipCellKey, cellKey, context.setActiveTooltipCellKey),
      onMouseenter: () => {
        if (context.cellTooltipMode === "rich" && hasTooltipMessage(context.meta)) {
          context.setActiveTooltipCellKey(cellKey);
        }
      },
      onMouseleave: () =>
        clearTooltipWhenCurrent(context.activeTooltipCellKey, cellKey, context.setActiveTooltipCellKey),
      onKeydown: (event: KeyboardEvent) => {
        if (!context.editable || editing) {
          return;
        }

        if (event.key === "Enter" || event.key === "F2") {
          event.preventDefault();
          context.startCellEdit(context.rowNode, context.column);
        }
      },
    },
    children,
  );
}

function normalizeCellChildren(content: VNodeChild): VNodeChild[] {
  return Array.isArray(content) ? [...content] : [content];
}

function renderCellStatus(
  meta: YoupGridCellMeta | undefined,
  tooltipMode: YoupGridCellTooltipMode,
) {
  if (!meta) {
    return undefined;
  }

  return h("span", {
    class: ["youp-grid-vue__cell-status", `youp-grid-vue__cell-status--${meta.status}`],
    title: tooltipMode === "native" && typeof meta.message === "string" ? meta.message : undefined,
    "aria-hidden": true,
  });
}

function renderCellTooltip(meta: YoupGridCellMeta | undefined, tooltipId?: string) {
  const message = meta?.message;
  if (!tooltipId || message === undefined || message === null || message === "") {
    return undefined;
  }

  return h(
    "span",
    {
      id: tooltipId,
      class: "youp-grid-vue__cell-tooltip",
      role: "tooltip",
    },
    message,
  );
}

function getCellTitle(
  meta: YoupGridCellMeta | undefined,
  tooltipMode: YoupGridCellTooltipMode,
  formattedValue: string,
) {
  if (tooltipMode === "native" && typeof meta?.message === "string") {
    return meta.message;
  }

  if (formattedValue.length > 0) {
    return formattedValue;
  }

  return undefined;
}

function renderCellContextMenu(context: {
  state?: ActiveCellContextMenu;
  menuRef: Ref<HTMLElement | null>;
  editable: boolean;
  hasSelectedRows: boolean;
  canInsertRows: boolean;
  canPasteRows: boolean;
  canDeleteRows: boolean;
  copyRowsLabel: string;
  pasteRowsLabel: string;
  deleteRowCount: number;
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

  return h(
    "div",
    {
      ref: context.menuRef,
      class: "youp-grid-vue__cell-context-menu",
      role: "menu",
      style: {
        left: `${placement?.x ?? context.state.clientX}px`,
        top: `${placement?.y ?? context.state.clientY}px`,
        visibility: placement ? "visible" : "hidden",
      },
      onClick: (event: MouseEvent) => event.stopPropagation(),
      onContextmenu: (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
      },
    },
    [
      renderCellContextMenuButton({
        label: "Copy",
        onClick: () => runAction(context.copy),
      }),
      renderCellContextMenuButton({
        label: "Paste",
        disabled: !context.editable,
        onClick: () => runAction(context.paste),
      }),
      renderCellContextMenuButton({
        label: "Clear contents",
        disabled: !context.editable,
        onClick: () => runAction(context.clearContents),
      }),
      h("div", {
        class: "youp-grid-vue__context-menu-separator",
        role: "separator",
      }),
      renderCellContextMenuButton({
        label: "Select row",
        onClick: () => runAction(context.selectRow),
      }),
      renderCellContextMenuButton({
        label: "Clear row selection",
        disabled: !context.hasSelectedRows,
        onClick: () => runAction(context.clearRowSelection),
      }),
      renderCellContextMenuButton({
        label: context.copyRowsLabel,
        onClick: () => runAction(context.copyRows),
      }),
      renderCellContextMenuButton({
        label: context.pasteRowsLabel,
        disabled: !context.canPasteRows,
        onClick: () => runAction(context.pasteRows),
      }),
      h("div", {
        class: "youp-grid-vue__context-menu-separator",
        role: "separator",
      }),
      renderCellContextMenuButton({
        label: "Insert row above",
        disabled: !context.canInsertRows,
        onClick: () => runAction(context.insertRowAbove),
      }),
      renderCellContextMenuButton({
        label: "Insert row below",
        disabled: !context.canInsertRows,
        onClick: () => runAction(context.insertRowBelow),
      }),
      renderCellContextMenuButton({
        label: context.deleteRowCount > 1 ? `Delete ${context.deleteRowCount} rows` : "Delete row",
        disabled: !context.canDeleteRows,
        onClick: () => runAction(context.deleteRows),
      }),
      h("div", {
        class: "youp-grid-vue__context-menu-separator",
        role: "separator",
      }),
      renderCellContextMenuButton({
        label: "Auto-size column",
        onClick: () => runAction(context.autoSizeColumn),
      }),
    ],
  );
}

function renderCellContextMenuButton(context: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return h(
    "button",
    {
      type: "button",
      class: "youp-grid-vue__context-menu-button",
      role: "menuitem",
      disabled: context.disabled,
      onClick: (event: MouseEvent) => {
        event.stopPropagation();
        context.onClick();
      },
    },
    context.label,
  );
}

function hasTooltipMessage(meta: YoupGridCellMeta | undefined): boolean {
  return meta?.message !== undefined && meta.message !== null && meta.message !== "";
}

function getCellKey(rowId: GridRowId, columnId: string): string {
  return `${String(rowId)}:${columnId}`;
}

function getCellTooltipId(cellKey: string): string {
  return `youp-grid-vue-cell-tooltip-${cellKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function clearTooltipWhenCurrent(
  activeCellKey: string | undefined,
  cellKey: string,
  setActiveTooltipCellKey: (cellKey?: string) => void,
) {
  if (activeCellKey === cellKey) {
    setActiveTooltipCellKey(undefined);
  }
}

function renderDefaultCellContent<TRow>(context: {
  rowNode: RowNode<TRow>;
  column: ResolvedColumnDef<TRow>;
  columnIndex: number;
  value: unknown;
  formattedValue: string;
  editable: boolean;
  onToggleTreeRow: (rowId: GridRowId) => void;
  onToggleCheckbox: (checked: boolean) => void;
}) {
  const children: VNodeChild[] = [];

  if (context.columnIndex === 0) {
    children.push(
      h("span", {
        class: "youp-grid-vue__tree-spacer",
        style: { width: `${(context.rowNode.depth ?? 0) * 16}px` },
      }),
    );

    if (context.rowNode.hasChildren) {
      children.push(
        h(
          "button",
          {
            type: "button",
            class: "youp-grid-vue__tree-button",
            "aria-expanded": context.rowNode.expanded,
            onClick: (event: MouseEvent) => {
              event.stopPropagation();
              context.onToggleTreeRow(context.rowNode.id);
            },
          },
          context.rowNode.expanded ? "-" : "+",
        ),
      );
    }
  }

  if (context.column.editor === "checkbox") {
    children.push(
      h("input", {
        type: "checkbox",
        checked: Boolean(context.value),
        disabled: !context.editable,
        "aria-label": context.column.headerName,
        onClick: (event: MouseEvent) => event.stopPropagation(),
        onChange: (event: Event) => {
          const target = event.target as HTMLInputElement;
          context.onToggleCheckbox(target.checked);
        },
      }),
    );
  } else if (context.formattedValue.length === 0 && context.column.placeholder) {
    children.push(h("span", { class: "youp-grid-vue__placeholder" }, context.column.placeholder));
  } else {
    children.push(context.formattedValue);
  }

  return children;
}

function renderEditor<TRow>(context: {
  rowNode: RowNode<TRow>;
  column: ResolvedColumnDef<TRow>;
  draft: string;
  updateDraft: (draft: string) => void;
  cancelCellEdit: () => void;
  commitCellEdit: (
    rowNode: RowNode<TRow>,
    column: ResolvedColumnDef<TRow>,
    reason: YoupGridCellEditCommitReason,
    draft?: string,
  ) => void;
}) {
  const readEditorValue = (event: Event) => {
    const target = event.currentTarget as HTMLInputElement | HTMLSelectElement | null;

    return target?.value ?? context.draft;
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      context.commitCellEdit(context.rowNode, context.column, "enter", readEditorValue(event));
    } else if (event.key === "Tab") {
      event.preventDefault();
      context.commitCellEdit(context.rowNode, context.column, "tab", readEditorValue(event));
    } else if (event.key === "Escape") {
      event.preventDefault();
      context.cancelCellEdit();
    }
  };
  const commonProps = {
    class: "youp-grid-vue__editor",
    autofocus: true,
    value: context.draft,
    onClick: (event: MouseEvent) => event.stopPropagation(),
    onKeydown: handleKeydown,
    onBlur: (event: FocusEvent) =>
      context.commitCellEdit(context.rowNode, context.column, "blur", readEditorValue(event)),
  };

  if (context.column.editor === "select") {
    return h(
      "select",
      {
        ...commonProps,
        onChange: (event: Event) => {
          const target = event.target as HTMLSelectElement;
          context.updateDraft(target.value);
        },
      },
      (context.column.options ?? []).map((option) =>
        h(
          "option",
          {
            value: String(getColumnEditorOptionValue(option)),
          },
          getColumnEditorOptionLabel(option),
        ),
      ),
    );
  }

  return h("input", {
    ...commonProps,
    type: context.column.editor === "number" ? "number" : "text",
    onInput: (event: Event) => {
      const target = event.target as HTMLInputElement;
      context.updateDraft(target.value);
    },
  });
}

function renderHeaderSlot<TRow>(
  slots: Slots,
  context: YoupGridHeaderSlotContext<TRow>,
  fallback: string,
) {
  return slots[`header-${context.columnId}`]?.(context) ?? slots.header?.(context) ?? fallback;
}

function renderCellSlot<TRow>(slots: Slots, context: YoupGridCellSlotContext<TRow>) {
  return slots[`cell-${context.columnId}`]?.(context) ?? slots.cell?.(context);
}

function formatCellValue<TRow>(
  column: ResolvedColumnDef<TRow>,
  value: unknown,
  row: TRow,
): string {
  if (column.valueFormatter) {
    return column.valueFormatter(value, row);
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function getCellEditContext<TRow>(
  rowNode: RowNode<TRow>,
  column: ResolvedColumnDef<TRow>,
): YoupGridCanEditCellContext<TRow> {
  return {
    row: rowNode.original,
    rowId: rowNode.id,
    rowIndex: rowNode.index,
    rowNode,
    column,
    columnId: column.id,
    value: column.accessor(rowNode.original),
  };
}

function getEditorDraftValue<TRow>(column: ResolvedColumnDef<TRow>, value: unknown): string {
  if (column.editor === "select") {
    const option = findColumnEditorOption(column.options, value);

    if (option !== undefined) {
      return String(getColumnEditorOptionValue(option));
    }
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function parseEditorValue<TRow>(
  column: ResolvedColumnDef<TRow>,
  draft: string,
  row: TRow,
): unknown {
  if (column.valueParser) {
    return column.valueParser(draft, row);
  }

  if (column.editor === "number") {
    return draft.trim().length === 0 ? "" : Number(draft);
  }

  if (column.editor === "select") {
    const option = findColumnEditorOption(column.options, draft);

    if (option !== undefined) {
      return getColumnEditorOptionValue(option);
    }
  }

  return draft;
}

function downloadTextFile(options: {
  fileName: string;
  mimeType: string;
  text: string;
}) {
  if (typeof document === "undefined") {
    return;
  }

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

function getVisibleRowIndex<TRow>(
  rows: readonly RowNode<TRow>[],
  rowId: GridRowId,
): number {
  const index = rows.findIndex((row) => row.id === rowId);

  return index >= 0 ? index : 0;
}

function getClipboardPasteMissingRowCount<TRow>(context: {
  rows: readonly RowNode<TRow>[];
  values: readonly (readonly string[])[];
  startRowIndex: number;
}): number {
  if (context.rows.length === 0) {
    return 0;
  }

  const pasteRowCount = getClipboardPasteRowCount({
    values: context.values,
  });

  return Math.max(0, context.startRowIndex + pasteRowCount - context.rows.length);
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
  changes: readonly YoupGridCellValueChange<TRow>[];
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

function getFilterValue(
  state: { filters?: { columnId: string; value?: unknown }[] },
  columnId: string,
): string {
  const value = state.filters?.find((filter) => filter.columnId === columnId)?.value;

  return value == null ? "" : String(value);
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

function getAutoSizeColumnWidth<TRow>(context: {
  column: ResolvedColumnDef<TRow>;
  rows: readonly RowNode<TRow>[];
}): number {
  const minWidth = context.column.minWidth ?? MIN_AUTOSIZE_COLUMN_WIDTH;
  const maxWidth = context.column.maxWidth ?? MAX_AUTOSIZE_COLUMN_WIDTH;
  let width = measureAutoSizeText(context.column.headerName, getAutoSizeFont("600")) + 48;

  for (const row of context.rows) {
    const text = getAutoSizeCellText(context.column, row.original);
    width = Math.max(width, measureAutoSizeText(text, getAutoSizeFont()) + 32);
  }

  return Math.ceil(clamp(width, minWidth, maxWidth));
}

function getAutoSizeCellText<TRow>(column: ResolvedColumnDef<TRow>, row: TRow): string {
  const text = formatCellValue(column, column.accessor(row), row);

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

function getAutoSizeFont(weight = "400"): string {
  return `${weight} 14px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
}

function startColumnResizeDrag<TRow>(
  event: MouseEvent,
  context: {
    column: ResolvedColumnDef<TRow>;
    resizeColumn: (width: number) => void;
  },
) {
  event.preventDefault();
  event.stopPropagation();

  if (typeof window === "undefined") {
    return;
  }

  const startX = event.clientX;
  const startWidth = getColumnWidth(context.column);
  const minWidth = context.column.minWidth ?? MIN_AUTOSIZE_COLUMN_WIDTH;
  const maxWidth = context.column.maxWidth ?? MAX_AUTOSIZE_COLUMN_WIDTH;
  const handleMouseMove = (moveEvent: MouseEvent) => {
    context.resizeColumn(clamp(startWidth + moveEvent.clientX - startX, minWidth, maxWidth));
  };
  const handleMouseUp = () => {
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  };

  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
}

function writeClipboardText(text: string): Promise<void> {
  if (globalThis.navigator?.clipboard?.writeText) {
    return globalThis.navigator.clipboard.writeText(text);
  }

  if (typeof document === "undefined") {
    return Promise.reject(new Error("Clipboard API is not available."));
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
    return Promise.resolve();
  } finally {
    document.body.removeChild(textarea);
  }
}

function readClipboardText(): Promise<string> {
  if (globalThis.navigator?.clipboard?.readText) {
    return globalThis.navigator.clipboard.readText();
  }

  return Promise.reject(new Error("Clipboard API is not available."));
}

function getFirstClipboardCell(text: string): string {
  return text.split(/\r?\n/, 1)[0]?.split("\t", 1)[0] ?? "";
}

function createCellValueChange<TRow>(
  rowNode: RowNode<TRow>,
  column: ResolvedColumnDef<TRow>,
  value: unknown,
  previousValue: unknown,
  source: YoupGridCellValueChange<TRow>["source"] = "edit",
): YoupGridCellValueChange<TRow> {
  return {
    row: rowNode.original,
    rowId: rowNode.id,
    rowIndex: rowNode.index,
    column,
    columnId: column.id,
    value,
    previousValue,
    source,
  };
}

function updateRowsValue<TRow>(
  rows: readonly TRow[],
  rowIndex: number,
  column: ResolvedColumnDef<TRow>,
  value: unknown,
): TRow[] | undefined {
  if (!column.field || rowIndex < 0 || rowIndex >= rows.length) {
    return undefined;
  }

  const row = rows[rowIndex];

  if (!isObjectRecord(row)) {
    return undefined;
  }

  const nextRows = [...rows];
  nextRows[rowIndex] = setFieldValue(row, column.field, value) as TRow;

  return nextRows;
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

function findColumnEditorOption(
  options: readonly ColumnEditorOption[] | undefined,
  value: unknown,
): ColumnEditorOption | undefined {
  return options?.find((option) => Object.is(getColumnEditorOptionValue(option), value)) ??
    options?.find((option) => String(getColumnEditorOptionValue(option)) === String(value));
}

function getColumnEditorOptionValue(option: ColumnEditorOption) {
  return isObjectRecord(option) && "value" in option ? option.value : option;
}

function getColumnEditorOptionLabel(option: ColumnEditorOption) {
  return isObjectRecord(option) && "label" in option ? String(option.label) : String(option);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function getColumnWidth<TRow>(column: ResolvedColumnDef<TRow>): number {
  const width = column.width ?? DEFAULT_COLUMN_WIDTH;
  const minWidth = column.minWidth ?? 48;
  const maxWidth = column.maxWidth ?? Number.POSITIVE_INFINITY;

  return Math.min(Math.max(width, minWidth), maxWidth);
}

function getSortDirection(state: GridState, columnId: string): SortDirection | undefined {
  return state.sort?.find((sortRule) => sortRule.columnId === columnId)?.direction;
}

function getAriaSort(direction: SortDirection | undefined) {
  if (direction === "asc") {
    return "ascending";
  }

  if (direction === "desc") {
    return "descending";
  }

  return "none";
}

function isGroupNode<TRow>(displayNode: RowDisplayNode<TRow>): displayNode is RowGroupNode {
  return "type" in displayNode && displayNode.type === "group";
}
