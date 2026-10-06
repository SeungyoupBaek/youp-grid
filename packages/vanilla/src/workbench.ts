import {
  applyGridView, buildRowModel, captureGridView, createGridImportPreview, deleteGridView,
  loadGridViews, matchGridImportHeaders, normalizeColumns, parseDelimitedText, saveGridViews,
  setDefaultGridView, setGridQuery, updateGridView, validateFilterExpression,
  type ColumnDef, type GridConditionalFormat, type GridEditSession, type GridFilterExpression,
  type GridImportPreview, type GridImportTable, type GridRowId, type GridState,
  type GridStateStorage, type GridViewCollection, type GridWorkbookAdapter,
  type ImportGridColumnMapping,
} from "@youp-grid/core";

const defaultText = {
  views: "Saved views", viewName: "View name", saveView: "Save view", renameView: "Rename view", deleteView: "Delete view", defaultView: "Set default", clearDefault: "Clear default", currentView: "Current settings",
  search: "Search all visible columns", filters: "Compound filters", addCondition: "Add condition", addGroup: "Add group", remove: "Remove", applyFilters: "Apply filters", clearFilters: "Clear compound filters",
  edits: "Pending changes", row: "Row", before: "Before", after: "After", saveChanges: "Save changes", discard: "Discard changes", undo: "Undo", redo: "Redo", saving: "Saving…",
  importFile: "Import CSV / XLSX", sheet: "Sheet", preview: "Preview import", applyImport: "Apply import", cancelImport: "Cancel import", exportXlsx: "Export XLSX", unmapped: "Do not import", importErrors: "Import errors",
  formatting: "Conditional formatting", addFormat: "Add formatting rule", column: "Column", operator: "Operator", value: "Value", color: "Text color", icon: "Icon", dataBar: "Data bar", min: "Minimum", max: "Maximum",
};
export type GridWorkbenchOptions<TRow> = {
  rows: readonly TRow[]; columns: readonly ColumnDef<TRow>[]; state: GridState;
  onStateChange: (state: GridState) => void; getRowId?: (row: TRow, index: number) => GridRowId;
  editSession?: GridEditSession<TRow>; formulaEngine?: Parameters<typeof buildRowModel<TRow>>[0]["formulaEngine"];
  viewStorage?: GridStateStorage; viewStorageKey?: string;
  workbookAdapter?: GridWorkbookAdapter; createImportRow?: (index: number) => TRow;
  onImportRows?: (rows: readonly TRow[]) => void | Promise<void>;
  conditionalFormats?: readonly GridConditionalFormat[];
  onConditionalFormatsChange?: (rules: readonly GridConditionalFormat[]) => void;
  disabled?: boolean; rowModelType?: "client" | "server";
  localeText?: Partial<typeof defaultText>;
};

/** Framework-free companion controls; React and Vue use this same interaction implementation. */
export function createGridWorkbench<TRow>(host: HTMLElement, initial: GridWorkbenchOptions<TRow>): { update: (options: GridWorkbenchOptions<TRow>) => void; destroy: () => void } {
  let options = initial;
  let text = { ...defaultText, ...options.localeText };
  let views: GridViewCollection = { version: 1, views: [] };
  let selectedView = "";
  let tables: GridImportTable[] = [];
  let tableIndex = 0;
  let mappings: ImportGridColumnMapping[] = [];
  let preview: GridImportPreview<TRow> | undefined;
  let importRevision = 0;
  let destroyed = false;
  let importing = false;
  let applyingImport = false;
  let filterDraft: GridFilterExpression = options.state.filterExpression ? JSON.parse(JSON.stringify(options.state.filterExpression)) : { operator: "and", conditions: [] };
  let unsubscribe: (() => void) | undefined;
  const root = document.createElement("section"); root.className = "youp-grid-workbench"; root.setAttribute("aria-label", "Grid workbench");
  const status = document.createElement("p"); status.setAttribute("role", "status");
  const message = (cause?: unknown) => { status.textContent = cause === undefined ? "" : cause instanceof Error ? cause.message : String(cause); status.setAttribute("role", cause instanceof Error ? "alert" : "status"); };
  const busy = () => options.disabled || options.editSession?.getSnapshot().saving || importing || applyingImport;
  const run = (action: () => unknown) => { try { if (busy()) return; message(); action(); } catch (cause) { message(cause); } };
  const button = (label: string, action: () => void, disabled = false) => { const node = document.createElement("button"); node.type = "button"; node.textContent = label; node.dataset.intrinsicDisabled = String(disabled); node.disabled = disabled; node.onclick = () => run(action); return node; };
  const input = (label: string, value = "", type = "text") => { const node = document.createElement("input"); node.type = type; node.value = value; node.setAttribute("aria-label", label); return node; };
  const labelled = (caption: string, control: HTMLElement) => { const label = document.createElement("label"); label.append(document.createTextNode(caption), control); return label; };
  const select = (label: string, items: readonly { id: string; name: string }[], value = "") => { const node = document.createElement("select"); node.setAttribute("aria-label", label); for (const item of items) { const option = document.createElement("option"); option.value = item.id; option.textContent = item.name; node.append(option); } node.value = value; return node; };
  const panel = (label: string) => { const details = document.createElement("details"); const summary = document.createElement("summary"); summary.textContent = label; details.append(summary); const body = document.createElement("div"); body.className = "youp-grid-workbench__panel"; details.append(body); root.append(details); return body; };
  const normalized = () => normalizeColumns(options.columns);
  const columns = () => normalized().filter((column) => column.filterable !== false);
  const commit = (state: GridState) => { options.onStateChange(state); };
  const persist = (next: GridViewCollection, selection = selectedView) => { if (options.viewStorage) saveGridViews(options.viewStorage, options.viewStorageKey ?? "youp-grid-views", next); views = next; selectedView = selection; renderViews(); };
  const viewsPanel = panel(text.views);
  const viewName = input(text.viewName);
  const viewSelect = select(text.views, []);
  const renderViews = () => {
    viewSelect.replaceChildren();
    for (const item of [{ id: "", name: text.currentView }, ...views.views.map((view) => ({ id: view.id, name: `${view.name}${view.id === views.defaultViewId ? " ★" : ""}` }))]) {
      const node = document.createElement("option"); node.value = item.id; node.textContent = item.name; viewSelect.append(node);
    }
    viewSelect.value = selectedView;
  };
  viewSelect.onchange = () => run(() => { const view = views.views.find((item) => item.id === viewSelect.value); viewSelect.value = selectedView; if (view) commit(applyGridView(options.state, view, normalized())); selectedView = view?.id ?? ""; viewName.value = view?.name ?? ""; renderViews(); });
  viewsPanel.append(labelled(text.views, viewSelect), labelled(text.viewName, viewName),
    button(text.saveView, () => { const id = globalThis.crypto.randomUUID(); const next = updateGridView(views, { id, name: viewName.value, settings: captureGridView(options.state) }); persist(next, id); }),
    button(text.renameView, () => { const view = views.views.find((view) => view.id === selectedView); if (!view) throw new Error("Select a saved view first"); persist(updateGridView(views, { ...view, name: viewName.value })); }),
    button(text.deleteView, () => persist(deleteGridView(views, selectedView), "")),
    button(text.defaultView, () => persist(setDefaultGridView(views, selectedView || undefined))),
    button(text.clearDefault, () => persist(setDefaultGridView(views, undefined))),
  );
  const search = input(text.search, options.state.quickFilter ?? ""); search.placeholder = text.search;
  search.oninput = () => run(() => commit(setGridQuery(options.state, { quickFilter: search.value })));
  root.append(search);
  const filterPanel = panel(text.filters);
  const filterBody = document.createElement("div");
  const makeCondition = (): GridFilterExpression => ({ columnId: columns()[0]?.id ?? "", operator: "contains", value: "" });
  const renderExpression = (node: GridFilterExpression, remove?: () => void): HTMLElement => {
    const box = document.createElement("fieldset");
    if ("conditions" in node) {
      const mode = select("Match conditions", [{ id: "and", name: "All (AND)" }, { id: "or", name: "Any (OR)" }], node.operator);
      mode.onchange = () => { node.operator = mode.value as "and" | "or"; };
      box.append(mode, button(text.addCondition, () => { node.conditions.push(makeCondition()); renderFilters(); }), button(text.addGroup, () => { node.conditions.push({ operator: "or", conditions: [makeCondition()] }); renderFilters(); }));
      if (remove) box.append(button(text.remove, remove));
      node.conditions.forEach((child, index) => box.append(renderExpression(child, () => { node.conditions.splice(index, 1); renderFilters(); })));
    } else {
      const column = select(text.column, columns().map((column) => ({ id: column.id, name: column.headerName })), node.columnId);
      const operator = select(text.operator, ["contains", "equals", "startsWith", "endsWith", "gt", "gte", "lt", "lte", "between", "in", "isEmpty", "isNotEmpty"].map((id) => ({ id, name: id })), node.operator);
      const value = input(text.value, Array.isArray(node.value) ? JSON.stringify(node.value) : String(node.value ?? ""));
      const sync = () => {
        node.columnId = column.value; node.operator = operator.value as typeof node.operator;
        if (["isEmpty", "isNotEmpty"].includes(operator.value)) node.value = null;
        else if (["between", "in"].includes(operator.value)) { try { node.value = JSON.parse(value.value); } catch { node.value = value.value; } }
        else if (["gt", "gte", "lt", "lte"].includes(operator.value) || (operator.value === "equals" && normalized().find((item) => item.id === column.value)?.editor === "number")) node.value = value.value.trim() === "" ? undefined : Number(value.value);
        else node.value = value.value;
      };
      column.onchange = sync; operator.onchange = sync; value.oninput = sync;
      box.append(labelled(text.column, column), labelled(text.operator, operator), labelled(text.value, value)); if (remove) box.append(button(text.remove, remove));
    }
    return box;
  };
  const renderFilters = () => { filterBody.replaceChildren(renderExpression(filterDraft)); };
  filterPanel.append(filterBody, button(text.applyFilters, () => { validateFilterExpression(filterDraft, normalized()); commit(setGridQuery(options.state, { filterExpression: JSON.parse(JSON.stringify(filterDraft)) })); }), button(text.clearFilters, () => { filterDraft = { operator: "and", conditions: [] }; commit(setGridQuery(options.state, { filterExpression: undefined })); renderFilters(); }));
  const batchPanel = panel(text.edits);
  const renderBatch = () => {
    batchPanel.replaceChildren();
    const session = options.editSession;
    if (!session) { batchPanel.parentElement!.hidden = true; return; }
    batchPanel.parentElement!.hidden = false;
    const snapshot = session.getSnapshot();
    const count = document.createElement("p"); count.textContent = `${snapshot.changes.length} ${text.edits}`; count.setAttribute("role", "status");
    const table = document.createElement("table");
    const heading = document.createElement("tr"); for (const caption of [text.row, text.column, text.before, "", text.after]) { const th = document.createElement("th"); th.textContent = caption; heading.append(th); } table.append(heading);
    for (const change of snapshot.changes) {
      const row = document.createElement("tr");
      for (const value of [change.rowId, normalized().find((column) => column.id === change.columnId)?.headerName ?? change.columnId, change.previousValue, "→", change.value]) { const cell = document.createElement("td"); cell.textContent = String(value ?? ""); row.append(cell); }
      table.append(row);
    }
    const errors = document.createElement("p"); errors.setAttribute("role", "alert"); errors.textContent = [snapshot.error, ...Object.values(snapshot.errors)].filter(Boolean).join(" · ");
    const save = button(snapshot.saving ? text.saving : text.saveChanges, () => { void session.save().catch(message); }, !snapshot.changes.length || snapshot.saving || options.disabled);
    batchPanel.append(count, table, errors, save, button(text.discard, () => session.discard(), snapshot.saving || !snapshot.changes.length), button(text.undo, () => session.undo(), snapshot.saving || !snapshot.canUndo), button(text.redo, () => session.redo(), snapshot.saving || !snapshot.canRedo));
  };
  const importPanel = panel(text.importFile);
  const fileInput = input(text.importFile, "", "file"); fileInput.accept = ".csv,.tsv,.xlsx";
  const importBody = document.createElement("div");
  const renderImport = () => {
    importBody.replaceChildren();
    const table = tables[tableIndex]; if (!table) return;
    const sheet = select(text.sheet, tables.map((table, index) => ({ id: String(index), name: table.name })), String(tableIndex));
    sheet.onchange = () => { tableIndex = Number(sheet.value); mappings = matchGridImportHeaders(options.columns, tables[tableIndex].headers); preview = undefined; importRevision++; renderImport(); };
    importBody.append(labelled(text.sheet, sheet));
    for (const column of normalized().filter((column) => column.field && !column.formula)) {
      const mapping = select(`Map ${column.headerName}`, [{ id: "", name: `${column.headerName}: ${text.unmapped}` }, ...table.headers.map((header, index) => ({ id: String(index), name: `${column.headerName} ← ${header || `Column ${index + 1}`}` }))], String(mappings.find((mapping) => mapping.columnId === column.id)?.sourceIndex ?? ""));
      mapping.onchange = () => { mappings = mappings.filter((mapping) => mapping.columnId !== column.id); if (mapping.value !== "") mappings.push({ columnId: column.id, sourceIndex: Number(mapping.value) }); preview = undefined; importRevision++; renderImport(); };
      importBody.append(labelled(column.headerName, mapping));
    }
    importBody.append(button(text.preview, () => {
      const revision = ++importRevision; preview = undefined; importing = true; updateDisabled();
      void createGridImportPreview({ table, columns: options.columns, mappings, createRow: options.createImportRow!, getRowId: options.getRowId, existingRowIds: options.getRowId ? options.rows.map(options.getRowId) : undefined }).then((result) => { if (!destroyed && revision === importRevision) { preview = result; renderImport(); } }).catch(message).finally(() => { if (revision === importRevision) { importing = false; updateDisabled(); } });
    }), button(text.applyImport, () => {
      if (!preview?.valid) return;
      const revision = importRevision; const rows = preview.rows; const apply = options.onImportRows!; applyingImport = true; updateDisabled();
      void Promise.resolve().then(() => apply(rows)).then(() => { if (!destroyed) { tables = []; preview = undefined; fileInput.value = ""; renderImport(); } }).catch((cause) => { if (!destroyed && revision === importRevision) message(cause); }).finally(() => { applyingImport = false; updateDisabled(); });
    }, !preview?.valid), button(text.cancelImport, () => { importRevision++; tables = []; preview = undefined; renderImport(); fileInput.value = ""; }));
    if (preview) {
      const summary = document.createElement("p"); summary.textContent = `${preview.rows.length} rows · ${preview.issues.length} ${text.importErrors}`; summary.setAttribute("role", "status"); importBody.append(summary);
      const sample = document.createElement("table");
      const header = document.createElement("tr"); for (const column of normalized().filter((column) => mappings.some((mapping) => mapping.columnId === column.id))) { const th = document.createElement("th"); th.textContent = column.headerName; header.append(th); } sample.append(header);
      for (const row of preview.rows.slice(0, 10)) { const tr = document.createElement("tr"); for (const column of normalized().filter((column) => mappings.some((mapping) => mapping.columnId === column.id))) { const td = document.createElement("td"); td.textContent = String(column.accessor(row) ?? ""); tr.append(td); } sample.append(tr); } importBody.append(sample);
      if (preview.issues.length) {
        const errors = document.createElement("div"); errors.setAttribute("role", "alert");
        for (const issue of preview.issues.slice(0, 50)) { const line = document.createElement("p"); line.textContent = `Row ${issue.rowIndex + 2} ${issue.columnId ?? ""}: ${issue.message}`; errors.append(line); }
        importBody.append(errors);
      }
    }
  };
  fileInput.onchange = () => {
    if (busy()) return;
    const file = fileInput.files?.[0]; if (!file) return;
    const revision = ++importRevision; preview = undefined; tables = []; importing = true; updateDisabled();
    void (async () => {
      const result = /\.xlsx$/i.test(file.name) ? await (() => { if (!options.workbookAdapter) throw new Error("Configure an XLSX workbook adapter first"); return file.arrayBuffer().then((data) => options.workbookAdapter!.read(data)); })() : await file.text().then((text) => { const rows = parseDelimitedText(text, /\.tsv$/i.test(file.name) ? "\t" : ","); return [{ name: file.name, headers: rows[0] ?? [], rows: rows.slice(1) }]; });
      if (!destroyed && revision === importRevision) { tables = result; tableIndex = 0; mappings = matchGridImportHeaders(options.columns, tables[0]?.headers ?? []); renderImport(); }
    })().catch(message).finally(() => { if (revision === importRevision) { importing = false; updateDisabled(); } });
  };
  const exportButton = button(text.exportXlsx, () => {
    const model = buildRowModel({ rows: options.editSession?.getSnapshot().rows ?? options.rows, columns: options.columns, state: options.state, getRowId: options.getRowId, formulaEngine: options.formulaEngine });
    void options.workbookAdapter!.write({ rows: model.sortedRows, columns: model.visibleColumns }).then((data) => {
      if (destroyed) return; const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); const link = document.createElement("a"); link.href = url; link.download = "youp-grid.xlsx"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0);
    }).catch(message);
  });
  importPanel.append(fileInput, importBody, exportButton);
  const formatPanel = panel(text.formatting);
  const formatColumn = select(text.column, normalized().map((column) => ({ id: column.id, name: column.headerName })));
  const formatOperator = select(text.operator, ["lt", "gt", "equals", "contains", "isNotEmpty"].map((id) => ({ id, name: id })));
  const formatValue = input(text.value, "0"); const color = input(text.color, "#dc2626", "color"); const icon = input(text.icon); const min = input(text.min, "0", "number"); const max = input(text.max, "100", "number"); const bar = input(text.dataBar, "", "checkbox");
  const formatList = document.createElement("div");
  const renderFormats = () => { formatList.replaceChildren(); for (const rule of options.conditionalFormats ?? []) { const row = document.createElement("div"); const label = document.createElement("span"); label.textContent = `${rule.columnId} ${rule.operator} ${String(rule.value ?? "")} ${rule.icon ?? ""}`; row.append(label, button(`${text.remove} ${rule.columnId} rule`, () => options.onConditionalFormatsChange?.((options.conditionalFormats ?? []).filter((item) => item.id !== rule.id)))); formatList.append(row); } };
  formatPanel.append(labelled(text.column, formatColumn), labelled(text.operator, formatOperator), labelled(text.value, formatValue), labelled(text.color, color), labelled(text.icon, icon), labelled(text.dataBar, bar), labelled(text.min, min), labelled(text.max, max), button(text.addFormat, () => {
    const numeric = ["lt", "gt"].includes(formatOperator.value) || (formatOperator.value === "equals" && normalized().find((column) => column.id === formatColumn.value)?.editor === "number");
    const value = numeric ? Number(formatValue.value) : formatValue.value;
    if (numeric && !Number.isFinite(value)) throw new Error("Enter a finite number");
    if (bar.checked && !(Number(max.value) > Number(min.value))) throw new Error("Data bar maximum must exceed minimum");
    options.onConditionalFormatsChange?.([...(options.conditionalFormats ?? []), { id: crypto.randomUUID(), columnId: formatColumn.value, operator: formatOperator.value as GridConditionalFormat["operator"], value, color: color.value, icon: icon.value || undefined, dataBar: bar.checked ? { min: Number(min.value), max: Number(max.value) } : undefined }]);
  }), formatList);
  const updateDisabled = () => {
    for (const action of root.querySelectorAll<HTMLButtonElement>("button")) action.disabled = Boolean(busy()) || action.dataset.intrinsicDisabled === "true";
    for (const field of root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input,select")) field.disabled = Boolean(busy());
    importPanel.parentElement!.hidden = !options.onImportRows && !options.workbookAdapter;
    fileInput.hidden = !options.onImportRows || !options.createImportRow;
    exportButton.hidden = !options.workbookAdapter; exportButton.disabled = Boolean(busy()) || options.rowModelType === "server";
    formatPanel.parentElement!.hidden = !options.onConditionalFormatsChange;
  };
  root.append(status); host.append(root);
  const subscribe = () => { unsubscribe?.(); unsubscribe = options.editSession?.subscribe(() => { renderBatch(); updateDisabled(); }); };
  try {
    if (options.viewStorage) views = loadGridViews(options.viewStorage, options.viewStorageKey ?? "youp-grid-views");
    const defaultView = views.views.find((view) => view.id === views.defaultViewId);
    if (defaultView) { commit(applyGridView(options.state, defaultView, normalized())); selectedView = defaultView.id; }
  } catch (cause) { message(cause); }
  renderViews(); renderFilters(); renderBatch(); renderFormats(); updateDisabled(); subscribe();
  return {
    update(next) {
      const previous = options;
      options = next; text = { ...defaultText, ...options.localeText };
      if (previous.rows !== options.rows || previous.columns !== options.columns) { importRevision++; importing = false; preview = undefined; renderImport(); }
      if (previous.editSession !== options.editSession) subscribe();
      if (document.activeElement !== search) search.value = options.state.quickFilter ?? "";
      if (JSON.stringify(previous.state.filterExpression) !== JSON.stringify(options.state.filterExpression)) { filterDraft = options.state.filterExpression ? JSON.parse(JSON.stringify(options.state.filterExpression)) : { operator: "and", conditions: [] }; renderFilters(); }
      if (previous.viewStorage !== options.viewStorage || previous.viewStorageKey !== options.viewStorageKey) { try { views = options.viewStorage ? loadGridViews(options.viewStorage, options.viewStorageKey ?? "youp-grid-views") : { version: 1, views: [] }; selectedView = ""; renderViews(); } catch (cause) { message(cause); } }
      renderBatch(); renderFormats(); updateDisabled();
    },
    destroy() { destroyed = true; importRevision++; unsubscribe?.(); root.remove(); },
  };
}
