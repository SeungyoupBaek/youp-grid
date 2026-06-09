import { getColumnById } from "./columns.js";
export function applySorting(rows, columns, sortRules = []) {
    const activeRules = sortRules.filter((rule) => rule.direction);
    if (activeRules.length === 0) {
        return [...rows];
    }
    return [...rows].sort((left, right) => {
        for (const rule of activeRules) {
            const column = getColumnById(columns, rule.columnId);
            if (!column) {
                continue;
            }
            const result = compareRows(left, right, column);
            if (result !== 0) {
                return rule.direction === "desc" ? -result : result;
            }
        }
        return left.index - right.index;
    });
}
function compareRows(left, right, column) {
    const leftValue = column.accessor(left.original);
    const rightValue = column.accessor(right.original);
    if (column.comparator) {
        return column.comparator(leftValue, rightValue, left.original, right.original);
    }
    return comparePrimitive(leftValue, rightValue);
}
function comparePrimitive(left, right) {
    if (left == null && right == null) {
        return 0;
    }
    if (left == null) {
        return -1;
    }
    if (right == null) {
        return 1;
    }
    if (typeof left === "number" && typeof right === "number") {
        return left - right;
    }
    if (left instanceof Date && right instanceof Date) {
        return left.getTime() - right.getTime();
    }
    return String(left).localeCompare(String(right), undefined, {
        numeric: true,
        sensitivity: "base",
    });
}
