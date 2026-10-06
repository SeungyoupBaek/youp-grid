import ExcelJS from "exceljs";
import { getRowNodeValue, type GridImportTable, type GridWorkbookAdapter } from "@youp-grid/core";

/** ExcelJS is loaded only by applications that install this optional package. */
export function createXlsxAdapter(): GridWorkbookAdapter {
  return {
    async read(data) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(data);
      return workbook.worksheets.map((sheet): GridImportTable => {
        const width = sheet.columnCount;
        const values = (row: ExcelJS.Row) => Array.from({ length: width }, (_, index) => readValue(row.getCell(index + 1).value));
        return {
          name: sheet.name,
          headers: values(sheet.getRow(1)).map((value) => String(value ?? "")),
          rows: Array.from({ length: Math.max(0, sheet.rowCount - 1) }, (_, index) => values(sheet.getRow(index + 2))),
        };
      });
    },
    async write(options) {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(options.sheetName ?? "Sheet1");
      if (options.includeHeaders ?? true) {
        sheet.addRow(options.columns.map((column) => column.headerName));
        sheet.getRow(1).font = { bold: true };
        sheet.views = [{ state: "frozen", ySplit: 1 }];
        if (options.columns.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: options.columns.length } };
      }
      for (const row of options.rows) sheet.addRow(options.columns.map((column) => {
        const value = getRowNodeValue(row, column);
        const formatted = options.formatCell ? options.formatCell({ row, column, value }) : value;
        return formatted == null ? null : typeof formatted === "number" || typeof formatted === "boolean" || formatted instanceof Date ? formatted : String(formatted);
      }));
      options.columns.forEach((column, index) => { sheet.getColumn(index + 1).width = Math.max(10, Math.min(80, (column.width ?? 140) / 7)); });
      return new Uint8Array(await workbook.xlsx.writeBuffer());
    },
  };
}

function readValue(value: ExcelJS.CellValue): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return value.text;
    if ("error" in value) return value.error;
    if ("formula" in value || "sharedFormula" in value) {
      if (value.result === undefined) throw new Error("An imported formula has no cached result. Recalculate and save the workbook first.");
      return readValue(value.result);
    }
  }
  return value ?? "";
}
