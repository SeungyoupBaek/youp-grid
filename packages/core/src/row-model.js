import { applyColumnState, getVisibleColumns } from "./column-state.js";
import { applyAggregation } from "./aggregation.js";
import { normalizeColumns } from "./columns.js";
import { applyFilters } from "./filtering.js";
import { applyPagination } from "./pagination.js";
import { applyRowGrouping } from "./row-grouping.js";
import { applySorting } from "./sorting.js";
export function buildRowModel(options) {
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
function buildServerRowModel(context) {
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
function getServerPageCount(rowCount, pagination) {
    if (!pagination) {
        return undefined;
    }
    return Math.ceil(Math.max(0, rowCount) / Math.max(1, pagination.pageSize));
}
function createRowNodes(rows, getRowId) {
    return rows.map((row, index) => ({
        id: getRowId ? getRowId(row, index) : index,
        index,
        original: row,
    }));
}
