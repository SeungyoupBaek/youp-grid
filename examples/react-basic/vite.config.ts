import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "react/jsx-runtime",
        replacement: fileURLToPath(new URL("./node_modules/react/jsx-runtime.js", import.meta.url)),
      },
      {
        find: "react-dom/client",
        replacement: fileURLToPath(new URL("./node_modules/react-dom/client.js", import.meta.url)),
      },
      {
        find: /^react$/,
        replacement: fileURLToPath(new URL("./node_modules/react/index.js", import.meta.url)),
      },
      {
        find: "@youp-grid/core",
        replacement: fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      },
      {
        find: "@youp-grid/react/styles.css",
        replacement: fileURLToPath(new URL("../../packages/react/src/styles.css", import.meta.url)),
      },
      {
        find: "@youp-grid/react",
        replacement: fileURLToPath(new URL("../../packages/react/src/index.ts", import.meta.url)),
      },
    ],
  },
});
