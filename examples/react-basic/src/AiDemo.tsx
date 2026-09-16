import { useMemo, useState } from "react";
import type { ColumnDef, GridAiProvider, GridAiResponse, GridState } from "@youp-grid/core";
import { YoupGridAiPanel } from "@youp-grid/react";

// Explicit fixtures demonstrate the integration without pretending to call a model.
const EXAMPLES: Record<string, GridAiResponse> = {
  "Open 거래만 보여주고 수량 높은 순으로 정렬해줘": {
    actions: [
      { type: "setFilter", columnId: "status", operator: "equals", value: "Open" },
      { type: "setSort", columnId: "quantity", direction: "desc", multi: false },
    ],
    explanation: "Open 거래를 수량 내림차순으로 표시했습니다.",
  },
  "가격 컬럼 숨겨줘": {
    actions: [{ type: "setColumnHidden", columnId: "price", hidden: true }],
    explanation: "가격 컬럼을 숨겼습니다.",
  },
  "필터와 정렬 해제하고 가격 컬럼 보여줘": {
    actions: [
      { type: "clearFilter", columnId: "status" },
      { type: "clearSort", columnId: "quantity" },
      { type: "setColumnHidden", columnId: "price", hidden: false },
    ],
    explanation: "예제로 적용한 필터·정렬·컬럼 표시를 초기화했습니다.",
  },
};

export function AiDemo<TRow>(props: {
  columns: readonly ColumnDef<TRow>[];
  state: GridState;
  onStateChange: (state: GridState) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState("example");
  const [endpoint, setEndpoint] = useState("/api/grid-ai");
  const provider = useMemo<GridAiProvider>(() => async (request, { signal }) => {
    if (mode === "example") {
      return EXAMPLES[request.prompt] ?? { actions: [], explanation: "예제 모드는 아래의 문장만 지원합니다. 자유로운 명령은 AI 서버를 연결해 사용하세요." };
    }
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    if (!response.ok) throw new Error(`AI server returned HTTP ${response.status}.`);
    return response.json();
  }, [mode, endpoint]);

  return <details className="demo-ai">
    <summary>AI commands</summary>
    <label>
      Provider{" "}
      <select aria-label="AI provider mode" value={mode} onChange={(event) => setMode(event.target.value)}>
        <option value="example">Example responses — no model connected</option>
        <option value="server">Your AI server</option>
      </select>
    </label>
    {mode === "server" ? <label>
      {" "}Endpoint{" "}
      <input aria-label="AI server endpoint" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
    </label> : <ul>{Object.keys(EXAMPLES).map((prompt) => <li key={prompt}>{prompt}</li>)}</ul>}
    {props.disabled ? <p>Switch off server, cursor, and infinite demo modes to try AI commands.</p> : null}
    <YoupGridAiPanel {...props} provider={provider} localeText={{
      label: "AI 명령", placeholder: Object.keys(EXAMPLES)[0], submit: "적용", cancel: "취소",
      loading: "처리 중…", applied: "적용했습니다.",
      stale: "대기 중 그리드가 변경되었습니다. 명령을 다시 실행하세요.",
      failed: "명령을 적용하지 못했습니다. 다시 시도하세요.",
    }} />
  </details>;
}
