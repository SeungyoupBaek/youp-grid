import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function readJson(path) {
  return JSON.parse(readFileSync(join(rootDir, path), "utf8"));
}

const rootPackage = readJson("package.json");
const lockfile = readJson("package-lock.json");
const demoLockfile = readJson("examples/react-basic/package-lock.json");
const expectedVersion = rootPackage.version;

const packagePaths = [
  "packages/core",
  "packages/formula",
  "packages/xlsx",
  "packages/charts-echarts",
  "packages/react",
  "packages/vue",
  "packages/vanilla",
];
const internalPackageNames = new Set(packagePaths.map((path) => readJson(`${path}/package.json`).name));
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
  const demoLockPackage = demoLockfile.packages?.[`../../${packagePath}`];
  expectEqual(`demo package-lock ${packagePath} version`, demoLockPackage?.version, expectedVersion);

  const internalDependencies = new Set(Object.keys(manifest.dependencies ?? {}).filter((name) => internalPackageNames.has(name)));
  if (manifest.name !== "@youp-grid/core") internalDependencies.add("@youp-grid/core");
  if (["@youp-grid/react", "@youp-grid/vue"].includes(manifest.name)) internalDependencies.add("@youp-grid/vanilla");
  for (const name of internalDependencies) {
    expectEqual(`${packagePath} dependency ${name}`, manifest.dependencies?.[name], expectedVersion);
    expectEqual(`package-lock ${packagePath} dependency ${name}`, lockPackage?.dependencies?.[name], expectedVersion);
    expectEqual(`demo package-lock ${packagePath} dependency ${name}`, demoLockPackage?.dependencies?.[name], expectedVersion);
  }
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
