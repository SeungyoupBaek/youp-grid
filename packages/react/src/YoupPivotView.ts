import { getPivotDisplayRows, type PivotModel, type PivotResultColumn, type PivotResultRow } from "@youp-grid/core";
import { createElement } from "react";

export type YoupPivotViewProps = {
  model: PivotModel;
  height?: number | string;
  onToggleRow?: (rowId: string) => void;
  onDrilldown?: (row: PivotResultRow, column?: PivotResultColumn) => void;
};

export function YoupPivotView(props: YoupPivotViewProps) {
  const rows = getPivotDisplayRows(props.model);
  return createElement(
    "div",
    { className: "youp-grid__pivot-view", style: { height: props.height ?? 420 }, role: "region", "aria-label": "Pivot results" },
    props.model.warnings.map((warning) => createElement("div", { className: "youp-grid__pivot-warning", key: warning }, warning)),
    createElement(
      "table",
      undefined,
      createElement(
        "thead",
        undefined,
        createElement(
          "tr",
          undefined,
          createElement("th", { scope: "col" }, "Group"),
          props.model.columns.map((column) => createElement("th", { key: column.id, scope: "col", title: column.headerName }, column.headerName)),
        ),
      ),
      createElement(
        "tbody",
        undefined,
        rows.map((row) => createElement(
          "tr",
          { key: row.id, className: row.isGrandTotal ? "youp-grid__pivot-grand-total" : row.isSubtotal ? "youp-grid__pivot-subtotal" : undefined },
          createElement(
            "th",
            { scope: "row", style: { paddingLeft: 12 + row.depth * 18 } },
            row.isSubtotal
              ? createElement("button", {
                  type: "button",
                  className: "youp-grid__pivot-toggle",
                  "aria-expanded": row.expanded,
                  onClick: () => props.onToggleRow?.(row.id),
                }, row.expanded ? "-" : "+")
              : undefined,
            row.label,
            createElement("span", { className: "youp-grid__pivot-row-count" }, row.rowCount.toLocaleString()),
          ),
          props.model.columns.map((column) => createElement(
            "td",
            {
              key: column.id,
              title: "Double-click to open source rows",
              onDoubleClick: () => props.onDrilldown?.(row, column),
            },
            formatPivotValue(row.values[column.id]),
          )),
        )),
      ),
    ),
  );
}

function formatPivotValue(value: number | undefined): string {
  return value === undefined ? "" : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
