const MIN_COLUMN_WIDTH = 24;
export function applyColumnState(columns, columnStates = []) {
    if (columnStates.length === 0) {
        return [...columns];
    }
    const stateById = new Map(columnStates.map((state) => [state.columnId, state]));
    return columns
        .map((column, index) => {
        const state = stateById.get(column.id);
        return {
            ...column,
            hidden: state?.hidden ?? column.hidden,
            pinned: state?.pinned ?? column.pinned,
            width: state?.width ?? column.width,
            order: state?.order ?? index,
        };
    })
        .sort((left, right) => {
        return (left.order ?? 0) - (right.order ?? 0);
    })
        .map(({ order, ...column }) => column);
}
export function getVisibleColumns(columns) {
    return columns.filter((column) => !column.hidden);
}
export function setColumnHidden(state, columnId, hidden) {
    return updateColumnState(state, columnId, { hidden });
}
export function setColumnWidth(state, columnId, width) {
    return updateColumnState(state, columnId, {
        width: Math.max(MIN_COLUMN_WIDTH, Math.round(width)),
    });
}
export function setColumnPinned(state, columnId, pinned) {
    return updateColumnState(state, columnId, { pinned });
}
export function setColumnOrder(state, columnIds) {
    const knownColumnIds = new Set(columnIds);
    const existingStates = (state.columns ?? []).filter((column) => knownColumnIds.has(column.columnId));
    const statesById = new Map(existingStates.map((column) => [column.columnId, column]));
    const orderedStates = columnIds.map((columnId, order) => ({
        ...statesById.get(columnId),
        columnId,
        order,
    }));
    return {
        ...state,
        columns: orderedStates,
    };
}
function updateColumnState(state, columnId, patch) {
    const columns = state.columns ?? [];
    const existing = columns.find((column) => column.columnId === columnId);
    const nextColumnState = {
        ...existing,
        columnId,
        ...patch,
    };
    return {
        ...state,
        columns: [
            ...columns.filter((column) => column.columnId !== columnId),
            nextColumnState,
        ],
    };
}
