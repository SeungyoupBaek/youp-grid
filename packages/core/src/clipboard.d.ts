import type { ResolvedColumnDef, RowNode } from "./types.ts";
export type GridCellCoordinate = {
    rowIndex: number;
    columnIndex: number;
};
export type GridCellRange = {
    anchor: GridCellCoordinate;
    focus: GridCellCoordinate;
};
export type NormalizedGridCellRange = {
    startRowIndex: number;
    endRowIndex: number;
    startColumnIndex: number;
    endColumnIndex: number;
};
export type ClipboardPasteCell = GridCellCoordinate & {
    value: string;
};
export declare function normalizeCellRange(range: GridCellRange): NormalizedGridCellRange;
export declare function isCellInRange(rowIndex: number, columnIndex: number, range: GridCellRange): boolean;
export declare function serializeGridRange<TRow>(options: {
    rows: readonly RowNode<TRow>[];
    columns: readonly ResolvedColumnDef<TRow>[];
    range: GridCellRange;
}): string;
export declare function parseClipboardText(text: string): string[][];
export declare function getClipboardPasteCells(options: {
    values: readonly (readonly string[])[];
    startCell: GridCellCoordinate;
    rowCount: number;
    columnCount: number;
    fillRange?: NormalizedGridCellRange;
}): ClipboardPasteCell[];
