import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reactTypes = readFileSync(resolve(repoRoot, "packages/react/src/types.ts"), "utf8");
const vueTypes = readFileSync(resolve(repoRoot, "packages/vue/src/types.ts"), "utf8");

const sharedProps = [
  "pinnedTopRows",
  "pinnedBottomRows",
  "rowHeight",
  "getRowHeight",
  "showColumnChooser",
  "showCsvExport",
  "showExcelExport",
  "showDensityControl",
  "showSizeColumnsToFit",
  "showFilters",
  "filterMode",
  "showRowNumberColumn",
  "showRowSelectionColumn",
  "showCellContextMenu",
  "rowDragReorder",
  "columnPresets",
  "onColumnPresetApply",
  "onCellValueSave",
  "onCellValueSaveError",
  "locale",
  "localeText",
  "formulaEngine",
  "serverPivotModel",
  "onFormulaChange",
];

const sharedApiMethods = [
  "getState",
  "focusCell",
  "startEditing",
  "scrollToRow",
  "selectRange",
  "exportCsv",
  "exportExcel",
  "resetState",
  "setPivot",
  "togglePivotRowExpanded",
  "setFormulaCell",
  "clearFormulaCell",
];

const missing = sharedProps.flatMap((prop) => {
  const misses = [];

  if (!reactTypes.includes(`${prop}?`)) {
    misses.push(`react:${prop}`);
  }

  if (!vueTypes.includes(`${prop}?`)) {
    misses.push(`vue:${prop}`);
  }

  return misses;
});

for (const method of sharedApiMethods) {
  if (!reactTypes.includes(`${method}:`)) {
    missing.push(`react-api:${method}`);
  }
  if (!vueTypes.includes(`${method}:`)) {
    missing.push(`vue-api:${method}`);
  }
}

if (missing.length > 0) {
  console.error(`Adapter parity check failed: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(
  `Adapter parity check passed for ${sharedProps.length} shared props and ${sharedApiMethods.length} API methods.`,
);
