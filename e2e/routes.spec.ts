import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("resource URLs restore details, date filters and browser history", async ({
  page,
}, info) => {
  await page.goto("/templates");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(
    page.getByRole("button", { name: localized["fixture.7d56750df596"] }),
  ).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const create = async (path: string, data: any) => {
    const response = await page.request.post("/api/v1" + path, {
      headers: { "x-csrf-token": csrf },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const category = await create("/categories", {
    name: "URL category " + info.project.name,
    parentId: null,
  });
  const item = await create("/items", {
    name: "URL item " + info.project.name,
    note: "",
    categoryIds: [category.id],
    requestId: crypto.randomUUID(),
  });
  const template = await create("/documents", {
    kind: "template",
    name: "URL template " + info.project.name,
    entries: [],
    groups: [],
    requestId: crypto.randomUUID(),
  });
  const checklist = await create("/documents", {
    kind: "checklist",
    name: "URL checklist " + info.project.name,
    useDate: "2027-02-15",
    entries: [],
    groups: [],
    requestId: crypto.randomUUID(),
  });

  for (const [path, name] of [
    ["categories", category.name],
    ["templates", template.name],
    ["checklists", checklist.name],
  ] as const) {
    const resource =
      path === "categories"
        ? category
        : path === "templates"
          ? template
          : checklist;
    await page.goto("/" + path);
    await page
      .getByRole("button", { name: localized["Open "] + name, exact: true })
      .click();
    await expect(page).toHaveURL(
      new RegExp("/" + path + "/" + resource.id + "$"),
    );
    await page.reload();
    await expect(
      page.locator(".page-header").getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel(localized["Password"], { exact: true })).toHaveCount(0);
  }
  await page.goto("/items/" + item.id);
  await expect(
    page
      .getByRole("dialog", { name: localized["fixture.bba3a4dd9b5b"] })
      .getByLabel(localized["Name"], { exact: true }),
  ).toHaveValue(item.name);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/items$/);
  await page.getByRole("link", { name: "Category", exact: true }).click();
  await expect(page).toHaveURL(/\/categories$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/items$/);
  await expect(page.locator(".page-header h2")).toHaveText("Item");
  await page.goForward();
  await expect(page.locator(".page-header h2")).toHaveText("Category");
  const popupPromise = page.context().waitForEvent("page");
  await page
    .getByRole("link", { name: "Item", exact: true })
    .click({ modifiers: ["ControlOrMeta"] });
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/\/items$/);
  await expect(
    popup.getByRole("button", { name: localized["fixture.aa7084084271"], exact: true }),
  ).toBeVisible();
  await popup.close();
  await expect(page).toHaveURL(/\/categories$/);

  await page.goto("/checklists?date=2027-02-15");
  await expect(
    page.getByRole("button", { name: localized["Open "] + checklist.name, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Checklist", exact: true }).click();
  await expect(page).toHaveURL(/\/checklists$/);

  await page.goto("/templates");
  await page
    .getByRole("button", { name: localized["Open "] + template.name, exact: true })
    .click();
  await page.getByRole("button", { name: localized["More actions"] }).click();
  await page.getByLabel(localized["Name"], { exact: true }).fill("Unsaved name");
  await page.keyboard.press("Escape");
  await page.goBack();
  // The leave prompt is the app's own Modal, not window.confirm.
  const leaveDialog = page.getByRole("dialog", {
    name: localized["Discard pending changes and leave?"],
  });
  await leaveDialog.getByRole("button", { name: localized["Cancel"] }).click();
  await expect(page).toHaveURL(new RegExp("/templates/" + template.id + "$"));
  await expect(page.locator(".page-header h2")).toHaveText("Unsaved name");
  await page.goBack();
  await leaveDialog.getByRole("button", { name: localized["Discard and leave"] }).click();
  await expect(page).toHaveURL(/\/templates$/);
  await expect(
    page.getByRole("button", { name: localized["fixture.7d56750df596"] }),
  ).toBeVisible();
  const missingApi = await page.request.get("/api/v1/no-such-route");
  expect(missingApi.status()).toBe(404);
  expect(missingApi.headers()["content-type"]).toContain("application/json");
});
