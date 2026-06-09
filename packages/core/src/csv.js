export function exportGridCsv(options) {
    const delimiter = options.delimiter ?? ",";
    const lineBreak = options.lineBreak ?? "\n";
    const lines = [];
    if (options.includeHeaders ?? true) {
        lines.push(options.columns.map((column) => escapeCsvCell(column.headerName, delimiter)).join(delimiter));
    }
    for (const row of options.rows) {
        lines.push(options.columns
            .map((column) => {
            const value = column.accessor(row.original);
            const formattedValue = options.formatCell
                ? options.formatCell({ row, column, value })
                : formatCsvValue(column, row.original, value);
            return escapeCsvCell(formattedValue, delimiter);
        })
            .join(delimiter));
    }
    return lines.join(lineBreak);
}
function formatCsvValue(column, row, value) {
    return column.valueFormatter ? column.valueFormatter(value, row) : value;
}
function escapeCsvCell(value, delimiter) {
    const text = value == null ? "" : String(value);
    if (!text.includes(delimiter) && !text.includes("\"") && !text.includes("\n") && !text.includes("\r")) {
        return text;
    }
    return `"${text.replace(/"/g, "\"\"")}"`;
}
