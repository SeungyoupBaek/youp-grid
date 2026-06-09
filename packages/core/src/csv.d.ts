import type { ResolvedColumnDef, RowNode } from "./types.ts";
export type CsvCellFormatter<TRow> = (context: {
    row: RowNode<TRow>;
    column: ResolvedColumnDef<TRow>;
    value: unknown;
}) => unknown;
export type ExportGridCsvOptions<TRow> = {
    rows: readonly RowNode<TRow>[];
    columns: readonly ResolvedColumnDef<TRow>[];
    includeHeaders?: boolean;
    delimiter?: string;
    lineBreak?: string;
    formatCell?: CsvCellFormatter<TRow>;
};
export declare function exportGridCsv<TRow>(options: ExportGridCsvOptions<TRow>): string;
