import { getColumnById } from "./columns.js";
export function applyRowGrouping(rows, columns, rowGrouping) {
    const groupColumns = (rowGrouping?.columnIds ?? [])
        .map((columnId) => getColumnById(columns, columnId))
        .filter((column) => Boolean(column));
    if (groupColumns.length === 0) {
        return [...rows];
    }
    const collapsedGroupIds = new Set(rowGrouping?.collapsedGroupIds ?? []);
    const groupedRows = groupRows(rows, groupColumns, collapsedGroupIds, 0, []);
    return groupedRows.map((row, index) => isRowGroupNode(row) ? { ...row, index } : row);
}
export function isRowGroupNode(row) {
    return "type" in row && row.type === "group";
}
function groupRows(rows, columns, collapsedGroupIds, depth, path) {
    const column = columns[depth];
    if (!column) {
        return [...rows];
    }
    const grouped = new Map();
    for (const row of rows) {
        const value = column.accessor(row.original);
        const key = stringifyGroupValue(value);
        const existing = grouped.get(key);
        if (existing) {
            existing.rows.push(row);
            continue;
        }
        grouped.set(key, { value, rows: [row] });
    }
    const result = [];
    for (const [key, group] of grouped) {
        const groupId = createGroupId([...path, `${column.id}:${key}`]);
        const expanded = !collapsedGroupIds.has(groupId);
        result.push({
            type: "group",
            id: groupId,
            groupId,
            index: result.length,
            depth,
            columnId: column.id,
            value: group.value,
            label: stringifyGroupLabel(group.value),
            rowCount: group.rows.length,
            expanded,
        });
        if (expanded) {
            result.push(...groupRows(group.rows, columns, collapsedGroupIds, depth + 1, [
                ...path,
                `${column.id}:${key}`,
            ]));
        }
    }
    return result;
}
function createGroupId(path) {
    return `group:${path.join("/")}`;
}
function stringifyGroupValue(value) {
    return encodeURIComponent(stringifyGroupLabel(value));
}
function stringifyGroupLabel(value) {
    return String(value ?? "(empty)");
}
