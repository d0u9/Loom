import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("category details show direct members and remove only the chosen membership", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await expect(page.getByRole("button", { name: localized["fixture.aa7084084271"] })).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const create = async (path: string, data: any) => {
    const response = await page.request.post("/api/v1" + path, {
      headers: { "x-csrf-token": csrf },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const parent = await create("/categories", {
    name: "Parent " + info.project.name,
    parentId: null,
  });
  const child = await create("/categories", {
    name: "Child " + info.project.name,
    parentId: null,
  });
  const outside = await create("/categories", {
    name: "Outside " + info.project.name,
    parentId: null,
  });
  const item = await create("/items", {
    name: "Member " + info.project.name,
    note: "",
    categoryIds: [parent.id, child.id, outside.id],
    requestId: crypto.randomUUID(),
  });
  const other = await create("/items", {
    name: "Extra " + info.project.name,
    note: "",
    categoryIds: [],
    requestId: crypto.randomUUID(),
  });
  await page.reload();
  await page.getByRole("link", { name: "Category", exact: true }).click();
  await page
    .locator(".page-header")
    .getByRole("button", { name: localized["List"], exact: true })
    .click();
  const parentRow = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: parent.name, exact: true }),
  });
  const titleBounds = await parentRow.getByRole("heading").boundingBox();
  const metaBounds = await parentRow
    .getByText(localized["Category"], { exact: true })
    .boundingBox();
  // List rows are single-line columns: meta sits to the right of the name.
  expect(metaBounds!.x).toBeGreaterThan(titleBounds!.x + titleBounds!.width);
  expect(
    Math.abs(
      metaBounds!.y +
        metaBounds!.height / 2 -
        (titleBounds!.y + titleBounds!.height / 2),
    ),
  ).toBeLessThan(2);
  await parentRow.getByRole("button", { name: localized["Edit"], exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: localized["fixture.2a9fc4c4bcc7"] }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: `test-results/${info.project.name}-category-index.png`,
    fullPage: true,
  });

  await page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: parent.name, exact: true }),
    })
    .getByRole("button", { name: localized["Open "] + parent.name, exact: true })
    .click();
  await expect(
    page
      .locator(".page-header")
      .getByRole("heading", { name: parent.name, exact: true }),
  ).toBeVisible();
  const member = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: item.name, exact: true }),
  });
  await expect(member).toHaveCount(1);
  await expect(
    member.getByRole("button", {
      name: localized["From "] + parent.name + localized[" Remove"],
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    member.getByRole("button", {
      name: localized["From "] + child.name + localized[" Remove"],
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    member.getByRole("button", { name: localized["fixture.c3a1a296eec7"] + item.name }),
  ).toHaveCount(0);
  await member
    .getByRole("button", { name: localized["Open "] + item.name, exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page.getByLabel(localized["Note"], { exact: true }).fill("Updated note");
  await page.getByRole("button", { name: localized["Save"], exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await member
    .getByRole("button", { name: localized["From "] + parent.name + localized[" Remove"], exact: true })
    .click();
  await expect(member).toHaveCount(0);
  let stored = await (await page.request.get("/api/v1/items")).json();
  stored = stored.find((i: any) => i.id === item.id);
  expect(stored.categoryIds.sort()).toEqual([child.id, outside.id].sort());
  await page
    .locator(".page-header")
    .getByRole("button", { name: localized["Add members"], exact: true })
    .click();
  await page
    .getByLabel(localized["fixture.96e7231a24a2"], { exact: true })
    .selectOption(other.id);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: localized["Add members"], exact: true })
    .click();
  await expect(page.getByLabel(localized["fixture.96e7231a24a2"], { exact: true })).toHaveValue(
    "",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: other.name, exact: true }),
  ).toBeVisible();
  await page
    .locator(".page-header")
    .getByRole("button", { name: localized["List"], exact: true })
    .click();
  await expect(page.locator(".records-list")).toHaveCount(1);
  await page.screenshot({
    path: `test-results/${info.project.name}-category-list.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
