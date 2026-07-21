import assert from "node:assert/strict";
import test from "node:test";

import { buildRowModel, getFormulaCellKey, type ColumnDef, type FormulaEngine } from "@youp-grid/core";
import { createFormulaEngine, shiftFormulaReferences } from "../src/index.ts";

type Row = { id: string; quantity: number; price: number; total?: number; doubled?: number };
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

test("formula engine preserves nested formula dependencies while reusing parsers", () => {
  const model = buildRowModel({
    rows,
    columns: [
      ...columns,
      { field: "doubled", headerName: "Doubled", formula: "=[total]*2" },
    ],
    getRowId: (row) => row.id,
    formulaEngine: createFormulaEngine(),
  });

  assert.equal(model.allRows[0]?.formulaValues?.total, 20);
  assert.equal(model.allRows[0]?.formulaValues?.doubled, 40);
  assert.equal(model.allRows[1]?.formulaValues?.total, 60);
  assert.equal(model.allRows[1]?.formulaValues?.doubled, 120);
  assert.deepEqual(model.formula?.errors, []);
});

test("formula engine recovers after a reused parser reports a syntax error", () => {
  const model = buildRowModel({
    rows,
    columns,
    getRowId: (row) => row.id,
    formulaEngine: createFormulaEngine(),
    state: {
      formula: {
        cells: [{ rowId: "1", columnId: "total", formula: "=1+" }],
      },
    },
  });

  assert.equal(model.allRows[0]?.formulaValues?.total, "#PARSE!");
  assert.equal(model.allRows[1]?.formulaValues?.total, 60);
  assert.equal(model.formula?.errors.length, 1);
});

test("row model reuses formula results across unrelated state changes", () => {
  const engine = createFormulaEngine();
  const getRowId = (row: Row) => row.id;
  let calculateCount = 0;
  const countingEngine: FormulaEngine = {
    calculate: (input) => {
      calculateCount += 1;
      return engine.calculate(input);
    },
  };

  buildRowModel({
    rows,
    columns,
    getRowId,
    formulaEngine: countingEngine,
    state: { selectedRowIds: [] },
  });
  buildRowModel({
    rows,
    columns,
    getRowId,
    formulaEngine: countingEngine,
    state: { selectedRowIds: ["1"] },
  });

  assert.equal(calculateCount, 1);

  buildRowModel({
    rows,
    columns,
    getRowId,
    formulaEngine: countingEngine,
    state: {
      formula: {
        cells: [{ rowId: "1", columnId: "total", formula: "=[quantity]+[price]" }],
      },
    },
  });

  assert.equal(calculateCount, 2);
});
