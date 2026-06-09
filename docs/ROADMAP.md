# Youp Grid Roadmap

This roadmap keeps the library scoped as a reusable grid engine, not a one-screen table.

## Phase 1: Core Engine

Status: implemented

- column definition API
- normalized column model
- nested field accessor
- row model
- serializable grid state
- sorting
- filtering
- pagination
- fixed-size row virtualization
- column visibility state
- column width state
- column order state
- row selection state
- core tests

Exit criteria:

- `npm test` passes without external services
- all core behavior is framework-agnostic
- UI adapters do not reimplement sort, filter, pagination, selection, or column state rules

## Phase 2: React Adapter

Status: implemented

- `@youp-grid/react` package
- `YoupGrid` component
- headless hook: `useYoupGrid`
- table renderer with semantic roles
- virtualized body renderer
- header sort controls
- filter inputs
- pagination controls
- column resize handle
- column chooser
- pinned columns
- keyboard cell navigation
- inline cell editing
- range selection
- clipboard copy/paste
- keyboard row selection
- controlled/uncontrolled state mode

Exit criteria:

- local demo renders 10,000 rows smoothly
- keyboard focus remains predictable
- core state can be controlled from outside React

## Phase 3: Production Table UX

Status: in progress

- undo/redo
- fill handle
- CSV export
- loading, empty, and error overlays
- column menu
- grouped headers
- density control
- custom cell renderer
- custom header renderer
- checkbox selection column
- row click and double-click events

Exit criteria:

- common admin, finance, and operations tables can use the library without forked behavior

## Phase 4: Advanced Data

Status: in progress

- server-side row model
- cursor pagination adapter
- infinite scrolling
- request cancellation contract
- cache invalidation contract
- aggregation
- row grouping
- tree data
- expandable rows
- master-detail rows

Exit criteria:

- large remote datasets do not require loading all rows into memory

## Phase 5: Library Quality

Status: planned

- TypeScript build
- package exports for ESM
- bundled CSS theme
- visual regression tests
- accessibility tests
- performance benchmarks
- docs site
- example gallery
- semver release process
- migration guide

Exit criteria:

- package can be published and upgraded safely by downstream applications
