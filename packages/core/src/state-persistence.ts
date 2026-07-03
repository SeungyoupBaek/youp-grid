import { createGridState } from "./state.ts";
import type { GridState } from "./types.ts";

export type PersistedGridState = {
  version: 1;
  state: GridState;
};

export type GridStateStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};

export function serializeGridState(state: GridState): string {
  return JSON.stringify({
    version: 1,
    state: createGridState(state),
  } satisfies PersistedGridState);
}

export function parseGridState(value: string | null | undefined, fallback: GridState = {}): GridState {
  if (!value) {
    return createGridState(fallback);
  }

  try {
    const parsed = JSON.parse(value) as Partial<PersistedGridState>;

    if (parsed.version !== 1 || !parsed.state || typeof parsed.state !== "object") {
      return createGridState(fallback);
    }

    return createGridState(parsed.state);
  } catch {
    return createGridState(fallback);
  }
}

export function saveGridState(storage: GridStateStorage, key: string, state: GridState): void {
  storage.setItem(key, serializeGridState(state));
}

export function loadGridState(storage: GridStateStorage, key: string, fallback: GridState = {}): GridState {
  return parseGridState(storage.getItem(key), fallback);
}

export function clearSavedGridState(storage: GridStateStorage, key: string): void {
  storage.removeItem?.(key);
}
