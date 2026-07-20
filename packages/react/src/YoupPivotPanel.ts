import type {
  AggregationFunctionName,
  PivotBucket,
  PivotDimension,
  PivotState,
  ResolvedColumnDef,
} from "@youp-grid/core";
import { createElement, useState, type ChangeEvent } from "react";

export type YoupPivotPanelProps<TRow> = {
  columns: readonly ResolvedColumnDef<TRow>[];
  value?: PivotState;
  onChange: (value: PivotState | undefined) => void;
};

const AGGREGATIONS: AggregationFunctionName[] = ["sum", "avg", "count", "min", "max"];
const BUCKETS: PivotBucket[] = ["value", "year", "quarter", "month", "day"];

export function YoupPivotPanel<TRow>(props: YoupPivotPanelProps<TRow>) {
  const pivot = props.value ?? { enabled: false, rows: [], columns: [], values: [] };
  const [rowColumnId, setRowColumnId] = useState(props.columns[0]?.id ?? "");
  const [columnColumnId, setColumnColumnId] = useState(props.columns[0]?.id ?? "");
  const [valueColumnId, setValueColumnId] = useState(props.columns[0]?.id ?? "");
  const update = (change: Partial<PivotState>) => props.onChange({ ...pivot, ...change });

  return createElement(
    "section",
    { className: "youp-grid__pivot-panel", "aria-label": "Pivot builder" },
    createElement(
      "label",
      { className: "youp-grid__pivot-enabled" },
      createElement("input", {
        type: "checkbox",
        checked: pivot.enabled ?? false,
        onChange: (event) => update({ enabled: event.currentTarget.checked }),
      }),
      "Pivot",
    ),
    renderDimensionSection("Rows", pivot.rows, rowColumnId, setRowColumnId, props.columns, (rows) => update({ rows })),
    renderDimensionSection("Columns", pivot.columns, columnColumnId, setColumnColumnId, props.columns, (columns) => update({ columns })),
    createElement(
      "div",
      { className: "youp-grid__pivot-section" },
      createElement("strong", undefined, "Values"),
      pivot.values.map((rule, index) => createElement(
        "div",
        { className: "youp-grid__pivot-rule", key: `${rule.columnId}:${index}` },
        createElement("span", undefined, getColumnLabel(props.columns, rule.columnId)),
        createElement(
          "select",
          {
            value: rule.function,
            "aria-label": `Aggregation for ${rule.columnId}`,
            onChange: (event: ChangeEvent<HTMLSelectElement>) => update({
              values: pivot.values.map((item, itemIndex) => itemIndex === index
                ? { ...item, function: event.currentTarget.value as AggregationFunctionName }
                : item),
            }),
          },
          AGGREGATIONS.map((aggregation) => createElement("option", { key: aggregation, value: aggregation }, aggregation)),
        ),
        renderMoveButtons(index, pivot.values.length, (target) => update({ values: moveItem(pivot.values, index, target) })),
        createElement("button", {
          type: "button",
          className: "youp-grid__pivot-icon-button",
          title: "Remove value",
          "aria-label": `Remove ${rule.columnId}`,
          onClick: () => update({ values: pivot.values.filter((_, itemIndex) => itemIndex !== index) }),
        }, "x"),
      )),
      createElement(
        "div",
        { className: "youp-grid__pivot-add" },
        renderColumnSelect(valueColumnId, setValueColumnId, props.columns, "Value column"),
        createElement("button", {
          type: "button",
          disabled: !valueColumnId,
          onClick: () => update({ values: [...pivot.values, { columnId: valueColumnId, function: "sum" }] }),
        }, "Add"),
      ),
    ),
    createElement(
      "div",
      { className: "youp-grid__pivot-options" },
      renderTotalsSelect("Row totals", pivot.rowTotals ?? "after", (rowTotals) => update({ rowTotals })),
      renderTotalsSelect("Grand total", pivot.columnTotals ?? "after", (columnTotals) => update({ columnTotals })),
      createElement(
        "label",
        undefined,
        createElement("input", {
          type: "checkbox",
          checked: pivot.includeEmpty ?? false,
          onChange: (event) => update({ includeEmpty: event.currentTarget.checked }),
        }),
        "Include empty",
      ),
    ),
  );
}

function renderDimensionSection<TRow>(
  label: string,
  dimensions: readonly PivotDimension[],
  selected: string,
  setSelected: (value: string) => void,
  columns: readonly ResolvedColumnDef<TRow>[],
  onChange: (dimensions: PivotDimension[]) => void,
) {
  return createElement(
    "div",
    { className: "youp-grid__pivot-section" },
    createElement("strong", undefined, label),
    dimensions.map((dimension, index) => createElement(
      "div",
      { className: "youp-grid__pivot-rule", key: `${dimension.columnId}:${index}` },
      createElement("span", undefined, getColumnLabel(columns, dimension.columnId)),
      createElement(
        "select",
        {
          value: dimension.bucket ?? "value",
          "aria-label": `Bucket for ${dimension.columnId}`,
          onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange(dimensions.map((item, itemIndex) => itemIndex === index
            ? { ...item, bucket: event.currentTarget.value as PivotBucket }
            : item)),
        },
        BUCKETS.map((bucket) => createElement("option", { key: bucket, value: bucket }, bucket)),
      ),
      renderMoveButtons(index, dimensions.length, (target) => onChange(moveItem(dimensions, index, target))),
      createElement("button", {
        type: "button",
        className: "youp-grid__pivot-icon-button",
        title: "Remove field",
        "aria-label": `Remove ${dimension.columnId}`,
        onClick: () => onChange(dimensions.filter((_, itemIndex) => itemIndex !== index)),
      }, "x"),
    )),
    createElement(
      "div",
      { className: "youp-grid__pivot-add" },
      renderColumnSelect(selected, setSelected, columns, `${label} column`),
      createElement("button", {
        type: "button",
        disabled: !selected,
        onClick: () => onChange([...dimensions, { columnId: selected }]),
      }, "Add"),
    ),
  );
}

function renderColumnSelect<TRow>(
  value: string,
  onChange: (value: string) => void,
  columns: readonly ResolvedColumnDef<TRow>[],
  label: string,
) {
  return createElement(
    "select",
    { value, "aria-label": label, onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value) },
    columns.map((column) => createElement("option", { key: column.id, value: column.id }, column.headerName)),
  );
}

function renderMoveButtons(index: number, length: number, move: (target: number) => void) {
  return createElement(
    "span",
    { className: "youp-grid__pivot-move" },
    createElement("button", { type: "button", disabled: index === 0, title: "Move up", onClick: () => move(index - 1) }, "Up"),
    createElement("button", { type: "button", disabled: index === length - 1, title: "Move down", onClick: () => move(index + 1) }, "Down"),
  );
}

function renderTotalsSelect(
  label: string,
  value: false | "before" | "after",
  onChange: (value: false | "before" | "after") => void,
) {
  return createElement(
    "label",
    undefined,
    label,
    createElement(
      "select",
      { value: value === false ? "off" : value, onChange: (event: ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value === "off" ? false : event.currentTarget.value as "before" | "after") },
      createElement("option", { value: "off" }, "Off"),
      createElement("option", { value: "before" }, "Before"),
      createElement("option", { value: "after" }, "After"),
    ),
  );
}

function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

function getColumnLabel<TRow>(columns: readonly ResolvedColumnDef<TRow>[], columnId: string): string {
  return columns.find((column) => column.id === columnId)?.headerName ?? columnId;
}
