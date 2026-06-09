import { getColumnById } from "./columns.js";
export function applyAggregation(rows, columns, rules = []) {
    return rules
        .map((rule) => {
        const column = getColumnById(columns, rule.columnId);
        if (!column) {
            return undefined;
        }
        return aggregateColumn(rows, column, rule);
    })
        .filter((result) => Boolean(result));
}
function aggregateColumn(rows, column, rule) {
    const numericValues = getNumericValues(rows, column);
    return {
        columnId: column.id,
        function: rule.function,
        label: rule.label ?? getAggregationLabel(rule.function),
        value: getAggregationValue(rule.function, rows.length, numericValues),
        rowCount: rows.length,
        valueCount: numericValues.length,
    };
}
function getNumericValues(rows, column) {
    return rows
        .map((row) => column.accessor(row.original))
        .filter((value) => typeof value === "number" && Number.isFinite(value));
}
function getAggregationValue(fn, rowCount, values) {
    switch (fn) {
        case "count":
            return rowCount;
        case "sum":
            return values.reduce((sum, value) => sum + value, 0);
        case "avg":
            return values.length > 0
                ? values.reduce((sum, value) => sum + value, 0) / values.length
                : undefined;
        case "min":
            return values.length > 0 ? Math.min(...values) : undefined;
        case "max":
            return values.length > 0 ? Math.max(...values) : undefined;
    }
}
function getAggregationLabel(fn) {
    switch (fn) {
        case "sum":
            return "Sum";
        case "avg":
            return "Avg";
        case "min":
            return "Min";
        case "max":
            return "Max";
        case "count":
            return "Count";
    }
}
