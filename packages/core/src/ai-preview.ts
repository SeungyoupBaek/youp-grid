import { applyGridAiResponse, createGridAiRequest, type GridAiResponse } from "./ai.ts";
import { setColumnHidden } from "./column-state.ts";
import { setGridQuery } from "./query.ts";
import type { ColumnDef, GridState } from "./types.ts";

export type GridAiPreview = { response: GridAiResponse; before: GridState; after: GridState; context: string };
export function createGridAiPreview<TRow>(response: unknown, columns: readonly ColumnDef<TRow>[], state: GridState): GridAiPreview {
  const before = structuredClone(state);
  const result = applyGridAiResponse({ response, columns, state: before });
  return { response: result.response, before, after: result.state, context: context(columns, state) };
}
export function applyGridAiPreview<TRow>(preview: GridAiPreview, columns: readonly ColumnDef<TRow>[], state: GridState): GridState {
  if (context(columns, state) !== preview.context) throw new Error("The grid changed. Generate a new AI preview.");
  return applyGridAiResponse({ response: preview.response, columns, state }).state;
}
/** Restore only the settings changed by AI; retain selection, widths and other current state. */
export function undoGridAiPreview<TRow>(preview: GridAiPreview, columns: readonly ColumnDef<TRow>[], state: GridState): GridState {
  if (context(columns, state) !== context(columns, preview.after)) throw new Error("The grid changed after AI was applied. Undo is no longer available.");
  let restored = { ...state };
  if (preview.response.actions.some((action) => action.type === "setSort" || action.type === "clearSort")) restored.sort = structuredClone(preview.before.sort);
  if (preview.response.actions.some((action) => action.type === "setFilter" || action.type === "clearFilter")) restored.filters = structuredClone(preview.before.filters);
  for (const action of preview.response.actions) if (action.type === "setColumnHidden") {
    const column = createGridAiRequest({ prompt: "undo", columns, state: preview.before }).context.state.columns!.find((column) => column.columnId === action.columnId)!;
    restored = setColumnHidden(restored, action.columnId, Boolean(column.hidden));
  }
  return setGridQuery(restored, {});
}
function context<TRow>(columns: readonly ColumnDef<TRow>[], state: GridState): string {
  return JSON.stringify(createGridAiRequest({ prompt: "preview", columns, state }).context);
}
