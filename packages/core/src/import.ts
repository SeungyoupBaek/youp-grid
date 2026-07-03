import type { ColumnDef, ResolvedColumnDef } from "./types.ts";

export type ImportGridDelimitedTextOptions<TRow> = {
  text: string;
  columns: readonly ResolvedColumnDef<TRow>[] | readonly ColumnDef<TRow>[];
  createRow: (context: { rowIndex: number; values: readonly string[] }) => TRow;
  delimiter?: string;
  includeHeaders?: boolean;
};

export type ImportGridDelimitedTextResult<TRow> = {
  rows: TRow[];
  headers: string[];
};

export function importGridDelimitedText<TRow>(
  options: ImportGridDelimitedTextOptions<TRow>,
): ImportGridDelimitedTextResult<TRow> {
  const delimiter = options.delimiter ?? ",";
  const rows = parseDelimitedText(options.text, delimiter);
  const headers = options.includeHeaders ?? true ? rows[0] ?? [] : [];
  const dataRows = options.includeHeaders ?? true ? rows.slice(1) : rows;

  return {
    headers,
    rows: dataRows.map((values, rowIndex) => {
      const row = options.createRow({ rowIndex, values });

      options.columns.forEach((column, columnIndex) => {
        if (!isFieldBackedColumn(column)) {
          return;
        }

        const rawValue = values[columnIndex] ?? "";
        const value = column.valueParser ? column.valueParser(rawValue, row) : rawValue;

        setFieldValue(row, column.field, value);
      });

      return row;
    }),
  };
}

export function parseDelimitedText(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (quoted) {
      if (char === "\"" && nextChar === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);

  if (row.length > 1 || row[0] !== "" || text.endsWith(delimiter)) {
    rows.push(row);
  }

  return rows;
}

function isFieldBackedColumn<TRow>(
  column: ResolvedColumnDef<TRow> | ColumnDef<TRow>,
): column is (ResolvedColumnDef<TRow> | ColumnDef<TRow>) & { field: string } {
  return typeof column.field === "string" && column.field.length > 0;
}

function setFieldValue<TRow>(row: TRow, field: string, value: unknown): void {
  const parts = field.split(".");
  let target: Record<string, unknown> = row as Record<string, unknown>;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const current = target[part];

    if (!current || typeof current !== "object") {
      target[part] = {};
    }

    target = target[part] as Record<string, unknown>;
  }

  target[parts[parts.length - 1]] = value;
}
