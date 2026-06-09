import type { GridCellCoordinate, NormalizedGridCellRange } from "./clipboard.ts";
export type GridFillHandleCell<TValue = unknown> = GridCellCoordinate & {
    sourceRowIndex: number;
    sourceColumnIndex: number;
    value: TValue;
};
export declare function getFillHandleTargetRange(options: {
    sourceRange: NormalizedGridCellRange;
    targetCell: GridCellCoordinate;
    rowCount: number;
    columnCount: number;
}): NormalizedGridCellRange | undefined;
export declare function getFillHandleCells<TValue>(options: {
    sourceRange: NormalizedGridCellRange;
    targetRange: NormalizedGridCellRange;
    getValue: (cell: GridCellCoordinate) => TValue;
}): GridFillHandleCell<TValue>[];
