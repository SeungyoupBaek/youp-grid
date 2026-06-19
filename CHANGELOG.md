# Changelog

All notable changes to this project are documented in this file.

The project follows semantic versioning while the public API stabilizes.

## [Unreleased]

- Add public contribution, security, and GitHub maintenance templates.
- Improve npm package metadata for open-source discovery.
- Add release metadata checks for workspace version, package-lock, and adapter core dependency alignment.
- Document the full core, React, and Vue publish/release flow.

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
