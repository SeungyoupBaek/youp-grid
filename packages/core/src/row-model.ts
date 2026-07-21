import { applyColumnState, getVisibleColumns } from "./column-state.ts";
import { applyAggregation } from "./aggregation.ts";
import { normalizeColumns } from "./columns.ts";
import { applyFilters } from "./filtering.ts";
import { applyPagination } from "./pagination.ts";
import { applyRowGrouping } from "./row-grouping.ts";
import { applySorting } from "./sorting.ts";
import { applyTreeData } from "./tree-data.ts";
import { applyFormulaEngine } from "./formula.ts";
import { buildPivotModel } from "./pivot.ts";
import type {
  BuildRowModelOptions,
  FormulaEngine,
  FormulaModel,
  FormulaState,
  PaginationState,
  RowModel,
  RowNode,
} from "./types.ts";

type FormulaApplicationResult<TRow> = {
  rows: RowNode<TRow>[];
  model?: FormulaModel;
};

type FormulaCacheEntry = {
  columns: object;
  getRowId: unknown;
  formulaState?: FormulaState;
  engine?: FormulaEngine;
  result: FormulaApplicationResult<unknown>;
};

const formulaResultCache = new WeakMap<object, FormulaCacheEntry>();

export function buildRowModel<TRow>(options: BuildRowModelOptions<TRow>): RowModel<TRow> {
  const normalizedColumns = normalizeColumns(options.columns);
  const columns = applyColumnState(normalizedColumns, options.state?.columns);
  const visibleColumns = getVisibleColumns(columns);
  const formulaResult = getFormulaResult(options, normalizedColumns);
  const allRows = formulaResult.rows;
  const pinnedTopRows = createRowNodes(options.pinnedTopRows ?? [], options.getRowId);
  const pinnedBottomRows = createRowNodes(options.pinnedBottomRows ?? [], options.getRowId);

  if (options.rowModelType === "server") {
    return buildServerRowModel({
      allRows,
      pinnedTopRows,
      pinnedBottomRows,
      columns,
      visibleColumns,
      state: options.state,
      treeData: options.treeData,
      getParentRowId: options.getParentRowId,
      serverRowCount: options.serverRowCount,
      serverFilteredRowCount: options.serverFilteredRowCount,
      serverPivotModel: options.serverPivotModel,
      formula: formulaResult.model,
    });
  }

  const filteredRows = applyFilters(allRows, columns, options.state?.filters);
  const sortedRows = applySorting(filteredRows, columns, options.state?.sort);
  const treeRows = applyTreeData(sortedRows, {
    enabled: options.treeData,
    state: options.state?.treeData,
    getParentRowId: options.getParentRowId,
  });
  const paginated = applyPagination(treeRows, options.state?.pagination);
  const aggregation = applyAggregation(filteredRows, columns, options.state?.aggregation);
  const displayRows = applyRowGrouping(paginated.rows, columns, options.state?.rowGrouping);
  const pivot = buildPivotModel(filteredRows, columns, options.state?.pivot);

  return {
    columns,
    visibleColumns,
    allRows,
    filteredRows,
    sortedRows,
    visibleRows: paginated.rows,
    displayRows,
    pinnedTopRows,
    pinnedBottomRows,
    aggregation,
    pivot,
    formula: formulaResult.model,
    totalRowCount: allRows.length,
    filteredRowCount: filteredRows.length,
    visibleRowCount: paginated.rows.length,
    pageCount: paginated.pageCount,
  };
}

function getFormulaResult<TRow>(
  options: BuildRowModelOptions<TRow>,
  columns: RowModel<TRow>["columns"],
): FormulaApplicationResult<TRow> {
  const cached = formulaResultCache.get(options.rows);
  if (
    cached
    && cached.columns === options.columns
    && cached.getRowId === options.getRowId
    && cached.formulaState === options.state?.formula
    && cached.engine === options.formulaEngine
  ) {
    return cached.result as FormulaApplicationResult<TRow>;
  }

  const result = applyFormulaEngine({
    rows: createRowNodes(options.rows, options.getRowId),
    columns,
    state: options.state?.formula,
    engine: options.formulaEngine,
  });
  formulaResultCache.set(options.rows, {
    columns: options.columns,
    getRowId: options.getRowId,
    formulaState: options.state?.formula,
    engine: options.formulaEngine,
    result: result as FormulaApplicationResult<unknown>,
  });
  return result;
}

function buildServerRowModel<TRow>(context: {
  allRows: RowNode<TRow>[];
  pinnedTopRows: RowNode<TRow>[];
  pinnedBottomRows: RowNode<TRow>[];
  columns: RowModel<TRow>["columns"];
  visibleColumns: RowModel<TRow>["visibleColumns"];
  state: BuildRowModelOptions<TRow>["state"];
  treeData?: boolean;
  getParentRowId?: BuildRowModelOptions<TRow>["getParentRowId"];
  serverRowCount?: number;
  serverFilteredRowCount?: number;
  serverPivotModel?: RowModel<TRow>["pivot"];
  formula?: RowModel<TRow>["formula"];
}): RowModel<TRow> {
  const totalRowCount = context.serverRowCount ?? context.allRows.length;
  const filteredRowCount = context.serverFilteredRowCount ?? totalRowCount;
  const visibleRows = applyTreeData(context.allRows, {
    enabled: context.treeData,
    state: context.state?.treeData,
    getParentRowId: context.getParentRowId,
  });

  return {
    columns: context.columns,
    visibleColumns: context.visibleColumns,
    allRows: context.allRows,
    filteredRows: context.allRows,
    sortedRows: context.allRows,
    visibleRows,
    displayRows: applyRowGrouping(visibleRows, context.columns, context.state?.rowGrouping),
    pinnedTopRows: context.pinnedTopRows,
    pinnedBottomRows: context.pinnedBottomRows,
    aggregation: applyAggregation(context.allRows, context.columns, context.state?.aggregation),
    pivot: context.serverPivotModel ?? buildPivotModel(context.allRows, context.columns, context.state?.pivot),
    formula: context.formula,
    totalRowCount,
    filteredRowCount,
    visibleRowCount: visibleRows.length,
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
