import { createGridState } from "./state.ts";
import { setGridQuery, validateFilterExpression } from "./query.ts";
import type { GridState } from "./types.ts";
import type { GridStateStorage } from "./state-persistence.ts";

export type GridViewSettings = Pick<GridState, "columns" | "sort" | "filters" | "aggregation" | "rowGrouping" | "pivot" | "quickFilter" | "filterExpression">;
export type GridSavedView = { id: string; name: string; settings: GridViewSettings };
export type GridViewCollection = { version: 1; views: GridSavedView[]; defaultViewId?: string };
const keys = ["columns", "sort", "filters", "aggregation", "rowGrouping", "pivot", "quickFilter", "filterExpression"] as const;
export function captureGridView(state: GridState): GridViewSettings {
  return JSON.parse(JSON.stringify(Object.fromEntries(keys.map((key) => [key, state[key]])))) as GridViewSettings;
}
export function applyGridView(state: GridState, view: GridSavedView, columns?: readonly { id: string; filterable?: boolean }[]): GridState {
  const settings = captureGridView(view.settings);
  if (columns && settings.filterExpression) validateFilterExpression(settings.filterExpression, columns);
  if (columns) {
    const ids = new Set(columns.map((column) => column.id));
    settings.columns = settings.columns?.filter((column) => ids.has(column.columnId));
    settings.sort = settings.sort?.filter((rule) => ids.has(rule.columnId));
    settings.filters = settings.filters?.filter((rule) => ids.has(rule.columnId));
    settings.aggregation = settings.aggregation?.filter((rule) => ids.has(rule.columnId));
    if (settings.rowGrouping) settings.rowGrouping.columnIds = settings.rowGrouping.columnIds.filter((id) => ids.has(id));
    if (settings.pivot) {
      settings.pivot.rows = settings.pivot.rows.filter((dimension) => ids.has(dimension.columnId));
      settings.pivot.columns = settings.pivot.columns.filter((dimension) => ids.has(dimension.columnId));
      settings.pivot.values = settings.pivot.values.filter((rule) => ids.has(rule.columnId));
    }
  }
  const clean = Object.fromEntries(keys.map((key) => [key, settings[key]]));
  return setGridQuery(createGridState({ ...state, ...clean }), { quickFilter: settings.quickFilter, filterExpression: settings.filterExpression });
}
export function updateGridView(collection: GridViewCollection, view: GridSavedView): GridViewCollection {
  if (!view.id.trim() || !view.name.trim()) throw new Error("A view requires an ID and name");
  const saved = { ...view, name: view.name.trim(), settings: captureGridView(view.settings) };
  return { ...collection, views: [...collection.views.filter((item) => item.id !== view.id), saved] };
}
export function deleteGridView(collection: GridViewCollection, id: string): GridViewCollection {
  return { ...collection, views: collection.views.filter((view) => view.id !== id), defaultViewId: collection.defaultViewId === id ? undefined : collection.defaultViewId };
}
export function setDefaultGridView(collection: GridViewCollection, id?: string): GridViewCollection {
  if (id && !collection.views.some((view) => view.id === id)) throw new Error("Unknown default view");
  return { ...collection, defaultViewId: id };
}
export function loadGridViews(storage: GridStateStorage, key: string): GridViewCollection {
  const empty: GridViewCollection = { version: 1, views: [] };
  const value = storage.getItem(key);
  if (!value) return empty;
  try {
    const parsed = JSON.parse(value) as GridViewCollection;
    if (parsed.version !== 1 || !Array.isArray(parsed.views)) return empty;
    let collection = empty;
    for (const view of parsed.views) {
      if (!view || typeof view.id !== "string" || typeof view.name !== "string" || !view.settings || typeof view.settings !== "object") return empty;
      for (const key of ["columns", "sort", "filters", "aggregation"] as const) if (view.settings[key] !== undefined && (!Array.isArray(view.settings[key]) || !view.settings[key]!.every((item) => item && typeof item === "object" && typeof item.columnId === "string"))) return empty;
      createGridState(view.settings);
      if (view.settings.quickFilter !== undefined && typeof view.settings.quickFilter !== "string") return empty;
      collection = updateGridView(collection, view);
    }
    return setDefaultGridView(collection, parsed.defaultViewId);
  } catch { return empty; }
}
export function saveGridViews(storage: GridStateStorage, key: string, collection: GridViewCollection): void {
  storage.setItem(key, JSON.stringify(collection));
}
