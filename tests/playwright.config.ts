import { defineConfig } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const channel = process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === "darwin" ? "chrome" : undefined);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.YOUP_GRID_SMOKE_PORT ?? 5179);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  use: {
    baseURL,
    browserName: "chromium",
    ...(channel ? { channel } : {}),
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run dev --prefix examples/react-basic -- --host 127.0.0.1 --port ${port}`,
    cwd: repoRoot,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL,
  },
});
