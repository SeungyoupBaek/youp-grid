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
    const isVerticalFill = options.targetRange.startColumnIndex === options.sourceRange.startColumnIndex &&
        options.targetRange.endColumnIndex === options.sourceRange.endColumnIndex;
    const numericSeriesByLane = new Map();
    const cells = [];
    if (isVerticalFill) {
        for (let columnIndex = options.sourceRange.startColumnIndex; columnIndex <= options.sourceRange.endColumnIndex; columnIndex += 1) {
            const series = getNumericSeries(Array.from({ length: sourceRowCount }, (_, offset) => options.getValue({
                rowIndex: options.sourceRange.startRowIndex + offset,
                columnIndex,
            })));
            if (series) {
                numericSeriesByLane.set(columnIndex, series);
            }
        }
    }
    else {
        for (let rowIndex = options.sourceRange.startRowIndex; rowIndex <= options.sourceRange.endRowIndex; rowIndex += 1) {
            const series = getNumericSeries(Array.from({ length: sourceColumnCount }, (_, offset) => options.getValue({
                rowIndex,
                columnIndex: options.sourceRange.startColumnIndex + offset,
            })));
            if (series) {
                numericSeriesByLane.set(rowIndex, series);
            }
        }
    }
    for (let rowIndex = options.targetRange.startRowIndex; rowIndex <= options.targetRange.endRowIndex; rowIndex += 1) {
        const sourceRowIndex = options.sourceRange.startRowIndex +
            ((rowIndex - options.targetRange.startRowIndex) % sourceRowCount);
        for (let columnIndex = options.targetRange.startColumnIndex; columnIndex <= options.targetRange.endColumnIndex; columnIndex += 1) {
            const sourceColumnIndex = options.sourceRange.startColumnIndex +
                ((columnIndex - options.targetRange.startColumnIndex) % sourceColumnCount);
            const series = numericSeriesByLane.get(isVerticalFill ? columnIndex : rowIndex);
            const value = series
                ? series.firstValue +
                    series.step *
                        (isVerticalFill
                            ? rowIndex - options.sourceRange.startRowIndex
                            : columnIndex - options.sourceRange.startColumnIndex)
                : options.getValue({
                    rowIndex: sourceRowIndex,
                    columnIndex: sourceColumnIndex,
                });
            cells.push({
                rowIndex,
                columnIndex,
                sourceRowIndex,
                sourceColumnIndex,
                value,
            });
        }
    }
    return cells;
}
function getNumericSeries(values) {
    if (values.length === 0 || !values.every(isFiniteNumber)) {
        return undefined;
    }
    const firstValue = values[0];
    const step = values.length === 1 ? 1 : values[1] - firstValue;
    for (let index = 2; index < values.length; index += 1) {
        if (!areNumbersClose(values[index] - values[index - 1], step)) {
            return undefined;
        }
    }
    return { firstValue, step };
}
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
function areNumbersClose(left, right) {
    const scale = Math.max(1, Math.abs(left), Math.abs(right));
    return Math.abs(left - right) <= Number.EPSILON * scale * 16;
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
