import type { ResolvedColumnDef, RowNode } from "./types.ts";
import { getRowNodeValue } from "./formula.ts";

export type CsvCellFormatter<TRow> = (context: {
  row: RowNode<TRow>;
  column: ResolvedColumnDef<TRow>;
  value: unknown;
}) => unknown;

export type ExportGridCsvOptions<TRow> = {
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
  includeHeaders?: boolean;
  delimiter?: string;
  lineBreak?: string;
  formatCell?: CsvCellFormatter<TRow>;
};

export function exportGridCsv<TRow>(options: ExportGridCsvOptions<TRow>): string {
  const delimiter = options.delimiter ?? ",";
  const lineBreak = options.lineBreak ?? "\n";
  const lines: string[] = [];

  if (options.includeHeaders ?? true) {
    lines.push(options.columns.map((column) => escapeCsvCell(column.headerName, delimiter)).join(delimiter));
  }

  for (const row of options.rows) {
    lines.push(
      options.columns
        .map((column) => {
          const value = getRowNodeValue(row, column);
          const formattedValue = options.formatCell
            ? options.formatCell({ row, column, value })
            : formatCsvValue(column, row.original, value);

          return escapeCsvCell(formattedValue, delimiter);
        })
        .join(delimiter),
    );
  }

  return lines.join(lineBreak);
}

function formatCsvValue<TRow>(
  column: ResolvedColumnDef<TRow>,
  row: TRow,
  value: unknown,
): unknown {
  return column.valueFormatter ? column.valueFormatter(value, row) : value;
}

function escapeCsvCell(value: unknown, delimiter: string): string {
  const text = value == null ? "" : String(value);

  if (!text.includes(delimiter) && !text.includes("\"") && !text.includes("\n") && !text.includes("\r")) {
    return text;
  }

  return `"${text.replace(/"/g, "\"\"")}"`;
}
