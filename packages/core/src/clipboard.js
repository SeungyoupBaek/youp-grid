export function normalizeCellRange(range) {
    return {
        startRowIndex: Math.min(range.anchor.rowIndex, range.focus.rowIndex),
        endRowIndex: Math.max(range.anchor.rowIndex, range.focus.rowIndex),
        startColumnIndex: Math.min(range.anchor.columnIndex, range.focus.columnIndex),
        endColumnIndex: Math.max(range.anchor.columnIndex, range.focus.columnIndex),
    };
}
export function isCellInRange(rowIndex, columnIndex, range) {
    const normalized = normalizeCellRange(range);
    return (rowIndex >= normalized.startRowIndex &&
        rowIndex <= normalized.endRowIndex &&
        columnIndex >= normalized.startColumnIndex &&
        columnIndex <= normalized.endColumnIndex);
}
export function serializeGridRange(options) {
    const range = normalizeCellRange(options.range);
    const lines = [];
    for (let rowIndex = range.startRowIndex; rowIndex <= range.endRowIndex; rowIndex += 1) {
        const row = options.rows[rowIndex];
        if (!row) {
            continue;
        }
        const values = [];
        for (let columnIndex = range.startColumnIndex; columnIndex <= range.endColumnIndex; columnIndex += 1) {
            const column = options.columns[columnIndex];
            const value = column ? column.accessor(row.original) : "";
            values.push(escapeClipboardCell(formatClipboardValue(value)));
        }
        lines.push(values.join("\t"));
    }
    return lines.join("\n");
}
export function parseClipboardText(text) {
    const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const trimmedText = normalizedText.endsWith("\n") ? normalizedText.slice(0, -1) : normalizedText;
    if (!trimmedText) {
        return [];
    }
    return trimmedText.split("\n").map((line) => {
        return line.split("\t").map((cell) => {
            return cell.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\\\/g, "\\");
        });
    });
}
export function getClipboardPasteCells(options) {
    if (options.values.length === 0) {
        return [];
    }
    const rowLimit = options.fillRange
        ? options.fillRange.endRowIndex - options.fillRange.startRowIndex + 1
        : options.values.length;
    const columnLimit = options.fillRange
        ? options.fillRange.endColumnIndex - options.fillRange.startColumnIndex + 1
        : Math.max(...options.values.map((row) => row.length));
    const cells = [];
    for (let rowOffset = 0; rowOffset < rowLimit; rowOffset += 1) {
        const rowIndex = options.startCell.rowIndex + rowOffset;
        if (rowIndex < 0 || rowIndex >= options.rowCount) {
            continue;
        }
        for (let columnOffset = 0; columnOffset < columnLimit; columnOffset += 1) {
            const columnIndex = options.startCell.columnIndex + columnOffset;
            if (columnIndex < 0 || columnIndex >= options.columnCount) {
                continue;
            }
            const valueRow = options.values[rowOffset % options.values.length] ?? [""];
            const value = valueRow[columnOffset % Math.max(1, valueRow.length)] ?? "";
            cells.push({ rowIndex, columnIndex, value });
        }
    }
    return cells;
}
function formatClipboardValue(value) {
    return value == null ? "" : String(value);
}
function escapeClipboardCell(value) {
    return value.replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n");
}
