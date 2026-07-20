import assert from "node:assert/strict";
import test from "node:test";

import { buildRowModel, getFormulaCellKey, type ColumnDef } from "@youp-grid/core";
import { createFormulaEngine, shiftFormulaReferences } from "../src/index.ts";

type Row = { id: string; quantity: number; price: number; total?: number };
const rows: Row[] = [
  { id: "1", quantity: 2, price: 10 },
  { id: "2", quantity: 3, price: 20 },
];
const columns: ColumnDef<Row>[] = [
  { field: "quantity", headerName: "Quantity" },
  { field: "price", headerName: "Price" },
  { field: "total", headerName: "Total", formula: "=[quantity]*[price]" },
];

test("formula engine evaluates structured references, A1 ranges, names, and custom functions", () => {
  const model = buildRowModel({
    rows,
    columns,
    getRowId: (row) => row.id,
    formulaEngine: createFormulaEngine({ functions: { DOUBLE: (value) => Number(value) * 2 } }),
    state: {
      formula: {
        cells: [{ rowId: "2", columnId: "total", formula: "=DOUBLE(SUM(A1:A2))*tax" }],
        namedExpressions: { tax: 2 },
      },
    },
  });
  assert.equal(model.allRows[0]?.formulaValues?.total, 20);
  assert.equal(model.allRows[1]?.formulaValues?.total, 20);
  assert.deepEqual(model.formula?.errors, []);
});

test("formula engine reports cycles and shifts relative references", () => {
  const model = buildRowModel({
    rows,
    columns,
    getRowId: (row) => row.id,
    formulaEngine: createFormulaEngine(),
    state: { formula: { cells: [
      { rowId: "1", columnId: "quantity", formula: "=A2" },
      { rowId: "2", columnId: "quantity", formula: "=A1" },
    ] } },
  });
  assert.equal(model.formula?.cells[getFormulaCellKey("1", "quantity")]?.error?.code, "CYCLE");
  assert.equal(shiftFormulaReferences("=A1+$B2+C$3+$D$4", 2, 1), "=B3+$B4+D$3+$D$4");
});
