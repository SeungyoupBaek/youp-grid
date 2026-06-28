import type { ResolvedColumnDef, RowNode } from "./types.ts";

export type ExcelCellFormatter<TRow> = (context: {
  row: RowNode<TRow>;
  column: ResolvedColumnDef<TRow>;
  value: unknown;
}) => unknown;

export type ExportGridExcelOptions<TRow> = {
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
  includeHeaders?: boolean;
  sheetName?: string;
  formatCell?: ExcelCellFormatter<TRow>;
};

export function exportGridExcel<TRow>(options: ExportGridExcelOptions<TRow>): string {
  const rows: string[] = [];

  if (options.includeHeaders ?? true) {
    rows.push(renderExcelRow(options.columns.map((column) => ({
      type: "String" as const,
      value: column.headerName,
    }))));
  }

  for (const row of options.rows) {
    rows.push(renderExcelRow(options.columns.map((column) => {
      const value = column.accessor(row.original);
      const formattedValue = options.formatCell
        ? options.formatCell({ row, column, value })
        : formatExcelValue(column, row.original, value);

      return getExcelCell(formattedValue);
    })));
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    `  <Worksheet ss:Name="${escapeXmlAttribute(options.sheetName ?? "Sheet1")}">`,
    "    <Table>",
    ...rows,
    "    </Table>",
    "  </Worksheet>",
    "</Workbook>",
    "",
  ].join("\n");
}

function formatExcelValue<TRow>(
  column: ResolvedColumnDef<TRow>,
  row: TRow,
  value: unknown,
): unknown {
  return column.valueFormatter ? column.valueFormatter(value, row) : value;
}

function renderExcelRow(cells: readonly { type: "String" | "Number" | "Boolean"; value: unknown }[]): string {
  return `      <Row>${cells.map(renderExcelCell).join("")}</Row>`;
}

function renderExcelCell(cell: { type: "String" | "Number" | "Boolean"; value: unknown }): string {
  return `<Cell><Data ss:Type="${cell.type}">${escapeXmlText(String(cell.value ?? ""))}</Data></Cell>`;
}

function getExcelCell(value: unknown): { type: "String" | "Number" | "Boolean"; value: unknown } {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { type: "Number", value };
  }

  if (typeof value === "boolean") {
    return { type: "Boolean", value: value ? 1 : 0 };
  }

  return { type: "String", value: value ?? "" };
}

function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replace(/"/g, "&quot;");
}
