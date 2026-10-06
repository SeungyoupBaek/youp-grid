import { normalizeColumns } from "./columns.ts";
import { setGridFieldValue } from "./field-value.ts";
import { normalizeCellValidationResult } from "./validation.ts";
import type { ColumnDef, GridRowId } from "./types.ts";
import type { ExportGridExcelOptions } from "./excel.ts";
import type { ImportGridColumnMapping, ImportGridDelimitedTextIssue } from "./import.ts";

export type GridImportTable = { name: string; headers: string[]; rows: unknown[][] };
export type GridWorkbookAdapter = {
  read: (data: ArrayBuffer) => Promise<GridImportTable[]>;
  write: <TRow>(options: ExportGridExcelOptions<TRow>) => Promise<Uint8Array>;
};
export type GridImportPreview<TRow> = { rows: TRow[]; issues: ImportGridDelimitedTextIssue[]; valid: boolean };
export function matchGridImportHeaders<TRow>(columns: readonly ColumnDef<TRow>[], headers: readonly string[]): ImportGridColumnMapping[] {
  return normalizeColumns(columns).flatMap((column) => {
    const names = [column.id, column.headerName, column.field].map((name) => String(name ?? "").trim().toLocaleLowerCase());
    const sourceIndex = headers.findIndex((header) => names.includes(header.trim().toLocaleLowerCase()));
    return sourceIndex < 0 || !column.field || column.formula ? [] : [{ columnId: column.id, sourceIndex }];
  });
}
export async function createGridImportPreview<TRow>(options: {
  table: GridImportTable; columns: readonly ColumnDef<TRow>[]; mappings: readonly ImportGridColumnMapping[];
  createRow: (index: number) => TRow; getRowId?: (row: TRow, index: number) => GridRowId; existingRowIds?: readonly GridRowId[];
}): Promise<GridImportPreview<TRow>> {
  const columns = normalizeColumns(options.columns);
  const seenColumns = new Set<string>();
  for (const mapping of options.mappings) {
    const column = columns.find((column) => column.id === mapping.columnId);
    if (!column?.field || column.formula || seenColumns.has(mapping.columnId) || !Number.isInteger(mapping.sourceIndex) || mapping.sourceIndex < 0 || mapping.sourceIndex >= options.table.headers.length) throw new Error("Invalid or duplicate import mapping");
    seenColumns.add(mapping.columnId);
  }
  if (!options.mappings.length) throw new Error("Map at least one column before importing");
  const rows: TRow[] = [];
  const issues: ImportGridDelimitedTextIssue[] = [];
  const ids = new Set(options.existingRowIds ?? []);
  for (let rowIndex = 0; rowIndex < options.table.rows.length; rowIndex++) {
    let row = options.createRow(rowIndex);
    for (const mapping of options.mappings) {
      const column = columns.find((column) => column.id === mapping.columnId)!;
      const value = options.table.rows[rowIndex][mapping.sourceIndex] ?? "";
      try { row = setGridFieldValue(row, String(column.field), column.valueParser ? column.valueParser(String(value), row) : value); }
      catch (cause) { issues.push({ rowIndex, columnId: column.id, message: cause instanceof Error ? cause.message : String(cause) }); }
    }
    for (const column of columns) {
      if (column.validator && !column.formula) {
        try {
          const result = normalizeCellValidationResult(await column.validator(column.accessor(row), row));
          if (!result.valid) issues.push({ rowIndex, columnId: column.id, message: result.message ?? "Invalid value" });
        } catch (cause) { issues.push({ rowIndex, columnId: column.id, message: cause instanceof Error ? cause.message : String(cause) }); }
      }
    }
    if (options.getRowId) {
      const id = options.getRowId(row, rowIndex);
      if (typeof id !== "string" && (typeof id !== "number" || !Number.isFinite(id))) issues.push({ rowIndex, message: "Invalid row ID" });
      if (ids.has(id)) issues.push({ rowIndex, message: "Duplicate row ID" });
      ids.add(id);
    }
    rows.push(row);
  }
  return { rows, issues, valid: issues.length === 0 };
}
