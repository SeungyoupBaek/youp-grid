export function setRowSelected(state, rowId, selected) {
    const selectedRowIds = new Set(state.selectedRowIds ?? []);
    if (selected) {
        selectedRowIds.add(rowId);
    }
    else {
        selectedRowIds.delete(rowId);
    }
    return {
        ...state,
        selectedRowIds: [...selectedRowIds],
    };
}
export function toggleRowSelected(state, rowId) {
    return setRowSelected(state, rowId, !(state.selectedRowIds ?? []).includes(rowId));
}
export function setSelectedRows(state, rowIds) {
    return {
        ...state,
        selectedRowIds: [...new Set(rowIds)],
    };
}
export function clearSelection(state) {
    return {
        ...state,
        selectedRowIds: [],
    };
}
