import type {
  ColumnAlign,
  ColumnDef,
  ColumnEditorOption,
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
  computed,
  defineComponent,
  h,
  ref,
  watch,
  type PropType,
  type Slots,
  type VNodeChild,
} from "vue";

import type {
  YoupGridCanEditCellContext,
  YoupGridCellEditCommit,
  YoupGridCellEditCommitReason,
  YoupGridCellMeta,
  YoupGridCellSlotContext,
  YoupGridCellTooltipMode,
  YoupGridCellTooltipOptions,
  YoupGridCellValueChange,
  YoupGridHeaderSlotContext,
  YoupGridRowEvent,
  YoupGridRowsChange,
  YoupGridStateChange,
} from "./types.ts";
import { useYoupGrid } from "./useYoupGrid.ts";

const DEFAULT_COLUMN_WIDTH = 160;
const ROW_NUMBER_COLUMN_WIDTH = 44;
const ROW_SELECTION_COLUMN_WIDTH = 44;

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
    cellValueChange: (_change: YoupGridCellValueChange<unknown>) => true,
    cellEditCommit: (_commit: YoupGridCellEditCommit<unknown>) => true,
    rowsChange: (_change: YoupGridRowsChange<unknown>) => true,
  },
  setup(props, { emit, slots }) {
    const activeEdit = ref<ActiveEdit>();
    const activeTooltipCellKey = ref<string>();
    const activeCellContextMenu = ref<ActiveCellContextMenu>();
    const grid = useYoupGrid<unknown>(() => ({
      rows: props.rows,
      columns: props.columns,
      state: props.state,
      defaultState: props.defaultState,
      getRowId: props.getRowId,
      treeData: props.treeData,
      getParentRowId: props.getParentRowId,
      rowModelType: props.rowModelType,
      serverRowCount: props.serverRowCount,
      serverFilteredRowCount: props.serverFilteredRowCount,
      onStateChange: (change) => emit("stateChange", change),
    }));

    const visibleColumns = computed(() => grid.rowModel.value.visibleColumns);
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
      if (!props.editable || props.readOnly || column.editable === false) {
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
        const nextRows = updateRowsValue(props.rows, rowNode.index, column, value);

        if (nextRows) {
          emit("rowsChange", {
            rows: nextRows,
            changes: [
              {
                ...change,
                row: nextRows[rowNode.index],
              },
            ],
            source: "edit",
          });
        }
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
      const nextRows = updateRowsValue(props.rows, rowNode.index, column, checked);

      if (nextRows) {
        emit("rowsChange", {
          rows: nextRows,
          changes: [
            {
              ...change,
              row: nextRows[rowNode.index],
            },
          ],
          source: "edit",
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

      emit("cellValueChange", change);
      const nextRows = updateRowsValue(props.rows, rowNode.index, column, value);

      if (nextRows) {
        emit("rowsChange", {
          rows: nextRows,
          changes: [
            {
              ...change,
              row: nextRows[rowNode.index],
            },
          ],
          source,
        });
      }
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

    return () => {
      const rowModel = grid.rowModel.value;
      const columns = visibleColumns.value;
      const templateColumns = gridTemplateColumns.value;
      const cellContextMenu = activeCellContextMenu.value;

      return h(
        "div",
        {
          class: [
            "youp-grid-vue",
            props.showRowNumberColumn ? "youp-grid-vue--row-number-column" : undefined,
            props.showRowSelectionColumn && props.pinRowSelectionColumn
              ? "youp-grid-vue--selection-column-pinned"
              : undefined,
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
                    activeEdit: activeEdit.value,
                    activeTooltipCellKey: activeTooltipCellKey.value,
                    cellTooltipMode: cellTooltipMode.value,
                    canEditCell,
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
          renderCellContextMenu({
            state: cellContextMenu,
            editable: cellContextMenu
              ? canEditCell(cellContextMenu.rowNode, cellContextMenu.column)
              : false,
            hasSelectedRows: selectedRowIds.value.size > 0,
            copy: copyCellContextMenuCell,
            paste: pasteCellContextMenuCell,
            clearContents: clearCellContextMenuCell,
            selectRow: selectCellContextMenuRow,
            clearRowSelection: clearCellContextMenuRowSelection,
            closeMenu: closeCellContextMenu,
          }),
        ],
      );
    };
  },
});

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
}) {
  const align = getColumnAlign(context.column);
  const slotContext: YoupGridHeaderSlotContext<TRow> = {
    column: context.column,
    columnId: context.column.id,
    columnIndex: context.columnIndex,
    align,
    sortDirection: context.sortDirection,
  };
  const content = renderHeaderSlot(context.slots, slotContext, context.column.headerName);
  const sortable = context.sortOnHeaderClick && context.column.sortable !== false;

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
    sortable
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
      : h("span", { class: "youp-grid-vue__header-label" }, content),
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
  activeEdit?: ActiveEdit;
  activeTooltipCellKey?: string;
  cellTooltipMode: YoupGridCellTooltipMode;
  canEditCell: (rowNode: RowNode<TRow>, column: ResolvedColumnDef<TRow>) => boolean;
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
    activeEdit: context.activeEdit,
    activeTooltipCellKey: context.activeTooltipCellKey,
    cellTooltipMode: context.cellTooltipMode,
    canEditCell: context.canEditCell,
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
  activeEdit?: ActiveEdit;
  activeTooltipCellKey?: string;
  cellTooltipMode: YoupGridCellTooltipMode;
  canEditCell: (rowNode: RowNode<TRow>, column: ResolvedColumnDef<TRow>) => boolean;
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
      onClick: () =>
        context.onRowClick({
          row: context.rowNode.original,
          rowId: context.rowNode.id,
          rowIndex: context.rowNode.index,
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
  editable: boolean;
  hasSelectedRows: boolean;
  copy: () => void;
  paste: () => void;
  clearContents: () => void;
  selectRow: () => void;
  clearRowSelection: () => void;
  closeMenu: () => void;
}) {
  if (!context.state) {
    return undefined;
  }

  const runAction = (action: () => void) => {
    action();
    context.closeMenu();
  };

  return h(
    "div",
    {
      class: "youp-grid-vue__cell-context-menu",
      role: "menu",
      style: {
        left: `${context.state.clientX}px`,
        top: `${context.state.clientY}px`,
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
