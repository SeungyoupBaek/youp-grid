import { useEffect, useRef, useState } from "react";
import { createApp, defineComponent, h, onUnmounted, shallowRef } from "vue";
import { createGridEditSession, type ColumnDef, type GridAiProvider, type GridConditionalFormat, type GridState, type GridWorkbookAdapter } from "@youp-grid/core";
import { YoupGrid, YoupGridAiPanel, YoupGridWorkbench } from "@youp-grid/react";
import { YoupGrid as VueGrid, YoupGridAiPanel as VueAi, YoupGridWorkbench as VueWorkbench } from "@youp-grid/vue";
import "@youp-grid/vue/styles.css";
import "@youp-grid/vanilla/styles.css";

type Order = { id: string; item: string; status: string; quantity: number };
const initial: Order[] = [{ id: "a", item: "Apple", status: "Open", quantity: 10 }, { id: "b", item: "Banana", status: "Closed", quantity: 20 }, { id: "c", item: "Cherry", status: "Open", quantity: 30 }];
const rowId = (row: Order) => row.id;
const columns: ColumnDef<Order>[] = [
  { id: "item", field: "item", headerName: "Item", validator: (value) => Boolean(String(value).trim()) || "Item is required" },
  { id: "status", field: "status", headerName: "Status" },
  { id: "quantity", field: "quantity", headerName: "Quantity", editor: "number", valueParser: Number, validator: (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 || "Quantity must be a nonnegative number" },
  { id: "id", field: "id", headerName: "ID", hidden: true },
];
const provider: GridAiProvider = async () => ({ actions: [{ type: "setFilter", columnId: "status", operator: "equals", value: "Open" }, { type: "setSort", columnId: "quantity", direction: "desc", multi: false }], explanation: "Preview: Open orders, quantity descending." });
const createImportRow = (): Order => ({ id: crypto.randomUUID(), item: "", status: "Open", quantity: 0 });
function ReactWorkflow() {
  const [rows, setRows] = useState(initial); const currentRows = useRef(rows); currentRows.current = rows;
  const [state, setState] = useState<GridState>({ selectedRowIds: [] });
  const [formats, setFormats] = useState<readonly GridConditionalFormat[]>([]);
  const [workbook, setWorkbook] = useState<GridWorkbookAdapter>();
  const [saved, setSaved] = useState(0); const failNext = useRef(false);
  const [session] = useState(() => createGridEditSession({ rows: initial, columns, getRowId: rowId, onSave: async (changes) => {
    if (failNext.current) { failNext.current = false; throw new Error("Demo save failed. Changes kept; retry saving."); }
    const next = currentRows.current.map((row) => changes.filter((change) => change.rowId === row.id).reduce((value, change) => ({ ...value, [change.columnId]: change.value }), row));
    setRows(next); setSaved((value) => value + 1); return next;
  } }));
  useEffect(() => () => session.dispose(), [session]);
  return <section data-adapter="react" className="workflow-demo">
    <h2>React workflows</h2>
    <button onClick={() => { failNext.current = true; }}>Fail next save</button>
    <button disabled={Boolean(workbook)} onClick={() => { void import("@youp-grid/xlsx").then(({ createXlsxAdapter }) => setWorkbook(createXlsxAdapter())); }}>Enable XLSX</button>
    <p data-testid="saved-count">Successful saves: {saved}</p>
    <YoupGridWorkbench rows={rows} columns={columns} state={state} onStateChange={setState} getRowId={rowId} editSession={session} viewStorage={localStorage} viewStorageKey="workflow-react-views" workbookAdapter={workbook} createImportRow={createImportRow} onImportRows={(imported) => { const next = [...rows, ...imported]; session.replaceRows(next); setRows(next); }} conditionalFormats={formats} onConditionalFormatsChange={setFormats} />
    <YoupGridAiPanel columns={columns} state={state} provider={provider} onStateChange={setState} preview />
    <YoupGrid rows={rows} columns={columns} state={state} onStateChange={({ state }) => setState(state)} editSession={session} conditionalFormats={formats} getRowId={rowId} height={240} showRowSelectionColumn showColumnChooser />
  </section>;
}
const VueWorkflow = defineComponent({
  setup() {
    const rows = shallowRef(initial); const state = shallowRef<GridState>({ selectedRowIds: [] }); const formats = shallowRef<readonly GridConditionalFormat[]>([]);
    const workbook = shallowRef<GridWorkbookAdapter>(); const saved = shallowRef(0); let failNext = false;
    const session = createGridEditSession({ rows: initial, columns, getRowId: rowId, onSave: async (changes) => {
      if (failNext) { failNext = false; throw new Error("Demo save failed. Changes kept; retry saving."); }
      rows.value = rows.value.map((row) => changes.filter((change) => change.rowId === row.id).reduce((value, change) => ({ ...value, [change.columnId]: change.value }), row));
      saved.value++; return rows.value;
    } });
    onUnmounted(() => session.dispose());
    const changeState = (next: GridState) => { state.value = next; };
    return () => h("section", { "data-adapter": "vue", class: "workflow-demo" }, [
      h("h2", "Vue workflows"),
      h("button", { onClick: () => { failNext = true; } }, "Fail next save"),
      h("button", { disabled: Boolean(workbook.value), onClick: () => { void import("@youp-grid/xlsx").then(({ createXlsxAdapter }) => { workbook.value = createXlsxAdapter(); }); } }, "Enable XLSX"),
      h("p", { "data-testid": "saved-count" }, `Successful saves: ${saved.value}`),
      h(VueWorkbench, { options: { rows: rows.value, columns, state: state.value, onStateChange: changeState, getRowId: rowId, editSession: session, viewStorage: localStorage, viewStorageKey: "workflow-vue-views", workbookAdapter: workbook.value, createImportRow, onImportRows: (imported: readonly Order[]) => { const next = [...rows.value, ...imported]; session.replaceRows(next); rows.value = next; }, conditionalFormats: formats.value, onConditionalFormatsChange: (next: readonly GridConditionalFormat[]) => { formats.value = next; } } }),
      h(VueAi, { columns, state: state.value, provider, onStateChange: changeState, preview: true }),
      h(VueGrid, { rows: rows.value, columns: columns as ColumnDef<unknown>[], state: state.value, onStateChange: ({ state: next }: { state: GridState }) => changeState(next), editSession: session, conditionalFormats: formats.value, getRowId: rowId, height: 240, showRowSelectionColumn: true, showColumnChooser: true }),
    ]);
  },
});
export function WorkflowDemo() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { const app = createApp(VueWorkflow); app.mount(host.current!); return () => app.unmount(); }, []);
  return <main className="workflow-page"><h1>Youp Grid feature workflows</h1><p>Save views, preview imports and AI, and save or discard edits in either adapter.</p><a href="?">Back to the main demo</a><ReactWorkflow /><div ref={host} /></main>;
}
