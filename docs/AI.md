# AI grid commands

Youp Grid can turn model responses into sorting, filtering, and column visibility changes. The application supplies a `GridAiProvider`; the grid does not depend on a model vendor or SDK.

The first version supports `setSort`, `clearSort`, `setFilter`, `clearFilter`, and `setColumnHidden`. It does not generate code, edit rows, or analyze the dataset.

## React

Use the companion panel with a controlled grid. Keep the provider function stable, for example at module scope or with `useCallback`.

```tsx
import { useState } from "react";
import type { ColumnDef, GridAiProvider, GridState } from "@youp-grid/core";
import { YoupGrid, YoupGridAiPanel } from "@youp-grid/react";
import "@youp-grid/react/styles.css";

type Sale = { id: string; city: string; sales: number };
const columns: ColumnDef<Sale>[] = [
  { field: "city", headerName: "지역" },
  { field: "sales", headerName: "매출", editor: "number" },
];

const provider: GridAiProvider = async (request, { signal }) => {
  const response = await fetch("/api/grid-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) throw new Error("AI request failed.");
  return response.json();
};

export function SalesGrid({ rows }: { rows: Sale[] }) {
  const [state, setState] = useState<GridState>({});
  return <>
    <YoupGridAiPanel
      columns={columns}
      state={state}
      provider={provider}
      onStateChange={setState}
      localeText={{ label: "AI 명령", placeholder: "서울만 보여주고 매출 높은 순으로 정렬해줘", submit: "적용" }}
    />
    <YoupGrid rows={rows} columns={columns} state={state}
      getRowId={(row) => row.id} onStateChange={({ state }) => setState(state)} />
  </>;
}
```

The panel provides loading, cancellation, errors, and retry by resubmitting. Cancelled requests cannot apply a late response, even when a provider ignores the abort signal. Changes to the relevant grid context or provider while a request is pending invalidate that response. Unrelated state, such as row selection, is preserved from the latest state.

## Server contract

The `/api/grid-ai` route above is implemented by the consuming application. Its job is to:

1. Authenticate the caller and call the selected model using server-held credentials.
2. Supply `instructions`, `prompt`, and `context` from the request to the model. Use `responseSchema` with the model's structured output facility when supported; adapt it to the provider's schema dialect as needed.
3. Return the model's JSON result, not a provider-specific response envelope.

For “서울만 보여주고 매출 높은 순으로 정렬해줘”, a response is:

```json
{
  "actions": [
    { "type": "setFilter", "columnId": "city", "operator": "equals", "value": "서울" },
    { "type": "setSort", "columnId": "sales", "direction": "desc", "multi": false }
  ],
  "explanation": "서울 데이터를 매출 내림차순으로 표시했습니다."
}
```

Return `{ "actions": [], "explanation": "..." }` for an unsupported or ambiguous request. A provider can return either parsed JSON or a JSON string. Markdown code fences are not accepted. Limit responses to 100 actions.

Requests contain the prompt, column IDs/labels/editor hints/capabilities, current filters and sorting, and effective column visibility. They do not contain rows, selected row IDs, formulas, or editor option lists. Prompts and existing filter values may themselves contain business data; the application chooses the server and model that receive them. Hidden columns remain eligible for visibility commands. Only supply columns the caller is allowed to operate on; display visibility is not an authorization boundary.

The response schema and runtime validation reject unknown columns, unsupported operations, unexpected properties, malformed values, and sorting/filtering on columns where the respective capability is disabled. Filter values retain their JSON types: `equals` is strict equality, so a numeric column needs a numeric value. Text operators need strings; comparison operators accept numbers or strings; `in` needs a nonempty scalar array; `between` needs two numbers or two strings; `isEmpty` and `isNotEmpty` use `value: null`.

Rules on different columns are ANDed; each column has one filter. `setSort` replaces sorting when `multi` is false and adds a sort when it is true. Clear operations address one column at a time. All actions are validated before any state is returned. Existing core helpers preserve the filter pagination/cursor reset and remote cache invalidation behavior. Server row models still require the application's normal fetch/refetch logic to consume the resulting state.

## Vue, Vanilla, and custom interfaces

The core functions work without React:

```ts
import { createGridAiRequest, applyGridAiResponse } from "@youp-grid/core";

const request = createGridAiRequest({ prompt, columns, state });
const response = await provider(request, { signal });
// Before applying, check cancellation and that the relevant grid context is still current.
const result = applyGridAiResponse({ response, columns, state });
setState(result.state);
```

Custom interfaces own cancellation and concurrent state changes; `applyGridAiResponse` is a synchronous, immutable validator/state transformation. The ready-made input panel is currently provided by the React package.

## Demo and validation

Open **AI commands** in the React demo. **Example responses** only recognizes the displayed fixture sentences and does not call a model. **Your AI server** sends requests to the configured endpoint using the contract above; configure your own endpoint before using this mode.

Unit tests cover the resulting rows, preserved state, response validation, retries, and server state behavior. Browser tests cover example commands and mocked HTTP providers, including failures, concurrent manual changes, and cancellation. These tests do not prove the quality or availability of a live model.
