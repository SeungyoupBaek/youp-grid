import { expect, test, type Page } from "@playwright/test";

const response = {
  actions: [
    { type: "setFilter", columnId: "status", operator: "equals", value: "Open" },
    { type: "setSort", columnId: "quantity", direction: "desc", multi: false },
  ],
  explanation: "Open trades sorted by quantity.",
};

async function openAi(page: Page, server = false) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Youp Grid", exact: true })).toBeVisible();
  await page.getByText("AI commands", { exact: true }).click();
  if (server) await page.getByLabel("AI provider mode").selectOption("server");
  await page.getByRole("textbox", { name: "AI 명령", exact: true }).fill("Open 거래만 보여주고 수량 높은 순으로 정렬해줘");
}

test("AI example commands filter and sort actual rows, hide columns, and recover", async ({ page }) => {
  await openAi(page);
  const panel = page.getByRole("form", { name: "AI 명령" });
  await panel.getByRole("button", { name: "적용", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("수량 내림차순");
  await expect(page.locator('[data-youp-row-index="0"][data-youp-column-id="status"]')).toHaveText("Open");
  const quantities = await page.locator('.youp-grid__row [data-youp-column-id="quantity"][data-youp-row-index]').evaluateAll((cells) =>
    cells.filter((cell) => !cell.closest(".youp-grid__pinned-rows"))
      .map((cell) => Number(cell.textContent?.replaceAll(",", ""))),
  );
  expect(quantities.length).toBeGreaterThan(1);
  expect(quantities).toEqual([...quantities].sort((a, b) => b - a));
  await panel.getByRole("textbox").fill("가격 컬럼 숨겨줘");
  await panel.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: /Price/ })).toHaveCount(0);
  await panel.getByRole("textbox").fill("필터와 정렬 해제하고 가격 컬럼 보여줘");
  await panel.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.getByRole("columnheader", { name: /Price/ })).toBeVisible();
  await expect(page.locator('[data-youp-row-index="0"][data-youp-column-id="status"]')).toHaveText("Rejected");
});

test("AI server receives metadata, rejects invalid output atomically, and allows retry", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/grid-ai", async (route) => {
    const request = route.request().postDataJSON();
    expect(request.context.columns.some((column: { id: string }) => column.id === "quantity")).toBe(true);
    expect(request.context.rows).toBeUndefined();
    expect(request.responseSchema.type).toBe("object");
    attempts += 1;
    await route.fulfill({ json: attempts === 1 ? { ...response, actions: [...response.actions, { type: "deleteRows", columnId: "status" }] } : response });
  });
  await openAi(page, true);
  const panel = page.getByRole("form", { name: "AI 명령" });
  await panel.getByRole("button", { name: "적용", exact: true }).click();
  await expect(panel.getByRole("alert")).toContainText("Unsupported AI action");
  await expect(page.locator('[data-youp-row-index="0"][data-youp-column-id="status"]')).toHaveText("Rejected");
  await panel.getByRole("button", { name: "적용", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText(response.explanation);
  await expect(page.locator('[data-youp-row-index="0"][data-youp-column-id="status"]')).toHaveText("Open");
});

test("AI does not overwrite a manual filter change made while awaiting the model", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/grid-ai", async (route) => { await gate; await route.fulfill({ json: response }); });
  await openAi(page, true);
  const panel = page.getByRole("form", { name: "AI 명령" });
  const request = page.waitForRequest("**/api/grid-ai");
  await panel.getByRole("button", { name: "적용", exact: true }).click();
  await request;
  await page.getByRole("textbox", { name: "Filter Symbol", exact: true }).fill("MSFT");
  release();
  await expect(panel.getByRole("alert")).toContainText("그리드가 변경");
  await expect(page.getByRole("textbox", { name: "Filter Symbol", exact: true })).toHaveValue("MSFT");
});

test("cancelling AI lets a later request complete without applying the cancelled response", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let attempts = 0;
  await page.route("**/api/grid-ai", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await gate;
      await route.fulfill({ json: { actions: [{ type: "setColumnHidden", columnId: "price", hidden: true }], explanation: "cancelled" } });
    } else await route.fulfill({ json: response });
  });
  await openAi(page, true);
  const panel = page.getByRole("form", { name: "AI 명령" });
  const request = page.waitForRequest("**/api/grid-ai");
  await panel.getByRole("button", { name: "적용", exact: true }).click();
  await request;
  await panel.getByRole("button", { name: "취소", exact: true }).click();
  await panel.getByRole("button", { name: "적용", exact: true }).click();
  await expect(panel.getByRole("status")).toHaveText(response.explanation);
  release();
  await expect(page.getByRole("columnheader", { name: /Price/ })).toBeVisible();
  await expect(panel.getByRole("status")).toHaveText(response.explanation);
});
