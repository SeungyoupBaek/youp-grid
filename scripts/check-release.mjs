import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function readJson(path) {
  return JSON.parse(readFileSync(join(rootDir, path), "utf8"));
}

const rootPackage = readJson("package.json");
const lockfile = readJson("package-lock.json");
const expectedVersion = rootPackage.version;

const packagePaths = [
  "packages/core",
  "packages/formula",
  "packages/charts-echarts",
  "packages/react",
  "packages/vue",
  "packages/vanilla",
];
const adapterPaths = [
  "packages/formula",
  "packages/charts-echarts",
  "packages/react",
  "packages/vue",
  "packages/vanilla",
];
const errors = [];

function expectEqual(label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label}: expected ${expected}, got ${actual ?? "missing"}`);
  }
}

expectEqual("package-lock root version", lockfile.version, expectedVersion);
expectEqual("package-lock packages[''] version", lockfile.packages?.[""]?.version, expectedVersion);

for (const packagePath of packagePaths) {
  const manifest = readJson(`${packagePath}/package.json`);
  const lockPackage = lockfile.packages?.[packagePath];

  expectEqual(`${packagePath}/package.json version`, manifest.version, expectedVersion);
  expectEqual(`package-lock ${packagePath} version`, lockPackage?.version, expectedVersion);
}

for (const adapterPath of adapterPaths) {
  const manifest = readJson(`${adapterPath}/package.json`);
  const lockPackage = lockfile.packages?.[adapterPath];

  expectEqual(`${adapterPath} dependency @youp-grid/core`, manifest.dependencies?.["@youp-grid/core"], expectedVersion);
  expectEqual(`package-lock ${adapterPath} dependency @youp-grid/core`, lockPackage?.dependencies?.["@youp-grid/core"], expectedVersion);
}

if (errors.length > 0) {
  console.error("Release metadata check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Release metadata check passed for v${expectedVersion}.`);
}
