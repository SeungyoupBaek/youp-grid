import FormulaParser, {
  type FormulaParserConfig,
  type FormulaRangeReference,
  type FormulaReference,
} from "fast-formula-parser";
import {
  getFormulaCellKey,
  columnIndexToName,
  type FormulaCellResult,
  type FormulaEngine,
  type FormulaEngineInput,
  type FormulaErrorCode,
  type FormulaModel,
  type FormulaScalar,
} from "@youp-grid/core";

export { columnIndexToName, shiftFormulaReferences } from "@youp-grid/core";

export type FormulaFunction = (...args: unknown[]) => unknown;

export type CreateFormulaEngineOptions = {
  functions?: Record<string, FormulaFunction>;
};

export function createFormulaEngine(options: CreateFormulaEngineOptions = {}): FormulaEngine {
  return {
    calculate: <TRow>(input: FormulaEngineInput<TRow>) => calculateFormulaModel(input, options),
  };
}

function calculateFormulaModel<TRow>(
  input: FormulaEngineInput<TRow>,
  options: CreateFormulaEngineOptions,
): FormulaModel {
  const formulaCells = new Map(input.state.cells.map((cell) => [
    getFormulaCellKey(cell.rowId, cell.columnId),
    cell,
  ]));
  const results = new Map<string, FormulaCellResult>();
  const visiting = new Set<string>();
  const rowIndexes = new Map(input.rows.map((row, index) => [row.id, index]));
  const columnIndexes = new Map(input.columns.map((column, index) => [column.id, index]));

  const evaluate = (key: string): FormulaCellResult => {
    const cached = results.get(key);
    if (cached) return cached;
    const cell = formulaCells.get(key);
    if (!cell) throw new FormulaEvaluationError("REF", `Unknown formula cell ${key}`);
    if (visiting.has(key)) throw new FormulaEvaluationError("CYCLE", `Circular reference at ${key}`);
    const rowIndex = rowIndexes.get(cell.rowId);
    const columnIndex = columnIndexes.get(cell.columnId);
    if (rowIndex === undefined || columnIndex === undefined) {
      const result = createErrorResult(cell, "REF", "Formula cell is outside the grid");
      results.set(key, result);
      return result;
    }

    visiting.add(key);
    const dependencies = new Set<string>();
    try {
      const parser = new FormulaParser(createParserConfig({
        input,
        options,
        formulaCells,
        evaluate,
        dependencies,
      }));
      const formula = prepareFormula(cell.formula, input.columns.map((column) => column.id), rowIndex, input.state.namedExpressions);
      const value = parser.parse(formula, { row: rowIndex + 1, col: columnIndex + 1, sheet: "Grid" }, true);
      const result: FormulaCellResult = {
        ...cell,
        value: normalizeFormulaValue(value),
        dependencies: [...dependencies],
      };
      results.set(key, result);
      return result;
    } catch (error) {
      const formulaError = normalizeFormulaError(error);
      const result = createErrorResult(cell, formulaError.code, formulaError.message, [...dependencies]);
      results.set(key, result);
      return result;
    } finally {
      visiting.delete(key);
    }
  };

  for (const key of formulaCells.keys()) evaluate(key);
  const cells = Object.fromEntries(results);
  return {
    cells,
    errors: Object.values(cells).filter((cell) => Boolean(cell.error)),
    recalculatedCellCount: results.size,
  };
}

function createParserConfig<TRow>(context: {
  input: FormulaEngineInput<TRow>;
  options: CreateFormulaEngineOptions;
  formulaCells: ReadonlyMap<string, FormulaEngineInput<TRow>["state"]["cells"][number]>;
  evaluate: (key: string) => FormulaCellResult;
  dependencies: Set<string>;
}): FormulaParserConfig {
  const readCell = (reference: FormulaReference): unknown => {
    const row = context.input.rows[reference.row - 1];
    const column = context.input.columns[reference.col - 1];
    if (!row || !column) throw new FormulaEvaluationError("REF", "Cell reference is outside the grid");
    const key = getFormulaCellKey(row.id, column.id);
    const formulaCell = context.formulaCells.get(key);
    if (formulaCell) {
      context.dependencies.add(key);
      const result = context.evaluate(key);
      if (result.error) throw new FormulaEvaluationError(result.error.code, result.error.message);
      return result.value;
    }
    return column.accessor(row.original) ?? null;
  };

  return {
    functions: Object.fromEntries(Object.entries(context.options.functions ?? {}).map(([name, fn]) => [
      name.toUpperCase(),
      (...args: unknown[]) => fn(...args.map(unwrapFunctionArgument)),
    ])),
    onCell: readCell,
    onRange: (range: FormulaRangeReference) => {
      const values: unknown[][] = [];
      for (let row = range.from.row; row <= range.to.row; row += 1) {
        const rowValues: unknown[] = [];
        for (let col = range.from.col; col <= range.to.col; col += 1) {
          rowValues.push(readCell({ row, col, sheet: range.sheet }));
        }
        values.push(rowValues);
      }
      return values;
    },
  };
}

function prepareFormula(
  formula: string,
  columnIds: readonly string[],
  rowIndex: number,
  namedExpressions?: Record<string, FormulaScalar>,
): string {
  let prepared = formula.trim().replace(/^=/, "");
  prepared = prepared.replace(/\[([^\]]+)\]/g, (match, columnId: string) => {
    const columnIndex = columnIds.indexOf(columnId.trim());
    return columnIndex < 0 ? match : `${columnIndexToName(columnIndex)}${rowIndex + 1}`;
  });
  for (const [name, value] of Object.entries(namedExpressions ?? {}).sort((left, right) => right[0].length - left[0].length)) {
    prepared = prepared.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), formulaLiteral(value));
  }
  return prepared;
}

function formulaLiteral(value: FormulaScalar): string {
  if (value === null || value === undefined) return "0";
  if (typeof value === "string") return `"${value.replace(/"/g, '""')}"`;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function normalizeFormulaValue(value: unknown): FormulaCellResult["value"] {
  if (Array.isArray(value)) return value as FormulaScalar[][];
  if (value === null || value === undefined || typeof value === "string" ||
      typeof value === "number" || typeof value === "boolean") return value;
  if (isFormulaParserError(value)) throw value;
  return String(value);
}

function createErrorResult(
  cell: FormulaEngineInput<unknown>["state"]["cells"][number],
  code: FormulaErrorCode,
  message: string,
  dependencies: string[] = [],
): FormulaCellResult {
  return { ...cell, value: undefined, error: { code, message }, dependencies };
}

function normalizeFormulaError(error: unknown): { code: FormulaErrorCode; message: string } {
  if (error instanceof FormulaEvaluationError) return error;
  const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Circular reference")) return { code: "CYCLE", message };
  if (name.includes("DIV/0")) return { code: "DIV_ZERO", message };
  if (name.includes("NAME")) return { code: "NAME", message };
  if (name.includes("REF")) return { code: "REF", message };
  if (name.includes("VALUE")) return { code: "VALUE", message };
  return { code: "PARSE", message };
}

function unwrapFunctionArgument(value: unknown): unknown {
  if (typeof value === "object" && value !== null && "value" in value) {
    return value.value;
  }
  return value;
}

function isFormulaParserError(value: unknown): boolean {
  return typeof value === "object" && value !== null && "name" in value && String(value.name).startsWith("#");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class FormulaEvaluationError extends Error {
  readonly code: FormulaErrorCode;

  constructor(code: FormulaErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
