# Migration Guide

## From 0.4.x to the next release

The new contracts are additive. Existing columns and grid props continue to work.

### Handle rollback events

Applications that use `onCellValueSave` should update controlled rows for every `onCellValueChange`, including `source: "rollback"`. Code that exhaustively checks `YoupGridCellValueChangeSource` must add the new source.

### Prefer the server data controller

Existing `onRowsEndReached` integrations remain supported. New remote integrations should use `ServerDataSource` and `createServerDataController` so cancellation, cache keys, retries, and loading ranges have one contract.

### Enable column virtualization explicitly

`columnVirtualization` defaults to `false`. Enable it on wide grids after verifying custom headers and editors. Header groups and detail rows automatically use full column rendering.

### Variable row heights

`rowHeight` remains the fixed default. Add `getRowHeight` only where rows need different heights. Set `wrapText` on columns that can wrap and return enough height for their expected line count.

### Imperative access

React uses `apiRef` rather than the component `ref`, preserving the generic component signature. Vue uses its standard component ref and exposed methods. Replace DOM queries with these APIs where possible.
