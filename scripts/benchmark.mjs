import { performance } from "node:perf_hooks";

import {
  buildRowModel,
  createServerBlockCache,
  getVariableVirtualRange,
} from "../packages/core/dist/index.js";

const rowCount = 100_000;
const columnCount = 12;
const rows = Array.from({ length: rowCount }, (_, index) => ({
  id: index,
  group: `group-${index % 100}`,
  value: index % 10_000,
  label: `row-${index}`,
}));
const columns = Array.from({ length: columnCount }, (_, index) => ({
  id: `column-${index}`,
  headerName: `Column ${index}`,
  accessor: (row) => index % 3 === 0 ? row.group : index % 3 === 1 ? row.value : row.label,
}));

const timings = {};
timings.clientRowModelMs = measure(() => buildRowModel({ rows, columns }));
timings.filteredSortedModelMs = measure(() => buildRowModel({
  rows,
  columns,
  state: {
    filters: [{ columnId: "column-0", operator: "contains", value: "group-4" }],
    sort: [{ columnId: "column-1", direction: "desc" }],
  },
}));
timings.variableVirtualRangeMs = measure(() => getVariableVirtualRange({
  itemCount: rowCount,
  itemSize: (index) => index % 10 === 0 ? 64 : 38,
  viewportSize: 720,
  scrollOffset: 1_500_000,
  overscan: 5,
}));
timings.blockCacheWriteMs = measure(() => {
  const cache = createServerBlockCache({ blockSize: 100, maxBlocks: 100 });
  for (let blockIndex = 0; blockIndex < 1_000; blockIndex += 1) {
    cache.set("benchmark", blockIndex, { rows: rows.slice(0, 100) });
  }
});

console.log(JSON.stringify({ rowCount, columnCount, timings }, null, 2));

if (process.argv.includes("--assert")) {
  const limits = {
    clientRowModelMs: 2_500,
    filteredSortedModelMs: 3_500,
    variableVirtualRangeMs: 500,
    blockCacheWriteMs: 500,
  };
  const failures = Object.entries(limits)
    .filter(([name, limit]) => timings[name] > limit)
    .map(([name, limit]) => `${name}=${timings[name].toFixed(1)}ms (limit ${limit}ms)`);

  if (failures.length > 0) {
    throw new Error(`Performance benchmark failed: ${failures.join(", ")}`);
  }
}

function measure(run) {
  const start = performance.now();
  run();
  return Number((performance.now() - start).toFixed(3));
}
