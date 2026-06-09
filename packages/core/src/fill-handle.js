export function getFillHandleTargetRange(options) {
    if (options.rowCount === 0 || options.columnCount === 0) {
        return undefined;
    }
    const targetRowIndex = clamp(options.targetCell.rowIndex, 0, options.rowCount - 1);
    const targetColumnIndex = clamp(options.targetCell.columnIndex, 0, options.columnCount - 1);
    const range = options.sourceRange;
    const targetInSourceRows = targetRowIndex >= range.startRowIndex && targetRowIndex <= range.endRowIndex;
    const targetInSourceColumns = targetColumnIndex >= range.startColumnIndex && targetColumnIndex <= range.endColumnIndex;
    if (targetInSourceRows && targetInSourceColumns) {
        return undefined;
    }
    if (targetRowIndex > range.endRowIndex) {
        return {
            startRowIndex: range.endRowIndex + 1,
            endRowIndex: targetRowIndex,
            startColumnIndex: range.startColumnIndex,
            endColumnIndex: range.endColumnIndex,
        };
    }
    if (targetRowIndex < range.startRowIndex) {
        return {
            startRowIndex: targetRowIndex,
            endRowIndex: range.startRowIndex - 1,
            startColumnIndex: range.startColumnIndex,
            endColumnIndex: range.endColumnIndex,
        };
    }
    if (targetColumnIndex > range.endColumnIndex) {
        return {
            startRowIndex: range.startRowIndex,
            endRowIndex: range.endRowIndex,
            startColumnIndex: range.endColumnIndex + 1,
            endColumnIndex: targetColumnIndex,
        };
    }
    if (targetColumnIndex < range.startColumnIndex) {
        return {
            startRowIndex: range.startRowIndex,
            endRowIndex: range.endRowIndex,
            startColumnIndex: targetColumnIndex,
            endColumnIndex: range.startColumnIndex - 1,
        };
    }
    return undefined;
}
export function getFillHandleCells(options) {
    const sourceRowCount = options.sourceRange.endRowIndex - options.sourceRange.startRowIndex + 1;
    const sourceColumnCount = options.sourceRange.endColumnIndex - options.sourceRange.startColumnIndex + 1;
    const cells = [];
    for (let rowIndex = options.targetRange.startRowIndex; rowIndex <= options.targetRange.endRowIndex; rowIndex += 1) {
        const sourceRowIndex = options.sourceRange.startRowIndex +
            ((rowIndex - options.targetRange.startRowIndex) % sourceRowCount);
        for (let columnIndex = options.targetRange.startColumnIndex; columnIndex <= options.targetRange.endColumnIndex; columnIndex += 1) {
            const sourceColumnIndex = options.sourceRange.startColumnIndex +
                ((columnIndex - options.targetRange.startColumnIndex) % sourceColumnCount);
            cells.push({
                rowIndex,
                columnIndex,
                sourceRowIndex,
                sourceColumnIndex,
                value: options.getValue({
                    rowIndex: sourceRowIndex,
                    columnIndex: sourceColumnIndex,
                }),
            });
        }
    }
    return cells;
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
