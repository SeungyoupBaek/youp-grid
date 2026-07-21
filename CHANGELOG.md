# Changelog

All notable changes to this project are documented in this file.

The project follows semantic versioning while the public API stabilizes.

## [Unreleased]

## [0.6.1] - 2026-07-21

- Reuse formula parsers across repeated cells and avoid redundant controlled-state and hidden-chart row-model work during React rendering.

## [0.6.0] - 2026-07-20

- Add pivot tables with multiple aggregations, totals, date buckets, collapse, drilldown, and server-side pivot contracts.
- Add an ECharts adapter and React chart panel for bar, line, area, pie, and scatter charts with export support.
- Add a formula engine package and integrate computed values with filtering, sorting, grouping, aggregation, clipboard, CSV, and Excel flows.
- Add pivot and formula APIs across the React, Vue, and Vanilla adapters.

## [0.5.0] - 2026-07-20

- Add synchronous and asynchronous cell validation with save status and rollback events.
- Add cancellable server block loading with retry, scoped LRU caching, and invalidation.
- Add imperative React and Vue Grid APIs, variable row heights, wrapped cells, locale text, and opt-in column virtualization.
- Expand the Vanilla adapter with state, focus, selection, scrolling, and export APIs.
- Add adapter parity checks, performance benchmarks, public API documentation, and migration guidance.

## [0.4.4] - 2026-07-13

- Preserve the React editor input across consecutive Korean IME syllables so later consonants are not lost.

## [0.4.3] - 2026-07-13

- Forward cell-owned Korean IME composition updates into the React editor so continuous input remains composed.

## [0.4.2] - 2026-07-13

- Fix React cell editing so Korean IME composition begins and commits without splitting consonants and vowels.

## [0.3.3] - 2026-07-06

- Improve the React demo expanded row detail layout across desktop and narrow viewports.
- Add demo tag color controls that update tag chips in cells, editors, and expanded row details.

## [0.3.2] - 2026-07-06

- Add a React selection summary bar for multi-cell ranges.
- Format React aggregation footer and demo numeric cells with thousands separators.
- Improve the React demo expanded row detail layout.
- Preserve tag option colors after the React tags editor blurs without changes.

## [0.3.1] - 2026-07-03

- Fix advanced header filters clipping in narrow columns.
- Align right-pinned React header and aggregation cells with the body scrollbar gutter.

## [0.3.0] - 2026-07-03

- Add advanced grid features across core, React, and Vue, including advanced filters, pinned rows, column presets, fit-to-width sizing, row reorder helpers, import helpers, and state persistence.
- Add the first `@youp-grid/vanilla` package.
- Add React demo coverage for accessibility and visual smoke checks.
- Align release metadata, package versions, and publish flow for all public packages.

## [0.2.17] - 2026-07-03

- Add public contribution, security, and GitHub maintenance templates.
- Improve npm package metadata for open-source discovery.
- Add release metadata checks for workspace version, package-lock, and adapter core dependency alignment.
- Document the full core, React, and Vue publish/release flow.

## [0.2.12] - 2026-07-01

- Add Playwright smoke coverage for the React basic demo.
- Keep React master-detail rows virtualized with detail row height accounting.
- Add Vue keyboard cell focus, range selection, and public event/slot type exports.
- Add example documentation for the runtime demo and smoke test.

## [0.2.9] - 2026-06-12

- Fix row paste below so copied row values are applied to inserted rows while preserving newly created row IDs.
- Keep `@youp-grid/core`, `@youp-grid/react`, and `@youp-grid/vue` package versions aligned.

## [0.2.2] - 2026-06-10

- Add column cell alignment support with `align: "left" | "center" | "right"`.
- Default number editors to right alignment and checkbox editors to centered alignment.
- Add `pinRowSelectionColumn` so selection checkboxes can scroll with regular columns when needed.
- Keep workspace package versions in sync across core and React packages.

## [0.2.1] - 2026-06-09

- Fix IME text startup so Korean composition can begin from a selected cell without splitting consonants and vowels.
- Keep workspace package versions in sync across core and React packages.

## [0.2.0] - 2026-06-09

- Prepare the workspace for public npm package releases.
- Keep `@youp-grid/core` and `@youp-grid/react` package versions aligned.

## [0.1.0] - 2026-06-09

- Initial public package baseline for the core engine and React adapter.
