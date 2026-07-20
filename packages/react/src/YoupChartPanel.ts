import type {
  AggregationFunctionName,
  GridChartDataset,
  GridChartSeries,
  GridChartSource,
  GridChartSpec,
  GridChartType,
} from "@youp-grid/core";
import { createElement, useEffect, useRef, useState, type ChangeEvent } from "react";
import type { YoupGridChartRenderer } from "./types.ts";

export type YoupChartPanelProps = {
  dataset: GridChartDataset;
  spec: GridChartSpec;
  renderer?: YoupGridChartRenderer;
  onSpecChange?: (spec: GridChartSpec) => void;
  height?: number | string;
  columns?: readonly { id: string; label: string }[];
};

const CHART_TYPES: GridChartType[] = ["bar", "line", "area", "pie", "scatter"];
const AGGREGATIONS: Array<AggregationFunctionName | "none"> = ["none", "sum", "avg", "count", "min", "max"];

export function YoupChartPanel(props: YoupChartPanelProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [exportImage, setExportImage] = useState<(() => string) | undefined>();
  const usesRowColumns = props.spec.source !== "pivot" && props.columns;
  const supportsStacking = props.spec.type === "bar" || props.spec.type === "line" || props.spec.type === "area";

  useEffect(() => {
    setExportImage(undefined);
    if (!chartRef.current || !props.renderer) return;
    const result = props.renderer(chartRef.current, props.dataset, props.spec);
    if (typeof result === "function") return result;
    if (!result) return;
    if (result.exportImage) setExportImage(() => result.exportImage);
    return result.destroy;
  }, [props.dataset, props.renderer, props.spec]);

  const updateSeries = (columnId: string, change: Partial<GridChartSeries>) => {
    props.onSpecChange?.({
      ...props.spec,
      series: props.spec.series.map((series) => series.columnId === columnId
        ? { ...series, ...change }
        : series),
    });
  };

  return createElement(
    "section",
    { className: "youp-grid__chart-panel", "aria-label": "Chart" },
    createElement(
      "div",
      { className: "youp-grid__chart-toolbar" },
      createElement("strong", undefined, props.spec.title ?? "Chart"),
      renderSelect("Chart type", props.spec.type, CHART_TYPES, (value) => props.onSpecChange?.({
        ...props.spec,
        type: value as GridChartType,
      })),
      renderSelect("Chart data source", props.spec.source ?? "rows", [
        { value: "rows", label: "All rows" },
        { value: "selection", label: "Selection" },
        { value: "pivot", label: "Pivot" },
      ], (value) => props.onSpecChange?.({ ...props.spec, source: value as GridChartSource })),
      usesRowColumns
        ? renderSelect("Category column", props.spec.categoryColumnId ?? "", [
            { value: "", label: "Row index" },
            ...props.columns!.map((column) => ({ value: column.id, label: column.label })),
          ], (value) => props.onSpecChange?.({
            ...props.spec,
            categoryColumnId: value || undefined,
          }))
        : undefined,
      usesRowColumns && props.spec.type === "scatter"
        ? renderSelect("X axis column", props.spec.xColumnId ?? "", [
            { value: "", label: "Category" },
            ...props.columns!.map((column) => ({ value: column.id, label: column.label })),
          ], (value) => props.onSpecChange?.({ ...props.spec, xColumnId: value || undefined }))
        : undefined,
      supportsStacking
        ? renderToggle("Stacked", props.spec.stacked ?? false, (stacked) => props.onSpecChange?.({ ...props.spec, stacked }))
        : undefined,
      renderToggle("Legend", props.spec.showLegend ?? true, (showLegend) => props.onSpecChange?.({ ...props.spec, showLegend })),
      createElement(
        "label",
        { className: "youp-grid__chart-option" },
        "Limit",
        createElement("input", {
          type: "number",
          min: 1,
          max: 100_000,
          value: props.spec.dataLimit ?? 1_000,
          "aria-label": "Chart data limit",
          onChange: (event: ChangeEvent<HTMLInputElement>) => props.onSpecChange?.({
            ...props.spec,
            dataLimit: Math.max(1, Number(event.currentTarget.value) || 1),
          }),
        }),
      ),
      exportImage
        ? createElement("button", {
            type: "button",
            className: "youp-grid__chart-export",
            onClick: () => downloadDataUrl(exportImage(), "youp-grid-chart.png"),
          }, "Download")
        : undefined,
    ),
    usesRowColumns
      ? createElement(
          "div",
          { className: "youp-grid__chart-series", role: "group", "aria-label": "Chart series" },
          props.columns!.map((column) => {
            const series = props.spec.series.find((item) => item.columnId === column.id);
            return createElement(
              "div",
              { className: "youp-grid__chart-series-item", key: column.id },
              createElement(
                "label",
                undefined,
                createElement("input", {
                  type: "checkbox",
                  checked: Boolean(series),
                  onChange: () => props.onSpecChange?.({
                    ...props.spec,
                    series: series
                      ? props.spec.series.filter((item) => item.columnId !== column.id)
                      : [...props.spec.series, { columnId: column.id }],
                  }),
                }),
                column.label,
              ),
              series
                ? renderSelect(`Aggregation for ${column.id}`, series.aggregation ?? "none", AGGREGATIONS, (value) => updateSeries(
                    column.id,
                    { aggregation: value === "none" ? undefined : value as AggregationFunctionName },
                  ))
                : undefined,
              series && props.spec.type !== "pie"
                ? renderSelect(`Axis for ${column.id}`, series.axis ?? "left", ["left", "right"], (value) => updateSeries(
                    column.id,
                    { axis: value as "left" | "right" },
                  ))
                : undefined,
            );
          }),
        )
      : undefined,
    props.renderer
      ? createElement("div", { ref: chartRef, className: "youp-grid__chart-canvas", style: { height: props.height ?? 320 } })
      : createElement("div", { className: "youp-grid__chart-empty", style: { height: props.height ?? 320 } }, "Configure a chart renderer"),
    props.dataset.truncated
      ? createElement("div", { className: "youp-grid__chart-warning" }, `Showing the first ${props.dataset.source.length.toLocaleString()} points`)
      : undefined,
  );
}

function renderSelect(
  label: string,
  value: string,
  options: readonly string[] | readonly { value: string; label: string }[],
  onChange: (value: string) => void,
) {
  return createElement(
    "select",
    { value, "aria-label": label, onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value) },
    options.map((option) => {
      const item = typeof option === "string" ? { value: option, label: option } : option;
      return createElement("option", { key: item.value, value: item.value }, item.label);
    }),
  );
}

function renderToggle(label: string, checked: boolean, onChange: (checked: boolean) => void) {
  return createElement(
    "label",
    { className: "youp-grid__chart-option" },
    createElement("input", {
      type: "checkbox",
      checked,
      onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.checked),
    }),
    label,
  );
}

function downloadDataUrl(dataUrl: string, fileName: string): void {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
