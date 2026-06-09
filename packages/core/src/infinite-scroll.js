export function getInfiniteScrollTrigger(options) {
    const rowCount = Math.max(0, Math.trunc(options.rowCount));
    const lastVisibleRowIndex = normalizeLastVisibleRowIndex(options.lastVisibleRowIndex, rowCount);
    const threshold = Math.max(0, Math.trunc(options.threshold ?? 20));
    const remainingRows = Math.max(0, rowCount - 1 - lastVisibleRowIndex);
    const hasMoreRows = options.hasMoreRows ?? true;
    const loading = options.loading ?? false;
    return {
        shouldLoadMore: rowCount > 0 && hasMoreRows && !loading && remainingRows <= threshold,
        rowCount,
        lastVisibleRowIndex,
        threshold,
        remainingRows,
    };
}
function normalizeLastVisibleRowIndex(lastVisibleRowIndex, rowCount) {
    if (rowCount === 0) {
        return -1;
    }
    return clamp(Math.trunc(lastVisibleRowIndex), -1, rowCount - 1);
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
