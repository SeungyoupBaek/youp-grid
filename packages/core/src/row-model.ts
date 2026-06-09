import { applyColumnState, getVisibleColumns } from "./column-state.ts";
import { applyAggregation } from "./aggregation.ts";
import { normalizeColumns } from "./columns.ts";
import { applyFilters } from "./filtering.ts";
import { applyPagination } from "./pagination.ts";
import { applyRowGrouping } from "./row-grouping.ts";
import { applySorting } from "./sorting.ts";
import type { BuildRowModelOptions, PaginationState, RowModel, RowNode } from "./types.ts";

export function buildRowModel<TRow>(options: BuildRowModelOptions<TRow>): RowModel<TRow> {
  const columns = applyColumnState(normalizeColumns(options.columns), options.state?.columns);
  const visibleColumns = getVisibleColumns(columns);
  const allRows = createRowNodes(options.rows, options.getRowId);

  if (options.rowModelType === "server") {
    return buildServerRowModel({
      allRows,
      columns,
      visibleColumns,
      state: options.state,
      serverRowCount: options.serverRowCount,
      serverFilteredRowCount: options.serverFilteredRowCount,
    });
  }

  const filteredRows = applyFilters(allRows, columns, options.state?.filters);
  const sortedRows = applySorting(filteredRows, columns, options.state?.sort);
  const paginated = applyPagination(sortedRows, options.state?.pagination);
  const aggregation = applyAggregation(filteredRows, columns, options.state?.aggregation);
  const displayRows = applyRowGrouping(paginated.rows, columns, options.state?.rowGrouping);

  return {
    columns,
    visibleColumns,
    allRows,
    filteredRows,
    sortedRows,
    visibleRows: paginated.rows,
    displayRows,
    aggregation,
    totalRowCount: allRows.length,
    filteredRowCount: filteredRows.length,
    visibleRowCount: paginated.rows.length,
    pageCount: paginated.pageCount,
  };
}

function buildServerRowModel<TRow>(context: {
  allRows: RowNode<TRow>[];
  columns: RowModel<TRow>["columns"];
  visibleColumns: RowModel<TRow>["visibleColumns"];
  state: BuildRowModelOptions<TRow>["state"];
  serverRowCount?: number;
  serverFilteredRowCount?: number;
}): RowModel<TRow> {
  const totalRowCount = context.serverRowCount ?? context.allRows.length;
  const filteredRowCount = context.serverFilteredRowCount ?? totalRowCount;

  return {
    columns: context.columns,
    visibleColumns: context.visibleColumns,
    allRows: context.allRows,
    filteredRows: context.allRows,
    sortedRows: context.allRows,
    visibleRows: context.allRows,
    displayRows: applyRowGrouping(context.allRows, context.columns, context.state?.rowGrouping),
    aggregation: applyAggregation(context.allRows, context.columns, context.state?.aggregation),
    totalRowCount,
    filteredRowCount,
    visibleRowCount: context.allRows.length,
    pageCount: getServerPageCount(filteredRowCount, context.state?.pagination),
  };
}

function getServerPageCount(
  rowCount: number,
  pagination?: PaginationState,
): number | undefined {
  if (!pagination) {
    return undefined;
  }

  return Math.ceil(Math.max(0, rowCount) / Math.max(1, pagination.pageSize));
}

function createRowNodes<TRow>(
  rows: readonly TRow[],
  getRowId?: BuildRowModelOptions<TRow>["getRowId"],
): RowNode<TRow>[] {
  return rows.map((row, index) => ({
    id: getRowId ? getRowId(row, index) : index,
    index,
    original: row,
  }));
}
