import type { ColumnDef, ResolvedColumnDef } from "./types.ts";

export type ImportGridDelimitedTextOptions<TRow> = {
  text: string;
  columns: readonly ResolvedColumnDef<TRow>[] | readonly ColumnDef<TRow>[];
  createRow: (context: { rowIndex: number; values: readonly string[] }) => TRow;
  delimiter?: string;
  includeHeaders?: boolean;
  columnMappings?: readonly ImportGridColumnMapping[];
};

export type ImportGridColumnMapping = {
  columnId: string;
  sourceIndex: number;
  sourceHeader?: string;
};

export type ImportGridDelimitedTextIssue = {
  rowIndex: number;
  columnId?: string;
  columnIndex?: number;
  value?: string;
  message: string;
};

export type ImportGridDelimitedTextRowResult<TRow> = {
  row: TRow;
  sourceRowIndex: number;
  values: readonly string[];
  issues: readonly ImportGridDelimitedTextIssue[];
};

export type ImportGridDelimitedTextResult<TRow> = {
  rows: TRow[];
  headers: string[];
  sourceRows: string[][];
  rowResults: ImportGridDelimitedTextRowResult<TRow>[];
  issues: ImportGridDelimitedTextIssue[];
};

export function importGridDelimitedText<TRow>(
  options: ImportGridDelimitedTextOptions<TRow>,
): ImportGridDelimitedTextResult<TRow> {
  const delimiter = options.delimiter ?? ",";
  const rows = parseDelimitedText(options.text, delimiter);
  const headers = options.includeHeaders ?? true ? rows[0] ?? [] : [];
  const dataRows = options.includeHeaders ?? true ? rows.slice(1) : rows;
  const mappings = options.columnMappings ?? createIndexColumnMappings(options.columns, headers);
  const rowResults = dataRows.map((values, rowIndex) => {
    const row = options.createRow({ rowIndex, values });
    const issues: ImportGridDelimitedTextIssue[] = [];

    mappings.forEach((mapping) => {
      const column = options.columns.find((candidate) => getColumnId(candidate) === mapping.columnId);

      if (!column || !isFieldBackedColumn(column)) {
        return;
      }

      const rawValue = values[mapping.sourceIndex] ?? "";
      try {
        const value = column.valueParser ? column.valueParser(rawValue, row) : rawValue;

        setFieldValue(row, column.field, value);
      } catch (error) {
        issues.push({
          rowIndex,
          columnId: mapping.columnId,
          columnIndex: mapping.sourceIndex,
          value: rawValue,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    return {
      row,
      sourceRowIndex: rowIndex,
      values,
      issues,
    };
  });

  return {
    headers,
    rows: rowResults.map((result) => result.row),
    sourceRows: dataRows,
    rowResults,
    issues: rowResults.flatMap((result) => result.issues),
  };
}

export function createHeaderColumnMappings<TRow>(
  columns: readonly ResolvedColumnDef<TRow>[] | readonly ColumnDef<TRow>[],
  headers: readonly string[],
): ImportGridColumnMapping[] {
  const headerIndexByName = new Map(headers.map((header, index) => [normalizeImportHeader(header), index]));

  return columns.flatMap((column, columnIndex) => {
    const candidates = [column.headerName, column.id, column.field]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .map(normalizeImportHeader);
    const sourceIndex = candidates.reduce<number | undefined>((matchedIndex, candidate) => {
      return matchedIndex ?? headerIndexByName.get(candidate);
    }, undefined);

    return [{
      columnId: getColumnId(column, columnIndex),
      sourceIndex: sourceIndex ?? columnIndex,
      sourceHeader: sourceIndex === undefined ? headers[columnIndex] : headers[sourceIndex],
    }];
  });
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

function createIndexColumnMappings<TRow>(
  columns: readonly ResolvedColumnDef<TRow>[] | readonly ColumnDef<TRow>[],
  headers: readonly string[],
): ImportGridColumnMapping[] {
  return columns.map((column, columnIndex) => ({
    columnId: getColumnId(column, columnIndex),
    sourceIndex: columnIndex,
    sourceHeader: headers[columnIndex],
  }));
}

function getColumnId<TRow>(column: ResolvedColumnDef<TRow> | ColumnDef<TRow>, fallbackIndex = 0) {
  return column.id ?? column.field ?? String(fallbackIndex);
}

function normalizeImportHeader(value: string) {
  return value.trim().toLocaleLowerCase();
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
