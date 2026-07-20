import type { CellValidationResult } from "./types.ts";

export type NormalizedCellValidationResult = {
  valid: boolean;
  message?: string;
};

export function normalizeCellValidationResult(
  result: CellValidationResult,
): NormalizedCellValidationResult {
  if (typeof result === "boolean") {
    return { valid: result };
  }

  if (typeof result === "string") {
    return { valid: false, message: result };
  }

  return result.message ? { valid: result.valid, message: result.message } : { valid: result.valid };
}
