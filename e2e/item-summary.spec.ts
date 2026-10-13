import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("Item content is shared by catalog, category, template and checklist", async ({
  page,
}, info) => {
  await page.goto("/items");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await expect(page.getByRole("button", { name: localized["New item"] })).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const post = async (path: string, data: any) => {
    const response = await page.request.post("/api/v1" + path, {
      headers: { "x-csrf-token": csrf },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  };
  const category = await post("/categories", {
    name: "Shared category " + info.project.name,
  });
  const item = await post("/items", {
    name: localized["fixture.51831da53ee3"] + info.project.name,
    note: localized["fixture.39fc170c2594"] + info.project.name,
    itemGroup: "Shared group",
    categoryIds: [category.id],
    requestId: crypto.randomUUID(),
  });
  const docs = [];
  for (const kind of ["template", "checklist"])
    docs.push(
      await post("/documents", {
        kind,
        name: "Shared " + kind,
        groups: [],
        entries: [
          {
            id: crypto.randomUUID(),
            itemId: item.id,
            name: item.name,
            quantity: "2",
            unit: localized["fixture.0066134b36c4"],
            note: "Entry note",
            checked: false,
            direct: true,
            groupIds: [],
          },
        ],
        requestId: crypto.randomUUID(),
      }),
    );
  for (const path of [
    "/items",
    "/categories/" + category.id,
    "/templates/" + docs[0].id,
    "/checklists/" + docs[1].id,
  ]) {
    await page.goto(path);
    const summary = page.locator(".item-summary").filter({
      has: page.getByText(localized["fixture.39fc170c2594"] + info.project.name, { exact: true }),
    });
    await expect(summary).toHaveCount(1);
    await expect(summary.locator(".item-group-tag")).toHaveText("Shared group");
    await expect(summary.locator(".item-group-tag svg")).toHaveCount(1);
    await expect(summary.locator(".item-group-tag")).toHaveAttribute(
      "aria-label",
      localized["fixture.374433a4bad7"],
    );
    expect(
      await summary
        .locator(".item-note")
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe("12px");
    // One Item name size everywhere: catalog, members and document entries.
    expect(
      await summary
        .locator("h3, .name")
        .first()
        .evaluate((el) => getComputedStyle(el).fontSize),
    ).toBe(
      // Desktop document entries follow the section hierarchy style.
      /^\/(templates|checklists)\//.test(path) &&
        page.viewportSize()!.width >= 651
        ? "14px"
        : "13px",
    );
    if (path.startsWith("/templates/") || path.startsWith("/checklists/")) {
      await expect(summary.getByLabel(localized["Entry name"])).toHaveValue(item.name);
      await expect(summary.locator(".entry-note")).toHaveText("Entry note");
      await expect(page.getByLabel("quantity", { exact: true })).toHaveCount(0);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
