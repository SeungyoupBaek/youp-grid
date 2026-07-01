# Youp Grid Examples

## React Basic

`examples/react-basic` is the main runtime demo. It covers:

- column pinning, grouping, reorder, filtering, pagination, and selection
- cell editing and right-click context menu actions
- expandable master-detail rows
- client, server-sliced, cursor, and infinite-row modes

Run it locally:

```sh
npm install
npm run dev --prefix examples/react-basic
```

## GitHub Pages

The public demo is served from [seungyoupbaek.github.io/youp-grid](https://seungyoupbaek.github.io/youp-grid/).

The `Deploy GitHub Pages` workflow builds the same React demo with `/youp-grid/` as the Vite base path and deploys `examples/react-basic/dist` through GitHub Pages. In the repository settings, set Pages source to GitHub Actions.

Build the Pages artifact locally:

```sh
npm run build:pages
```

## Interaction Smoke Test

The Playwright smoke test starts the React demo and checks a small set of production-critical interactions:

- column menu move action
- row detail expansion
- cell context menu placement and row-copy menu visibility

Run it with:

```sh
npm run test:smoke
```

On macOS the config uses the locally installed Chrome channel by default so the repository does not need to download browser binaries during normal local checks. Override it with `PLAYWRIGHT_CHANNEL` when needed.

## Static Preview

`examples/static-preview/index.html` is a zero-install visual preview. It does not exercise adapter runtime behavior and should not replace the smoke test.
