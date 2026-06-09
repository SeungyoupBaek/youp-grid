import type { GridRowId } from "./types.ts";

export type GridCellValueHistoryChange = {
  rowId: GridRowId;
  rowIndex: number;
  columnId: string;
  previousValue: unknown;
  value: unknown;
};

export type GridValueHistoryEntry = {
  changes: readonly GridCellValueHistoryChange[];
};

export type GridValueHistoryState = {
  undoStack: GridValueHistoryEntry[];
  redoStack: GridValueHistoryEntry[];
};

export function createValueHistoryState(): GridValueHistoryState {
  return {
    undoStack: [],
    redoStack: [],
  };
}

export function pushValueHistoryEntry(
  state: GridValueHistoryState,
  entry: GridValueHistoryEntry,
  options: { maxEntries?: number } = {},
): GridValueHistoryState {
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

export function undoValueHistory(state: GridValueHistoryState): {
  state: GridValueHistoryState;
  entry?: GridValueHistoryEntry;
} {
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

export function redoValueHistory(state: GridValueHistoryState): {
  state: GridValueHistoryState;
  entry?: GridValueHistoryEntry;
} {
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

export function invertValueHistoryEntry(entry: GridValueHistoryEntry): GridValueHistoryEntry {
  return {
    changes: entry.changes.map((change) => ({
      ...change,
      previousValue: change.value,
      value: change.previousValue,
    })),
  };
}
