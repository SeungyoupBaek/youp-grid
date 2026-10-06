import { defaultFilterPredicate } from "./filtering.ts";
import { getRowNodeValue } from "./formula.ts";
import type { FilterRule, GridState, ResolvedColumnDef, RowNode } from "./types.ts";

export type GridFilterExpression = { operator: "and" | "or"; conditions: GridFilterExpression[] } | FilterRule;
const operators = new Set(["contains", "equals", "startsWith", "endsWith", "gt", "gte", "lt", "lte", "between", "isEmpty", "isNotEmpty", "in"]);

export function validateFilterExpression(expression: GridFilterExpression, columns: readonly { id: string; filterable?: boolean }[]): void {
  let count = 0;
  const visit = (node: GridFilterExpression, depth: number) => {
    if (!node || typeof node !== "object" || depth > 10 || ++count > 100) throw new Error("Invalid or excessively large filter expression");
    if ("conditions" in node) {
      if (!["and", "or"].includes(node.operator) || !Array.isArray(node.conditions)) throw new Error("Invalid filter group");
      node.conditions.forEach((child) => visit(child, depth + 1));
    } else {
      const column = columns.find((candidate) => candidate.id === node.columnId);
      if (!column || column.filterable === false || !operators.has(node.operator)) throw new Error(`Invalid filter column or operator: ${node.columnId}`);
      const value = node.value;
      const comparable = (item: unknown) => typeof item === "string" || (typeof item === "number" && Number.isFinite(item));
      const scalar = (item: unknown) => typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)) || item === null;
      if (["isEmpty", "isNotEmpty"].includes(node.operator)) return;
      if (["contains", "startsWith", "endsWith"].includes(node.operator) && typeof value !== "string") throw new Error("Text filters require text");
      if (node.operator === "in" && (!Array.isArray(value) || !value.length || !value.every(scalar))) throw new Error("In requires a nonempty scalar array");
      if (node.operator === "between" && (!Array.isArray(value) || value.length !== 2 || !value.every(comparable) || typeof value[0] !== typeof value[1])) throw new Error("Between requires two numbers or two strings");
      if (["gt", "gte", "lt", "lte"].includes(node.operator) && !comparable(value)) throw new Error("Comparison filters require a number or text");
      if (!["in", "between"].includes(node.operator) && !scalar(value)) throw new Error("Invalid filter value");
    }
  };
  visit(expression, 0);
}

export function setGridQuery(state: GridState, query: { quickFilter?: string; filterExpression?: GridFilterExpression }): GridState {
  return {
    ...state, ...query,
    ...("filterExpression" in query ? { filterExpression: query.filterExpression ? structuredClone(query.filterExpression) : undefined } : {}),
    pagination: state.pagination ? { ...state.pagination, pageIndex: 0 } : undefined,
    cursorPagination: state.cursorPagination ? { ...state.cursorPagination, cursor: undefined, nextCursor: undefined, previousCursor: undefined, hasNextPage: undefined, hasPreviousPage: undefined } : undefined,
    remoteCache: state.remoteCache ? { ...state.remoteCache, stale: true } : undefined,
  };
}

export function applyGridQuery<TRow>(rows: RowNode<TRow>[], columns: ResolvedColumnDef<TRow>[], state: GridState = {}): RowNode<TRow>[] {
  const expression = state.filterExpression;
  if (expression) validateFilterExpression(expression, columns);
  const tokens = state.quickFilter?.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean) ?? [];
  if (!expression && !tokens.length) return rows;
  const searchable = columns.filter((column) => column.filterable !== false && !column.hidden);
  const matches = (row: RowNode<TRow>, node: GridFilterExpression): boolean => {
    if ("conditions" in node) return node.conditions.length === 0 || (node.operator === "and" ? node.conditions.every((child) => matches(row, child)) : node.conditions.some((child) => matches(row, child)));
    const column = columns.find((candidate) => candidate.id === node.columnId)!;
    const value = getRowNodeValue(row, column);
    return column.filterPredicate ? column.filterPredicate(value, node, row.original) : defaultFilterPredicate(value, node);
  };
  return rows.filter((row) => (!expression || matches(row, expression)) && tokens.every((token) => searchable.some((column) => String(getRowNodeValue(row, column) ?? "").toLocaleLowerCase().includes(token))));
}
