import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  define: { __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  resolve: {
    alias: [
      { find: "@youp-grid/vue/styles.css", replacement: fileURLToPath(new URL("../../packages/vue/src/styles.css", import.meta.url)) },
      { find: "@youp-grid/vanilla/styles.css", replacement: fileURLToPath(new URL("../../packages/vanilla/src/workbench.css", import.meta.url)) },
      ...["vue", "vanilla", "xlsx"].map((name) => ({ find: `@youp-grid/${name}`, replacement: fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url)) })),
      { find: /^vue$/, replacement: fileURLToPath(new URL("./node_modules/vue/dist/vue.runtime.esm-bundler.js", import.meta.url)) },
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
