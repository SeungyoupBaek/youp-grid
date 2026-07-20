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
- variable-size row and column virtualization helpers
- cell validation contract
- cancellable server data source and block cache controller
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
- column drag reorder
- column order menu and reset controls
- column chooser
- pinned columns
- keyboard cell navigation
- inline cell editing
- range selection
- clipboard copy/paste
- keyboard row selection
- controlled/uncontrolled state mode
- imperative Grid API
- opt-in center-column virtualization
- variable row heights and wrapped cells
- locale text overrides

Exit criteria:

- local demo renders 10,000 rows smoothly
- keyboard focus remains predictable
- core state can be controlled from outside React

## Phase 3: Production Table UX

Status: implemented

- undo/redo
- fill handle
- CSV and Excel import/export
- loading, empty, and error overlays
- date and datetime editors
- custom editor extension points
- column menu
- advanced filter UI
- grouped headers
- density control
- custom cell renderer
- custom header renderer
- checkbox selection column
- row click and double-click events
- synchronous and asynchronous cell validation
- asynchronous save status and rollback events

Exit criteria:

- common admin, finance, and operations tables can use the library without forked behavior

## Phase 4: Advanced Data

Status: implemented

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
- pinned top and bottom rows
- controlled row drag reorder
- standardized remote block loading, status, retry, and cancellation

Exit criteria:

- large remote datasets do not require loading all rows into memory

## Phase 5: Library Quality

Status: implemented

- TypeScript build
- package exports for ESM
- bundled CSS theme
- Playwright interaction smoke tests
- adapter parity check script
- example gallery
- visual smoke tests
- accessibility tests
- performance benchmarks
- docs site
- semver release process
- migration guide
- React and Vue shared API contract checks
- Vanilla state, selection, focus, scrolling, and export API

Exit criteria:

- package can be published and upgraded safely by downstream applications
