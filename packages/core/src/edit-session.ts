import { normalizeColumns } from "./columns.ts";
import { setGridFieldValue } from "./field-value.ts";
import { normalizeCellValidationResult } from "./validation.ts";
import type { ColumnDef, GridRowId } from "./types.ts";

export type GridDraftChange = { rowId: GridRowId; columnId: string; previousValue: unknown; value: unknown };
export type GridEditSnapshot<TRow> = {
  rows: readonly TRow[]; changes: readonly GridDraftChange[]; saving: boolean;
  error?: string; errors: Readonly<Record<string, string>>; canUndo: boolean; canRedo: boolean;
};
export type GridEditSession<TRow> = {
  getSnapshot: () => GridEditSnapshot<TRow>;
  subscribe: (listener: () => void) => () => void;
  stage: (changes: readonly Pick<GridDraftChange, "rowId" | "columnId" | "value">[]) => void;
  save: () => Promise<void>; discard: () => void; undo: () => void; redo: () => void;
  replaceRows: (rows: readonly TRow[]) => void; dispose: () => void;
};
export function getGridDraftKey(rowId: GridRowId, columnId: string): string { return JSON.stringify([rowId, columnId]); }

/** The save callback must persist the entire change set atomically, or reject it. */
export function createGridEditSession<TRow>(options: {
  rows: readonly TRow[]; columns: readonly ColumnDef<TRow>[]; getRowId: (row: TRow) => GridRowId;
  onSave: (changes: readonly GridDraftChange[], signal: AbortSignal) => Promise<void | readonly TRow[]>;
  canEditCell?: (row: TRow, columnId: string) => boolean;
}): GridEditSession<TRow> {
  const columns = normalizeColumns(options.columns);
  const columnsById = new Map(columns.map((column) => [column.id, column]));
  let base = [...options.rows];
  let baseById = new Map(base.map((row) => [options.getRowId(row), row]));
  let drafts = new Map<string, GridDraftChange>();
  let undo: Map<string, GridDraftChange>[] = [];
  let redo: Map<string, GridDraftChange>[] = [];
  let disposed = false;
  let operation: AbortController | undefined;
  const listeners = new Set<() => void>();
  const assertRows = (rows: readonly TRow[]) => {
    const ids = rows.map(options.getRowId);
    if (ids.some((id) => typeof id !== "string" && (typeof id !== "number" || !Number.isFinite(id)))) throw new Error("Batch editing requires string or finite numeric row IDs");
    if (new Set(ids).size !== ids.length) throw new Error("Batch editing requires unique row IDs");
  };
  assertRows(base);
  const materialize = (changes = drafts) => {
    const byRow = new Map<GridRowId, GridDraftChange[]>();
    for (const change of changes.values()) { const rowChanges = byRow.get(change.rowId) ?? []; rowChanges.push(change); byRow.set(change.rowId, rowChanges); }
    return base.map((row) => (byRow.get(options.getRowId(row)) ?? []).reduce((result, change) => setGridFieldValue(result, String(columnsById.get(change.columnId)!.field), change.value), row));
  };
  let snapshot: GridEditSnapshot<TRow> = { rows: base, changes: [], saving: false, errors: {}, canUndo: false, canRedo: false };
  const publish = (extra: Partial<GridEditSnapshot<TRow>> = {}) => {
    snapshot = { ...snapshot, rows: materialize(), changes: [...drafts.values()], canUndo: undo.length > 0, canRedo: redo.length > 0, ...extra };
    listeners.forEach((listener) => listener());
  };
  const writable = () => { if (disposed || snapshot.saving) throw new Error(disposed ? "Edit session disposed" : "A save is in progress"); };
  const conflicts = () => {
    const errors: Record<string, string> = {};
    for (const [key, change] of drafts) {
      const row = baseById.get(change.rowId);
      const column = columnsById.get(change.columnId)!;
      if (!row || !Object.is(column.accessor(row), change.previousValue)) errors[key] = "The source value changed. Discard and edit the latest value.";
      else if (column.editable === false || options.canEditCell?.(row, column.id) === false) errors[key] = "This cell is no longer editable.";
    }
    return errors;
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    stage(changes) {
      writable();
      const next = new Map(drafts);
      for (const change of changes) {
        const row = baseById.get(change.rowId);
        const column = columnsById.get(change.columnId);
        if (!row || !column?.field || column.editable === false || column.formula || options.canEditCell?.(row, column.id) === false) throw new Error("Unknown, computed, or read-only cell");
        if (options.getRowId(setGridFieldValue(row, String(column.field), change.value)) !== change.rowId) throw new Error("Editing cannot change a row ID");
        const key = getGridDraftKey(change.rowId, change.columnId);
        const previousValue = next.has(key) ? next.get(key)!.previousValue : column.accessor(row);
        if (Object.is(previousValue, change.value)) next.delete(key);
        else next.set(key, { ...change, previousValue });
      }
      if (!changes.length) return;
      if (materialize(next).some((row, index) => options.getRowId(row) !== options.getRowId(base[index]))) throw new Error("Editing cannot change a row ID");
      undo.push(new Map(drafts));
      if (undo.length > 100) undo.shift();
      redo = []; drafts = next;
      publish({ errors: conflicts(), error: undefined });
    },
    async save() {
      writable();
      if (!drafts.size) return;
      operation = new AbortController();
      const current = operation;
      publish({ saving: true, errors: {}, error: undefined });
      try {
        const errors = conflicts();
        const rows = materialize();
        const changedRowIds = new Set([...drafts.values()].map((change) => change.rowId));
        for (const row of rows) {
          const rowId = options.getRowId(row);
          if (!changedRowIds.has(rowId)) continue;
          for (const column of columns) {
            const key = getGridDraftKey(rowId, column.id);
            if (errors[key] || !column.validator || column.formula) continue;
            try {
              const validation = normalizeCellValidationResult(await column.validator(column.accessor(row), row));
              if (!validation.valid) errors[key] = validation.message ?? "Invalid value";
            } catch (cause) { errors[key] = cause instanceof Error ? cause.message : String(cause); }
          }
        }
        if (current.signal.aborted) return;
        if (Object.keys(errors).length) { publish({ errors }); throw new Error("Resolve validation errors before saving"); }
        const savedRows = await options.onSave([...drafts.values()], current.signal);
        if (current.signal.aborted) return;
        if (savedRows) {
          assertRows(savedRows);
          const savedIds = new Set(savedRows.map(options.getRowId));
          if (base.some((row) => !savedIds.has(options.getRowId(row)))) throw new Error("Save returned an incomplete row set");
        }
        base = [...(savedRows ?? rows)]; baseById = new Map(base.map((row) => [options.getRowId(row), row])); drafts.clear(); undo = []; redo = [];
        publish({ errors: {}, error: undefined });
      } catch (cause) {
        if (!current.signal.aborted) publish({ error: cause instanceof Error ? cause.message : String(cause) });
        throw cause;
      } finally {
        if (!disposed && operation === current) { operation = undefined; publish({ saving: false }); }
      }
    },
    discard() { writable(); drafts.clear(); undo = []; redo = []; publish({ errors: {}, error: undefined }); },
    undo() { writable(); const previous = undo.pop(); if (previous) { redo.push(drafts); drafts = previous; publish({ errors: conflicts(), error: undefined }); } },
    redo() { writable(); const next = redo.pop(); if (next) { undo.push(drafts); drafts = next; publish({ errors: conflicts(), error: undefined }); } },
    replaceRows(rows) { writable(); assertRows(rows); base = [...rows]; baseById = new Map(base.map((row) => [options.getRowId(row), row])); publish({ errors: conflicts(), error: undefined }); },
    dispose() { disposed = true; operation?.abort(); listeners.clear(); },
  };
}
