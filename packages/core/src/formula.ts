import type {
  FormulaCell,
  FormulaCellResult,
  FormulaEngine,
  FormulaModel,
  FormulaState,
  GridRowId,
  ResolvedColumnDef,
  RowNode,
} from "./types.ts";

export function getFormulaCellKey(rowId: GridRowId, columnId: string): string {
  return JSON.stringify([rowId, columnId]);
}

export function shiftFormulaReferences(formula: string, rowOffset: number, columnOffset: number): string {
  return formula.replace(/(\$?)([A-Z]{1,3})(\$?)(\d+)/gi, (
    match,
    fixedColumn: string,
    columnLetters: string,
    fixedRow: string,
    rowDigits: string,
  ) => {
    const column = columnNameToIndex(columnLetters);
    const row = Number(rowDigits) - 1;
    const nextColumn = fixedColumn ? column : column + columnOffset;
    const nextRow = fixedRow ? row : row + rowOffset;
    if (nextColumn < 0 || nextRow < 0) return "#REF!";
    return `${fixedColumn}${columnIndexToName(nextColumn)}${fixedRow}${nextRow + 1}`;
  });
}

export function columnIndexToName(index: number): string {
  let result = "";
  let current = Math.max(0, Math.trunc(index)) + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

export function getFormulaCellResult(
  model: FormulaModel | undefined,
  rowId: GridRowId,
  columnId: string,
): FormulaCellResult | undefined {
  return model?.cells[getFormulaCellKey(rowId, columnId)];
}

export function getFormulaCell(
  state: FormulaState | undefined,
  rowId: GridRowId,
  columnId: string,
): FormulaCell | undefined {
  return state?.cells.find((cell) => cell.rowId === rowId && cell.columnId === columnId);
}

export function getRowNodeValue<TRow>(
  row: RowNode<TRow>,
  column: ResolvedColumnDef<TRow>,
): unknown {
  if (row.formulaValues && Object.prototype.hasOwnProperty.call(row.formulaValues, column.id)) {
    return row.formulaValues[column.id];
  }

  return column.accessor(row.original);
}

export function applyFormulaEngine<TRow>(options: {
  rows: readonly RowNode<TRow>[];
  columns: readonly ResolvedColumnDef<TRow>[];
  state?: FormulaState;
  engine?: FormulaEngine;
}): { rows: RowNode<TRow>[]; model?: FormulaModel } {
  const formulaState = createFormulaStateWithColumns(options.rows, options.columns, options.state);

  if (formulaState.cells.length === 0) {
    return { rows: [...options.rows] };
  }

  const model = options.engine
    ? calculateFormulaModel(options.engine, options.rows, options.columns, formulaState)
    : createMissingEngineModel(formulaState);

  const valuesByRow = new Map<GridRowId, Record<string, FormulaCellResult["value"]>>();

  for (const result of Object.values(model.cells)) {
    const values = valuesByRow.get(result.rowId) ?? {};
    values[result.columnId] = result.error ? `#${result.error.code}!` : result.value;
    valuesByRow.set(result.rowId, values);
  }

  return {
    rows: options.rows.map((row) => ({
      ...row,
      formulaValues: valuesByRow.get(row.id),
    })),
    model,
  };
}

function createFormulaStateWithColumns<TRow>(
  rows: readonly RowNode<TRow>[],
  columns: readonly ResolvedColumnDef<TRow>[],
  state?: FormulaState,
): FormulaState {
  const cells = new Map<string, FormulaCell>();

  for (const cell of state?.cells ?? []) {
    cells.set(getFormulaCellKey(cell.rowId, cell.columnId), {
      ...cell,
      formula: normalizeFormula(cell.formula),
    });
  }

  for (const column of columns) {
    if (!column.formula) {
      continue;
    }

    for (const row of rows) {
      const key = getFormulaCellKey(row.id, column.id);
      if (!cells.has(key)) {
        cells.set(key, {
          rowId: row.id,
          columnId: column.id,
          formula: normalizeFormula(column.formula),
        });
      }
    }
  }

  return {
    cells: [...cells.values()],
    namedExpressions: state?.namedExpressions ? { ...state.namedExpressions } : undefined,
    locale: state?.locale,
  };
}

function calculateFormulaModel<TRow>(
  engine: FormulaEngine,
  rows: readonly RowNode<TRow>[],
  columns: readonly ResolvedColumnDef<TRow>[],
  state: FormulaState,
): FormulaModel {
  try {
    return engine.calculate({ rows, columns, state });
  } catch (error) {
    return createErrorModel(state, "ENGINE", getErrorMessage(error, "Formula engine failed"));
  }
}

function createMissingEngineModel(state: FormulaState): FormulaModel {
  return createErrorModel(state, "ENGINE", "No formula engine is configured");
}

function createErrorModel(
  state: FormulaState,
  code: "ENGINE",
  message: string,
): FormulaModel {
  const cells = Object.fromEntries(state.cells.map((cell) => {
    const result: FormulaCellResult = {
      ...cell,
      value: undefined,
      error: { code, message },
      dependencies: [],
    };
    return [getFormulaCellKey(cell.rowId, cell.columnId), result];
  }));
  const errors = Object.values(cells);

  return {
    cells,
    errors,
    recalculatedCellCount: errors.length,
  };
}

function normalizeFormula(formula: string): string {
  const trimmed = formula.trim();
  return trimmed.startsWith("=") ? trimmed : `=${trimmed}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function columnNameToIndex(name: string): number {
  return name.toUpperCase().split("").reduce((result, character) =>
    result * 26 + character.charCodeAt(0) - 64, 0) - 1;
}
