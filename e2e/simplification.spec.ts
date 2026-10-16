import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("template saves replace current content without revisions and history defaults to temporary entries", async ({
  page,
}, info) => {
  await page.goto("/templates");
  await page
    .getByLabel(localized["Password"], { exact: true })
    .fill("loom-browser-password");
  await page
    .getByRole("button", { name: localized["Sign in"], exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: localized["fixture.8b6c722cd24d"],
      exact: true,
    }),
  ).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const item = await (
    await page.request.post("/api/v1/items", {
      headers: { "x-csrf-token": csrf },
      data: {
        name: "Reusable " + info.project.name,
        categoryIds: [],
        requestId: crypto.randomUUID(),
      },
    })
  ).json();
  expect(item).toHaveProperty("id");
  await page
    .getByRole("button", {
      name: localized["fixture.8b6c722cd24d"],
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel(localized["Name"], { exact: true })
    .fill("Simple " + info.project.name);
  await page
    .getByRole("button", { name: localized["Create"], exact: true })
    .click();
  await expect(page).toHaveURL(/\/templates\/[\w-]+$/);
  const create = page.getByRole("button", {
    name: localized["Create checklist"],
    exact: true,
  });
  await expect(create).toHaveCount(0);
  await page
    .getByRole("button", { name: localized["Done editing"], exact: true })
    .click();
  await expect(create).toBeEnabled();
  for (const name of ["First", "Second"]) {
    await page
      .getByRole("button", { name: localized["Edit mode"], exact: true })
      .click();
    await page.getByLabel(localized["New entry"], { exact: true }).fill(name);
    await page
      .getByLabel(localized["New entry"], { exact: true })
      .press("Enter");
    await expect(create).toHaveCount(0);
    await page
      .getByRole("button", { name: localized["Done editing"], exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(localized["Saved"]);
    await expect(create).toBeEnabled();
  }
  await page
    .getByRole("button", { name: localized["More actions"], exact: true })
    .click();
  await expect(page.getByLabel("Revision", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await create.click();
  await page
    .getByRole("button", { name: localized["Confirm / Retry"], exact: true })
    .click();
  const list = (
    await (await page.request.get("/api/v1/documents")).json()
  ).find(
    (d: any) =>
      d.kind === "checklist" && d.name === "Simple " + info.project.name,
  );
  const content = await (
    await page.request.get(`/api/v1/documents/${list.id}`)
  ).json();
  expect(content.entries.map((e: any) => e.name)).toEqual(["First", "Second"]);
  expect(content.source.revision).toBeUndefined();
  // A deleted shared identity in an archived checklist restores without a mandatory choice.
  const d = await (
    await page.request.post("/api/v1/documents", {
      headers: { "x-csrf-token": csrf },
      data: {
        kind: "checklist",
        name: "Restore " + info.project.name,
        entries: [
          {
            id: crypto.randomUUID(),
            itemId: item.id,
            name: item.name,
            quantity: "",
            unit: "",
            note: "keep",
            checked: false,
          },
        ],
        requestId: crypto.randomUUID(),
      },
    })
  ).json();
  expect(d).toHaveProperty("id");
  const archiveResponse = await page.request.post(
    `/api/v1/checklists/${d.id}/archive`,
    {
      headers: { "x-csrf-token": csrf },
      data: { version: d.version, requestId: crypto.randomUUID() },
    },
  );
  expect(archiveResponse.ok()).toBe(true);
  const deleteResponse = await page.request.delete(`/api/v1/items/${item.id}`, {
    headers: { "x-csrf-token": csrf },
    data: { version: item.version },
  });
  expect(deleteResponse.ok()).toBe(true);
  await page.goto(`/checklists/${d.id}`);
  await page
    .getByRole("button", { name: localized["More actions"], exact: true })
    .click();
  await page
    .getByRole("button", { name: localized["Restore archive"], exact: true })
    .click();
  await expect(
    page.getByText(
      localized[
        "Deleted items will be kept as temporary entries. Their content is preserved."
      ],
    ),
  ).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("combobox")).toHaveCount(0);
  await page
    .getByRole("button", { name: localized["Confirm / Retry"], exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const restored = await (
    await page.request.get(`/api/v1/documents/${d.id}`)
  ).json();
  expect(restored.entries[0]).toMatchObject({
    itemId: null,
    name: item.name,
    note: "keep",
  });
});
