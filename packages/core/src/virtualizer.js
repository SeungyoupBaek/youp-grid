export function getVirtualRange(options) {
    const itemCount = Math.max(0, options.itemCount);
    const itemSize = Math.max(1, options.itemSize);
    const viewportSize = Math.max(0, options.viewportSize);
    const scrollOffset = Math.max(0, options.scrollOffset);
    const overscan = Math.max(0, options.overscan ?? 3);
    const totalSize = itemCount * itemSize;
    if (itemCount === 0 || viewportSize === 0) {
        return {
            startIndex: 0,
            endIndex: -1,
            beforeSize: 0,
            afterSize: 0,
            totalSize,
            items: [],
        };
    }
    const visibleStart = Math.floor(scrollOffset / itemSize);
    const visibleEnd = Math.ceil((scrollOffset + viewportSize) / itemSize) - 1;
    const startIndex = clamp(visibleStart - overscan, 0, itemCount - 1);
    const endIndex = clamp(visibleEnd + overscan, startIndex, itemCount - 1);
    const items = createVirtualItems(startIndex, endIndex, itemSize);
    return {
        startIndex,
        endIndex,
        beforeSize: startIndex * itemSize,
        afterSize: Math.max(0, totalSize - (endIndex + 1) * itemSize),
        totalSize,
        items,
    };
}
function createVirtualItems(startIndex, endIndex, itemSize) {
    const items = [];
    for (let index = startIndex; index <= endIndex; index += 1) {
        const start = index * itemSize;
        items.push({
            index,
            start,
            size: itemSize,
            end: start + itemSize,
        });
    }
    return items;
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
