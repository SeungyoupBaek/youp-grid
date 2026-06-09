import type { ColumnDef, ResolvedColumnDef } from "./types.ts";
export declare function normalizeColumns<TRow>(columns: readonly ColumnDef<TRow>[]): ResolvedColumnDef<TRow>[];
export declare function getColumnById<TRow>(columns: readonly ResolvedColumnDef<TRow>[], columnId: string): ResolvedColumnDef<TRow> | undefined;
