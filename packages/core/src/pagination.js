export function applyPagination(rows, pagination) {
    if (!pagination) {
        return { rows: [...rows] };
    }
    const pageSize = Math.max(1, pagination.pageSize);
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    const pageIndex = clamp(pagination.pageIndex, 0, pageCount - 1);
    const start = pageIndex * pageSize;
    return {
        rows: rows.slice(start, start + pageSize),
        pageCount,
    };
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
