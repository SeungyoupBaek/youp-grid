# @youp-grid/formula

Optional spreadsheet formula engine for Youp Grid. Supports A1 references, ranges, computed columns, structured references such as `=[quantity]*[price]`, named values, custom functions, dependency tracking, reference shifting, and cycle errors.

```ts
import { createFormulaEngine } from "@youp-grid/formula";

const formulaEngine = createFormulaEngine();
```
