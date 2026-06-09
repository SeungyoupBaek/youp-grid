export function normalizeColumns(columns) {
    const seen = new Set();
    return columns.map((column) => {
        const id = resolveColumnId(column);
        if (seen.has(id)) {
            throw new Error(`Duplicate grid column id: ${id}`);
        }
        seen.add(id);
        return {
            ...column,
            id,
            headerName: column.headerName ?? id,
            accessor: column.accessor ?? createFieldAccessor(column.field),
        };
    });
}
export function getColumnById(columns, columnId) {
    return columns.find((column) => column.id === columnId);
}
function resolveColumnId(column) {
    if (column.id) {
        return column.id;
    }
    if (column.field) {
        return String(column.field);
    }
    throw new Error("Column requires either `id` or `field`.");
}
function createFieldAccessor(field) {
    if (!field) {
        throw new Error("Column without `field` requires an explicit `accessor`.");
    }
    return (row) => {
        return getNestedValue(row, String(field));
    };
}
function getNestedValue(row, path) {
    return path.split(".").reduce((value, key) => {
        if (value == null || typeof value !== "object") {
            return undefined;
        }
        return value[key];
    }, row);
}
