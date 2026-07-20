import assert from "node:assert/strict";
import test from "node:test";

import type { ColumnDef, GridState } from "@youp-grid/core";
import { renderToString } from "@vue/server-renderer";
import { createSSRApp, h, ref } from "vue";

import { YoupGrid } from "../src/YoupGrid.ts";
import { useYoupGrid } from "../src/useYoupGrid.ts";

type User = {
  id: string;
  name: string;
  age: number;
};

const rows: User[] = [
  { id: "1", name: "Kim", age: 34 },
  { id: "2", name: "Lee", age: 28 },
  { id: "3", name: "Park", age: 41 },
];

const columns: ColumnDef<User>[] = [
  { field: "name", headerName: "Name" },
  { field: "age", headerName: "Age" },
];

test("useYoupGrid manages uncontrolled grid state", () => {
  const controller = useYoupGrid({
    rows,
    columns,
    getRowId: (row) => row.id,
  });

  controller.setSort("age", "desc");

  assert.deepEqual(controller.state.value.sort, [{ columnId: "age", direction: "desc" }]);
  assert.deepEqual(
    controller.rowModel.value.visibleRows.map((row) => row.id),
    ["3", "1", "2"],
  );
});

test("useYoupGrid sets column order", () => {
  const controller = useYoupGrid({
    rows,
    columns,
    getRowId: (row) => row.id,
  });

  controller.setColumnOrder(["age", "name"]);

  assert.deepEqual(
    controller.rowModel.value.visibleColumns.map((column) => column.id),
    ["age", "name"],
  );
});

test("useYoupGrid supports controlled state", () => {
  const state = ref<GridState>({});
  const controller = useYoupGrid(() => ({
    rows,
    columns,
    state: state.value,
    getRowId: (row) => row.id,
    onStateChange: (change) => {
      state.value = change.state;
    },
  }));

  controller.toggleSort("age");

  assert.deepEqual(state.value.sort, [{ columnId: "age", direction: "asc" }]);
  assert.deepEqual(
    controller.rowModel.value.visibleRows.map((row) => row.id),
    ["2", "1", "3"],
  );
});

test("YoupGrid renders headers and rows", async () => {
  const app = createSSRApp({
    render: () =>
      h(YoupGrid, {
        rows,
        columns,
        getRowId: (row: User) => row.id,
      }),
  });

  const html = await renderToString(app);

  assert.match(html, /Name/);
  assert.match(html, /Age/);
  assert.match(html, /Kim/);
});

test("YoupGrid renders select labels and tag chips", async () => {
  type Task = {
    id: string;
    status: string;
    tags: string[];
  };
  const taskRows: Task[] = [
    { id: "1", status: "open", tags: ["priority", "review"] },
  ];
  const taskColumns: ColumnDef<Task>[] = [
    {
      field: "status",
      headerName: "Status",
      editor: "select",
      options: [
        { value: "open", label: "Open", color: "#2563eb", description: "Active item" },
        { value: "closed", label: "Closed", disabled: true },
      ],
    },
    {
      field: "tags",
      headerName: "Tags",
      editor: "tags",
      options: [
        { value: "priority", label: "Priority", color: "#dc2626" },
        { value: "review", label: "Review", color: "#d97706" },
      ],
    },
  ];
  const app = createSSRApp({
    render: () =>
      h(YoupGrid, {
        rows: taskRows,
        columns: taskColumns,
        getRowId: (row: Task) => row.id,
      }),
  });

  const html = await renderToString(app);

  assert.match(html, /youp-grid-vue__option-badge/);
  assert.match(html, /Open/);
  assert.match(html, /Active item/);
  assert.match(html, /youp-grid-vue__tag-list/);
  assert.match(html, /Priority/);
  assert.match(html, /Review/);
});

test("YoupGrid renders optional pagination footer", async () => {
  const app = createSSRApp({
    render: () =>
      h(YoupGrid, {
        rows,
        columns,
        getRowId: (row: User) => row.id,
        pagination: { pageSizeOptions: [2, 3] },
      }),
  });

  const html = await renderToString(app);

  assert.match(html, /aria-label="Pagination"/);
  assert.match(html, /1-2 \/ 3/);
  assert.match(html, /aria-label="Next page"/);
  assert.match(html, /Kim/);
  assert.doesNotMatch(html, /Park/);
});

test("YoupGrid applies locale text, variable row height, and wrapped cells", async () => {
  const localizedColumns: ColumnDef<User>[] = [
    { field: "name", headerName: "Name", wrapText: true, autoHeight: true },
  ];
  const app = createSSRApp({
    render: () =>
      h(YoupGrid, {
        rows,
        columns: localizedColumns,
        getRowId: (row: User) => row.id,
        getRowHeight: ({ rowIndex }: { rowIndex: number }) => rowIndex === 0 ? 64 : 40,
        localeText: { noRows: "데이터 없음" },
      }),
  });

  const html = await renderToString(app);

  assert.match(html, /min-height:64px/);
  assert.match(html, /youp-grid-vue__cell--wrap-text/);
  assert.match(html, /youp-grid-vue__cell--auto-height/);

  const emptyApp = createSSRApp({
    render: () => h(YoupGrid, { rows: [], columns: localizedColumns, localeText: { noRows: "데이터 없음" } }),
  });
  assert.match(await renderToString(emptyApp), /데이터 없음/);
});

test("YoupGrid renders optional row number and selection columns", async () => {
  const app = createSSRApp({
    render: () =>
      h(YoupGrid, {
        rows,
        columns,
        state: { selectedRowIds: ["2"] },
        getRowId: (row: User) => row.id,
        showRowNumberColumn: true,
        showRowSelectionColumn: true,
        pinRowSelectionColumn: true,
      }),
  });

  const html = await renderToString(app);

  assert.match(html, /aria-colcount="4"/);
  assert.match(html, /youp-grid-vue--row-number-column/);
  assert.match(html, /youp-grid-vue--selection-column-pinned/);
  assert.match(html, /aria-label="Row number"/);
  assert.match(html, /aria-label="Select visible rows"/);
  assert.match(html, /aria-checked="mixed"/);
  assert.match(html, /aria-label="Row 1"/);
  assert.match(html, /aria-label="Select row 2"/);
  assert.match(html, /youp-grid-vue__row--selected/);
});

test("YoupGrid renders expanded row detail slot", async () => {
  const app = createSSRApp({
    render: () =>
      h(
        YoupGrid,
        {
          rows,
          columns,
          getRowId: (row: User) => row.id,
          defaultExpandedDetailRowIds: ["2"],
        },
        {
          "row-detail": ({ row }: { row: User }) => h("div", `Detail ${row.name}`),
        },
      ),
  });

  const html = await renderToString(app);

  assert.match(html, /aria-label="Expand detail row"/);
  assert.match(html, /aria-label="Collapse detail row"/);
  assert.match(html, /Detail Lee/);
  assert.doesNotMatch(html, /Detail Kim/);
});

test("YoupGrid renders native cell meta titles", async () => {
  const app = createSSRApp({
    render: () =>
      h(YoupGrid, {
        rows,
        columns,
        getRowId: (row: User) => row.id,
        cellMeta: {
          "1:name": { status: "error", message: "Required" },
        },
      }),
  });

  const html = await renderToString(app);

  assert.match(html, /youp-grid-vue__cell-status--error/);
  assert.match(html, /title="Required"/);
});

test("YoupGrid renders a single rich tooltip for autoOpen cell meta", async () => {
  const app = createSSRApp({
    render: () =>
      h(YoupGrid, {
        rows,
        columns,
        getRowId: (row: User) => row.id,
        cellMeta: {
          "2:age": { status: "warning", message: "Check age" },
          "3:age": { status: "error", message: "Other issue" },
        },
        cellTooltip: {
          mode: "rich",
          autoOpenCellKey: "2:age",
          autoOpenDurationMs: 0,
        },
      }),
  });

  const html = await renderToString(app);

  assert.match(html, /role="tooltip"/);
  assert.match(html, /id="youp-grid-vue-cell-tooltip-2_age"/);
  assert.match(html, /Check age/);
  assert.doesNotMatch(html, /Other issue/);
});

test("YoupGrid disables checkbox editors when readOnly", async () => {
  const checkboxColumns: ColumnDef<User>[] = [
    { field: "name", headerName: "Name" },
    { field: "age", headerName: "Age", editor: "checkbox" },
  ];
  const editableApp = createSSRApp({
    render: () =>
      h(YoupGrid, {
        rows,
        columns: checkboxColumns,
        getRowId: (row: User) => row.id,
      }),
  });
  const readOnlyApp = createSSRApp({
    render: () =>
      h(YoupGrid, {
        rows,
        columns: checkboxColumns,
        getRowId: (row: User) => row.id,
        readOnly: true,
      }),
  });

  const editableHtml = await renderToString(editableApp);
  const readOnlyHtml = await renderToString(readOnlyApp);

  assert.doesNotMatch(editableHtml, /disabled/);
  assert.match(readOnlyHtml, /disabled/);
});
