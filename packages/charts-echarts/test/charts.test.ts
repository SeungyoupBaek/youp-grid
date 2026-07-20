import assert from "node:assert/strict";
import test from "node:test";

import type { GridChartDataset, GridChartSpec } from "@youp-grid/core";
import { buildEChartsOption } from "../src/index.ts";

const dataset: GridChartDataset = {
  dimensions: ["category", "orders"],
  source: [{ category: "A", orders: 3 }],
  categoryKey: "category",
  series: [{ columnId: "orders", dataKey: "orders", label: "Orders", axis: "left" }],
  sourceRowCount: 1,
  truncated: false,
};

test("ECharts adapter maps area, pie, and scatter chart specifications", () => {
  const area = buildEChartsOption(dataset, { type: "area", series: [{ columnId: "orders" }] });
  assert.equal((area.series as { type?: string }[])[0]?.type, "line");
  assert.deepEqual((area.series as { areaStyle?: object }[])[0]?.areaStyle, {});

  const pie = buildEChartsOption(dataset, { type: "pie", series: [{ columnId: "orders" }] });
  assert.equal((pie.series as { type?: string }[])[0]?.type, "pie");
  assert.equal(pie.xAxis, undefined);

  const multiSeriesPie = buildEChartsOption({
    ...dataset,
    dimensions: [...dataset.dimensions, "revenue"],
    series: [
      ...dataset.series,
      { columnId: "revenue", dataKey: "revenue", label: "Revenue", axis: "left" },
    ],
  }, { type: "pie", series: [{ columnId: "orders" }, { columnId: "revenue" }] });
  assert.equal((multiSeriesPie.series as unknown[]).length, 1);

  const scatterSpec: GridChartSpec = { type: "scatter", xColumnId: "category", series: [{ columnId: "orders" }] };
  const scatter = buildEChartsOption({ ...dataset, xKey: "category" }, scatterSpec);
  assert.equal((scatter.series as { type?: string }[])[0]?.type, "scatter");
});
