import type {
  VariableVirtualRangeOptions,
  VirtualItem,
  VirtualRange,
  VirtualRangeOptions,
} from "./types.ts";

export function getVirtualRange(options: VirtualRangeOptions): VirtualRange {
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

export function getVariableVirtualRange(options: VariableVirtualRangeOptions): VirtualRange {
  const itemSize = options.itemSize;

  if (typeof itemSize === "number") {
    return getVirtualRange({ ...options, itemSize });
  }

  const itemCount = Math.max(0, options.itemCount);
  const viewportSize = Math.max(0, options.viewportSize);
  const scrollOffset = Math.max(0, options.scrollOffset);
  const overscan = Math.max(0, options.overscan ?? 3);
  const sizes = Array.from({ length: itemCount }, (_, index) => {
    const size = itemSize(index);
    return Math.max(1, size);
  });
  const offsets = new Array<number>(itemCount + 1).fill(0);

  sizes.forEach((size, index) => {
    offsets[index + 1] = offsets[index] + size;
  });

  const totalSize = offsets[itemCount] ?? 0;
  if (itemCount === 0 || viewportSize === 0) {
    return emptyVirtualRange(totalSize);
  }

  const visibleStart = findItemIndex(offsets, Math.min(scrollOffset, totalSize));
  const visibleEnd = findItemIndex(offsets, Math.min(scrollOffset + viewportSize, totalSize));
  const startIndex = clamp(visibleStart - overscan, 0, itemCount - 1);
  const endIndex = clamp(visibleEnd + overscan, startIndex, itemCount - 1);
  const items: VirtualItem[] = [];

  for (let index = startIndex; index <= endIndex; index += 1) {
    const start = offsets[index];
    const size = sizes[index];
    items.push({ index, start, size, end: start + size });
  }

  return {
    startIndex,
    endIndex,
    beforeSize: offsets[startIndex],
    afterSize: Math.max(0, totalSize - offsets[endIndex + 1]),
    totalSize,
    items,
  };
}

function emptyVirtualRange(totalSize: number): VirtualRange {
  return { startIndex: 0, endIndex: -1, beforeSize: 0, afterSize: 0, totalSize, items: [] };
}

function findItemIndex(offsets: readonly number[], offset: number): number {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((offsets[middle + 1] ?? 0) <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return low;
}

function createVirtualItems(startIndex: number, endIndex: number, itemSize: number): VirtualItem[] {
  const items: VirtualItem[] = [];

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
