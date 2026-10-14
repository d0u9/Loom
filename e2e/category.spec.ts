import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("category details show direct members and remove only the chosen membership", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByLabel(localized["Password"], { exact: true })
    .fill("loom-browser-password");
  await page
    .getByRole("button", { name: localized["Sign in"], exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: localized["New item"] }),
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
  const parent = await create("/categories", {
    name: "Parent " + info.project.name,
  });
  const child = await create("/categories", {
    name: "Child " + info.project.name,
  });
  const outside = await create("/categories", {
    name: "Outside " + info.project.name,
  });
  const item = await create("/items", {
    name: "Member " + info.project.name,
    note: "",
    categoryIds: [parent.id, child.id, outside.id],
    requestId: crypto.randomUUID(),
  });
  const egg = await create("/items", {
    name: localized["fixture.e9f5b71a472d"] + info.project.name,
    categoryIds: [],
    requestId: crypto.randomUUID(),
  });
  const other = await create("/items", {
    name: "Extra " + info.project.name,
    note: "",
    categoryIds: [],
    requestId: crypto.randomUUID(),
  });
  await page.goto("/categories");
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
  // Mobile folds card actions behind a more toggle.
  await parentRow
    .getByRole("button", { name: localized["Edit"], exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: localized["fixture.b46f0b9bd727"] }),
  ).toBeVisible();
  // Touch has no Escape: tapping the backdrop closes the Modal.
  if (info.project.name === "mobile") await page.mouse.click(4, 4);
  else await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${info.project.name}-category-index.png`,
    fullPage: true,
  });

  await page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: parent.name, exact: true }),
    })
    .getByRole("button", {
      name: localized["Open "] + parent.name,
      exact: true,
    })
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
    member.getByRole("button", {
      name: localized["fixture.c3a1a296eec7"] + item.name,
    }),
  ).toHaveCount(0);
  await member
    .getByRole("button", { name: localized["Open "] + item.name, exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page
    .getByLabel(localized["Note"], { exact: true })
    .fill("Updated note");
  await page
    .getByRole("button", { name: localized["Save"], exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(member.locator(".item-note")).toHaveText("Updated note");
  await expect(member.getByText(parent.name, { exact: true })).toHaveCount(0);
  await page
    .locator(".page-header")
    .getByRole("button", { name: localized["Cards"], exact: true })
    .click();
  const title = (await member.locator(".item-summary-name").boundingBox())!;
  // Mobile shows the folded actions toggle beside the title.
  const remove = (await member
    .locator(".record-actions button")
    .first()
    .boundingBox())!;
  if (info.project.name === "mobile") {
    expect(
      Math.abs(remove.y + remove.height / 2 - (title.y + title.height / 2)),
    ).toBeLessThan(4);
    const summary = (await member.locator(".item-summary").boundingBox())!;
    expect(summary.width).toBeGreaterThan(
      (await member.boundingBox())!.width - 40,
    );
  }
  await page.screenshot({
    path: `test-results/${info.project.name}-member-cards.png`,
    fullPage: true,
  });
  await member
    .getByRole("button", {
      name: localized["From "] + parent.name + localized[" Remove"],
      exact: true,
    })
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
    .getByLabel(localized["Add existing item"], { exact: true })
    .click();
  // The open list floats above the modal instead of being clipped by it.
  const list = page.getByRole("listbox", {
    name: localized["Add existing item"],
  });
  const box = (await list.boundingBox())!;
  expect(
    await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest("[role=listbox]"),
      [box.x + box.width / 2, box.y + box.height - 4],
    ),
  ).toBe(true);
  // Pinyin initials and syllables filter Chinese names: "jid" finds eggs.
  await page
    .getByRole("combobox", {
      name: localized["Add existing item"],
      exact: true,
    })
    .fill("jid");
  await expect(
    page.getByRole("option", { name: egg.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: other.name, exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", {
      name: localized["Add existing item"],
      exact: true,
    })
    .fill(other.name);
  await page.getByRole("option", { name: other.name, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: localized["Add members"], exact: true })
    .click();
  await expect(
    page.getByLabel(localized["Add existing item"], { exact: true }),
  ).toHaveValue("");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: other.name, exact: true }),
  ).toBeVisible();
  const openCreate = async () => {
    if (
      !(await page
        .getByRole("dialog", { name: localized["Add members"], exact: true })
        .count())
    )
      await page
        .locator(".page-header")
        .getByRole("button", { name: localized["Add members"], exact: true })
        .click();
    await page
      .getByRole("dialog", { name: localized["Add members"], exact: true })
      .getByRole("button", { name: localized["New item"], exact: true })
      .click();
  };
  await openCreate();
  const creation = page.locator("#new-category-item");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    creation.getByRole("checkbox", { name: parent.name, exact: true }),
  ).toBeChecked();
  await creation
    .getByLabel(localized["Name"], { exact: true })
    .fill(" " + item.name + " ");
  await expect(
    creation.getByText(
      localized[
        "An item with this name already exists. Select it to avoid creating a duplicate."
      ],
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  await expect(
    creation.getByRole("button", {
      name: localized["Create a separate item"],
      exact: true,
    }),
  ).toBeVisible();
  await creation
    .getByRole("button", {
      name: localized["Select existing item:"] + item.name,
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: localized["Add members"], exact: true })
    .click();
  const reused = (
    await (await page.request.get("/api/v1/items")).json()
  ).filter((i: any) => i.name === item.name);
  expect(reused).toHaveLength(1);
  expect(reused[0].id).toBe(item.id);
  expect(reused[0].note).toBe("Updated note");
  expect(reused[0].categoryIds.sort()).toEqual(
    [parent.id, child.id, outside.id].sort(),
  );
  await openCreate();
  await creation.getByLabel(localized["Name"], { exact: true }).fill(item.name);
  await expect(
    creation.getByRole("button", {
      name: localized["Already in this category:"] + item.name,
      exact: true,
    }),
  ).toBeDisabled();
  await creation
    .getByLabel(localized["Name"], { exact: true })
    .fill("Cancelled member");
  await creation
    .getByRole("button", { name: localized["Cancel"], exact: true })
    .click();
  expect(
    (await (await page.request.get("/api/v1/items")).json()).some(
      (i: any) => i.name === "Cancelled member",
    ),
  ).toBe(false);
  await openCreate();
  const newName = "New member " + info.project.name;
  await creation.getByLabel(localized["Name"], { exact: true }).fill(newName);
  await creation
    .getByLabel(localized["Note"], { exact: true })
    .fill("Created in category");
  const requests: any[] = [];
  await page.route("**/api/v1/items", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) {
      await route.fetch();
      await route.fulfill({
        status: 500,
        json: { message: "Temporary failure" },
      });
    } else await route.continue();
  });
  await creation
    .getByRole("button", { name: localized["Create and add"], exact: true })
    .click();
  await expect(creation.getByRole("alert")).toBeVisible();
  await expect(
    creation.getByLabel(localized["Name"], { exact: true }),
  ).toHaveValue(newName);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await creation
    .getByRole("button", { name: localized["Retry save"], exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    creation.getByLabel(localized["Name"], { exact: true }),
  ).toHaveValue("");
  await expect(
    creation.getByLabel(localized["Name"], { exact: true }),
  ).toBeFocused();
  await expect(
    creation.getByLabel(localized["Note"], { exact: true }),
  ).toHaveValue("");
  await expect(
    creation.getByRole("checkbox", { name: parent.name, exact: true }),
  ).toBeChecked();
  const secondName = "Another member " + info.project.name;
  await creation
    .getByLabel(localized["Name"], { exact: true })
    .fill(secondName);
  await creation
    .getByRole("button", { name: localized["Create and add"], exact: true })
    .click();
  await expect(
    creation.getByLabel(localized["Name"], { exact: true }),
  ).toHaveValue("");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await creation
    .getByRole("button", { name: localized["Cancel"], exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await (await page.request.get("/api/v1/items")).json()).find(
      (i: any) => i.name === secondName,
    ).categoryIds,
  ).toEqual([parent.id]);
  await expect(
    page.getByRole("heading", { name: newName, exact: true }),
  ).toBeVisible();
  const created = (await (await page.request.get("/api/v1/items")).json()).find(
    (i: any) => i.name === newName,
  );
  expect(requests).toHaveLength(3);
  expect(requests[1]).toEqual(requests[0]);
  expect(
    (await (await page.request.get("/api/v1/items")).json()).filter(
      (i: any) => i.name === newName,
    ),
  ).toHaveLength(1);
  expect(created.categoryIds).toEqual([parent.id]);
  expect(created.note).toBe("Created in category");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: newName, exact: true }),
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
