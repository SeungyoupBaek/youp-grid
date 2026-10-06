import type { ResolvedColumnDef } from "./types.ts";

/** Clone just the field path; never mutate the application's row or its nested objects. */
export function setGridFieldValue<TRow>(row: TRow, field: string, value: unknown): TRow {
  const parts = field.split(".");
  if (parts.some((part) => !part || ["__proto__", "prototype", "constructor"].includes(part))) throw new Error("Invalid field path");
  const clone = (current: unknown, index: number): unknown => {
    const copy = (Array.isArray(current) ? [...current] : { ...(current && typeof current === "object" ? current : {}) }) as Record<string, unknown>;
    copy[parts[index]] = index === parts.length - 1 ? value : clone(copy[parts[index]], index + 1);
    return copy;
  };
  return clone(row, 0) as TRow;
}
export function getEmptyGridCellValue<TRow>(column: ResolvedColumnDef<TRow>, row: TRow): unknown {
  if (column.valueParser) return column.valueParser("", row);
  if (column.editor === "checkbox") return false;
  if (column.editor === "number") return undefined;
  if (column.editor === "tags") return [];
  return "";
}
