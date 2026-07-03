import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reactTypes = readFileSync(resolve(repoRoot, "packages/react/src/types.ts"), "utf8");
const vueTypes = readFileSync(resolve(repoRoot, "packages/vue/src/types.ts"), "utf8");

const sharedProps = [
  "pinnedTopRows",
  "pinnedBottomRows",
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

if (missing.length > 0) {
  console.error(`Adapter parity check failed: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Adapter parity check passed for ${sharedProps.length} shared props.`);
