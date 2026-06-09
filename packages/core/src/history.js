export function createValueHistoryState() {
    return {
        undoStack: [],
        redoStack: [],
    };
}
export function pushValueHistoryEntry(state, entry, options = {}) {
    if (entry.changes.length === 0) {
        return state;
    }
    const maxEntries = options.maxEntries ?? 100;
    const nextEntry = {
        changes: [...entry.changes],
    };
    return {
        undoStack: [...state.undoStack, nextEntry].slice(-maxEntries),
        redoStack: [],
    };
}
export function undoValueHistory(state) {
    const entry = state.undoStack[state.undoStack.length - 1];
    if (!entry) {
        return { state };
    }
    return {
        state: {
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [...state.redoStack, entry],
        },
        entry,
    };
}
export function redoValueHistory(state) {
    const entry = state.redoStack[state.redoStack.length - 1];
    if (!entry) {
        return { state };
    }
    return {
        state: {
            undoStack: [...state.undoStack, entry],
            redoStack: state.redoStack.slice(0, -1),
        },
        entry,
    };
}
export function invertValueHistoryEntry(entry) {
    return {
        changes: entry.changes.map((change) => ({
            ...change,
            previousValue: change.value,
            value: change.previousValue,
        })),
    };
}
