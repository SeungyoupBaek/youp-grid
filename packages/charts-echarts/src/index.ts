import { init, use, type ECharts, type SetOptionOpts } from "echarts/core";
import { BarChart, LineChart, PieChart, ScatterChart } from "echarts/charts";
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
} from "echarts/components";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
import type { GridChartDataset, GridChartSpec } from "@youp-grid/core";

use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
  CanvasRenderer,
  SVGRenderer,
]);

export type EChartsTheme = string | object;

export type YoupGridEChartsController = {
  chart: ECharts;
  update: (dataset: GridChartDataset, spec: GridChartSpec) => void;
  resize: () => void;
  getDataUrl: (options?: Parameters<ECharts["getDataURL"]>[0]) => string;
  destroy: () => void;
};

export type YoupGridEChartsRenderHandle = {
  destroy: () => void;
  exportImage: () => string;
};

export type MountYoupGridEChartsOptions = {
  dataset: GridChartDataset;
  spec: GridChartSpec;
  theme?: EChartsTheme;
  renderer?: "canvas" | "svg";
  setOption?: SetOptionOpts;
};

export function buildEChartsOption(dataset: GridChartDataset, spec: GridChartSpec): EChartsOption {
  const isPie = spec.type === "pie";
  const isScatter = spec.type === "scatter";
  const categoryKey = dataset.categoryKey ?? dataset.dimensions[0];
  const xKey = dataset.xKey ?? categoryKey;
  const chartSeries = isPie ? dataset.series.slice(0, 1) : dataset.series;

  return {
    title: spec.title ? { text: spec.title, left: 8, top: 4 } : undefined,
    tooltip: { trigger: isPie || isScatter ? "item" : "axis" },
    legend: { show: spec.showLegend ?? chartSeries.length > 1, top: spec.title ? 36 : 8 },
    dataset: { dimensions: dataset.dimensions, source: dataset.source },
    grid: isPie ? undefined : { left: 52, right: 28, top: spec.title ? 72 : 48, bottom: 48, containLabel: true },
    xAxis: isPie ? undefined : {
      type: isScatter ? "value" : "category",
      name: isScatter ? xKey : undefined,
    },
    yAxis: isPie ? undefined : [
      { type: "value" },
      ...(chartSeries.some((series) => series.axis === "right")
        ? [{ type: "value" as const, position: "right" as const }]
        : []),
    ],
    series: chartSeries.map((series) => {
      if (isPie) {
        return {
          name: series.label,
          type: "pie" as const,
          radius: ["35%", "68%"],
          encode: { itemName: categoryKey, value: series.dataKey, tooltip: series.dataKey },
        };
      }
      if (isScatter) {
        return {
          name: series.label,
          type: "scatter" as const,
          encode: { x: xKey, y: series.dataKey, tooltip: [xKey, series.dataKey] },
          yAxisIndex: series.axis === "right" ? 1 : 0,
        };
      }
      return {
        name: series.label,
        type: spec.type === "bar" ? "bar" as const : "line" as const,
        areaStyle: spec.type === "area" ? {} : undefined,
        stack: spec.stacked ? "total" : undefined,
        smooth: spec.type === "line" || spec.type === "area",
        encode: { x: categoryKey, y: series.dataKey, tooltip: series.dataKey },
        yAxisIndex: series.axis === "right" ? 1 : 0,
      };
    }),
    animationDuration: 240,
  };
}

export function mountYoupGridECharts(
  element: HTMLElement,
  options: MountYoupGridEChartsOptions,
): YoupGridEChartsController {
  const chart = init(element, options.theme, { renderer: options.renderer ?? "canvas" });
  const update = (dataset: GridChartDataset, spec: GridChartSpec) => {
    chart.setOption(buildEChartsOption(dataset, spec), options.setOption ?? { notMerge: true });
  };
  update(options.dataset, options.spec);
  return {
    chart,
    update,
    resize: () => chart.resize(),
    getDataUrl: (dataUrlOptions) => chart.getDataURL(dataUrlOptions),
    destroy: () => chart.dispose(),
  };
}

export function createEChartsRenderer(options: {
  theme?: EChartsTheme;
  renderer?: "canvas" | "svg";
} = {}): (
  element: HTMLElement,
  dataset: GridChartDataset,
  spec: GridChartSpec,
) => YoupGridEChartsRenderHandle {
  return (element, dataset, spec) => {
    const controller = mountYoupGridECharts(element, { ...options, dataset, spec });
    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => controller.resize());
    observer?.observe(element);
    return {
      destroy: () => {
        observer?.disconnect();
        controller.destroy();
      },
      exportImage: () => controller.getDataUrl({
        type: "png",
        pixelRatio: 2,
        backgroundColor: "#ffffff",
      }),
    };
  };
}
