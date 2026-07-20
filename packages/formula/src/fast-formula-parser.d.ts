declare module "fast-formula-parser" {
  export type FormulaReference = {
    sheet?: string;
    row: number;
    col: number;
  };

  export type FormulaRangeReference = {
    sheet?: string;
    from: FormulaReference;
    to: FormulaReference;
  };

  export type FormulaParserConfig = {
    functions?: Record<string, (...args: unknown[]) => unknown>;
    onVariable?: (name: string, sheet?: string) => FormulaReference | FormulaRangeReference | null;
    onCell?: (reference: FormulaReference) => unknown;
    onRange?: (reference: FormulaRangeReference) => unknown[][];
  };

  export default class FormulaParser {
    constructor(config?: FormulaParserConfig);
    parse(formula: string, position: FormulaReference, allowArray?: boolean): unknown;
  }
}
