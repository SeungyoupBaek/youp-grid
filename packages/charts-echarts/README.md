# @youp-grid/charts-echarts

Optional Apache ECharts renderer for Youp Grid chart datasets. Supports bar, line, area, pie, scatter, stacking, dual axes, responsive resize, and image export.

```ts
import { createEChartsRenderer } from "@youp-grid/charts-echarts";

const renderChart = createEChartsRenderer({ renderer: "canvas" });
```

The returned render handle supplies `destroy()` and `exportImage()` methods. `mountYoupGridECharts` additionally exposes imperative `update()`, `resize()`, and `getDataUrl()` methods.
