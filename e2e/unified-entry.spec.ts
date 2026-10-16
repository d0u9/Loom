import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

for (const kind of ["template", "checklist"]) {
  test(`${kind} adds existing, temporary, and new catalog entries from one name input`, async ({
    page,
  }, info) => {
    await page.goto("/items");
    await page
      .getByLabel(localized["Password"], { exact: true })
      .fill("loom-browser-password");
    await page
      .getByRole("button", { name: localized["Sign in"], exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: localized["New item"], exact: true }),
    ).toBeVisible();
    const csrf = (await (await page.request.get("/api/v1/session")).json())
      .csrf;
    const create = async (path: string, body: any) => {
      const response = await page.request.post("/api/v1" + path, {
        headers: { "x-csrf-token": csrf },
        data: { ...body, requestId: crypto.randomUUID() },
      });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const item = await create("/items", {
      name:
        localized["fixture.ca07603061d0"] +
        " unified " +
        kind +
        info.project.name,
      note: "Catalog note",
      itemGroup: "Food",
      categoryIds: [],
    });
    const doc = await create("/documents", {
      kind,
      name: "Unified " + kind + info.project.name,
      sections: [
        { id: crypto.randomUUID(), name: "Target", parentSectionId: null },
      ],
      entries: [
        {
          id: crypto.randomUUID(),
          itemId: item.id,
          name: item.name,
          quantity: "2",
          unit: "boxes",
          note: "Keep this note",
          ...(kind === "checklist" ? { checked: true } : {}),
        },
      ],
    });
    const sectionId = doc.sections[0].id;
    const catalog = await (await page.request.get("/api/v1/items")).json();
    const saved = async () =>
      await (await page.request.get("/api/v1/documents/" + doc.id)).json();
    await page.goto(`/${kind}s/${doc.id}`);
    await page
      .getByRole("button", { name: localized["Edit mode"], exact: true })
      .click();
    const quick = page.getByLabel(localized["New entry · "] + "Target", {
      exact: true,
    });
    await page
      .getByRole("button", { name: localized["Add entries"], exact: true })
      .click();
    const picker = page.getByRole("dialog", {
      name: localized["Add entries"],
      exact: true,
    });
    const search = picker.getByLabel(localized["Search "] + localized["Item"], {
      exact: true,
    });
    await expect(search).toBeFocused();
    const section = picker.getByRole("combobox", {
      name: localized["Add to section"],
      exact: true,
    });
    await section.fill("Target");
    await section.press("Enter");
    await search.fill("jid");
    await picker.getByRole("button", { name: item.name, exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(search).toBeFocused();
    expect((await saved()).entries).toEqual(doc.entries);
    await picker
      .getByRole("button", { name: localized["Done"], exact: true })
      .click();
    await quick.fill(item.name);
    await quick.press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(quick).toHaveValue("");
    await expect(quick).toBeFocused();
    await expect.poll(async () => (await saved()).entries.length).toBe(2);
    let entries = (await saved()).entries;
    expect(entries.find((e: any) => e.itemId === item.id)).toEqual(
      doc.entries[0],
    );
    expect(entries.find((e: any) => !e.itemId)).toMatchObject({
      name: item.name,
      sectionId,
    });
    expect(await (await page.request.get("/api/v1/items")).json()).toEqual(
      catalog,
    );
    await page
      .getByRole("button", { name: localized["Add entries"], exact: true })
      .click();
    const newName = "New travel item " + kind + info.project.name;
    await search.fill(newName);
    await page.screenshot({
      path: info.outputPath("unified-entry-dialog.png"),
      fullPage: true,
    });
    await picker
      .getByRole("button", {
        name: localized["Create item and add"],
        exact: true,
      })
      .click();
    const form = page.getByRole("dialog", {
      name: localized["New item"],
      exact: true,
    });
    await expect(
      form.getByLabel(localized["Name"], { exact: true }),
    ).toHaveValue(newName);
    await form
      .getByLabel(localized["Note"], { exact: true })
      .fill("New catalog note");
    let failed = false;
    await page.route(`**/api/v1/documents/${doc.id}`, async (route) => {
      if (route.request().method() === "PUT" && !failed) {
        failed = true;
        return route.fulfill({
          status: 503,
          json: { message: "Temporary failure" },
        });
      }
      return route.continue();
    });
    await form
      .getByRole("button", { name: localized["Create and add"], exact: true })
      .click();
    await expect(
      form.getByLabel(localized["Name"], { exact: true }),
    ).toHaveValue("");
    await form
      .getByRole("button", { name: localized["Cancel"], exact: true })
      .click();
    await picker
      .getByRole("button", { name: localized["Done"], exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page
      .getByRole("button", { name: localized["Retry save"], exact: true })
      .click();
    await expect.poll(async () => (await saved()).entries.length).toBe(3);
    const created = (
      await (await page.request.get("/api/v1/items")).json()
    ).filter((i: any) => i.name === newName);
    expect(created).toHaveLength(1);
    expect(created[0].note).toBe("New catalog note");
    entries = (await saved()).entries;
    expect(entries.find((e: any) => e.itemId === created[0].id)).toMatchObject({
      sectionId,
    });
    await quick.fill("jid");
    await expect(
      page.getByRole("option", { name: item.name, exact: true }),
    ).toBeVisible();
    await quick.fill(item.name);
    await quick.press("ArrowUp");
    await expect(
      page.getByRole("option", { name: item.name, exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(1);
    await quick.press("Enter");
    await expect(quick).toHaveValue("");
    expect((await saved()).entries).toEqual(entries);
    const row = page.locator(".quick-entry").filter({ has: quick });
    const inlineName = "Inline catalog " + kind + info.project.name;
    await row
      .getByRole("checkbox", {
        name: localized["Save to item catalog"],
        exact: true,
      })
      .check();
    await quick.fill(inlineName);
    const requests: any[] = [];
    await page.route("**/api/v1/items", async (route) => {
      if (route.request().method() === "POST") {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) {
          await route.fetch();
          return route.fulfill({
            status: 503,
            json: { message: "Temporary failure" },
          });
        }
      }
      return route.continue();
    });
    await quick.press("Enter");
    await expect(row.getByRole("alert")).toBeVisible();
    await expect(quick).toHaveValue(inlineName);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await row
      .getByRole("button", { name: localized["Retry save"], exact: true })
      .click();
    await expect(quick).toHaveValue("");
    await expect(quick).toBeFocused();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    await expect.poll(async () => (await saved()).entries.length).toBe(4);
    const inlineItems = (
      await (await page.request.get("/api/v1/items")).json()
    ).filter((i: any) => i.name === inlineName);
    expect(inlineItems).toHaveLength(1);
    entries = (await saved()).entries;
    expect(
      entries.find((e: any) => e.itemId === inlineItems[0].id),
    ).toMatchObject({ sectionId });
    await page.reload();
    expect((await saved()).entries).toEqual(entries);

    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      await page.locator("body").evaluate((el) => el.clientWidth),
    );
    await page.screenshot({
      path: info.outputPath("unified-entry.png"),
      fullPage: true,
    });
  });
}
