import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

for (const kind of ["template", "checklist"]) {
  test(`${kind} root entries stand apart and phone headings and items share compact height`, async ({
    page,
  }, info) => {
    await page.goto("/items");
    await page
      .getByLabel(localized["Password"], { exact: true })
      .fill("loom-browser-password");
    await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
    await expect(
      page.getByRole("button", { name: localized["New item"], exact: true }),
    ).toBeVisible();
    const csrf = (await (await page.request.get("/api/v1/session")).json())
      .csrf;
    const create = async (path: string, data: any) => {
      const response = await page.request.post("/api/v1" + path, {
        headers: { "x-csrf-token": csrf },
        data: { ...data, requestId: crypto.randomUUID() },
      });
      expect(response.ok()).toBe(true);
      return response.json();
    };
    const item = await create("/items", {
      name: "Root after empty",
      note: "Catalog note",
      categoryIds: [],
    });
    const parent = crypto.randomUUID(),
      child = crypto.randomUUID(),
      empty = crypto.randomUUID();
    const childName =
      "Child section with a long name that stays on a single line";
    const entries = [
      ["Root first", null],
      ["Root after section", null],
      ["Root after empty", null],
      ["Root consecutive", null],
      ["Parent item", parent],
      ["Child item", child],
    ].map(([name, sectionId]) => ({
      id: crypto.randomUUID(),
      name,
      sectionId,
      itemId: name === item.name ? item.id : null,
      quantity: "",
      unit: "",
      note: name === "Root consecutive" ? "Entry note" : "",
      checked: false,
    }));
    const d = await create("/documents", {
      kind,
      name: "Root layout " + kind,
      entries,
      sections: [
        {
          id: parent,
          name: "Parent",
          parentSectionId: null,
          afterEntryId: entries[0].id,
        },
        {
          id: child,
          name: childName,
          parentSectionId: parent,
          afterEntryId: null,
        },
        {
          id: empty,
          name: "Empty",
          parentSectionId: null,
          afterEntryId: entries[1].id,
        },
      ],
    });
    await page.goto(
      `/${kind === "template" ? "templates" : "checklists"}/${d.id}`,
    );
    if (kind === "checklist")
      await page.getByRole("button", { name: localized["Reading mode"], exact: true }).click();
    const row = (name: string) => page.getByLabel(name, { exact: true });
    const root = row("Root after section");
    await expect(root).toBeVisible();
    const radius = (
      await root.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--radius-lg"),
      )
    ).trim();
    for (const name of [
      "Root first",
      "Root after section",
      "Root after empty",
      "Root consecutive",
    ]) {
      const entry = row(name);
      await expect(entry).toHaveCSS("border-top-width", "1px");
      await expect(entry).toHaveCSS("border-bottom-width", "1px");
      await expect(entry).toHaveCSS("border-top-left-radius", radius);
      await expect(entry).toHaveCSS("border-bottom-left-radius", radius);
      if (name !== "Root first") {
        const gap = await entry.evaluate(
          (el) =>
            el.getBoundingClientRect().top -
            el.previousElementSibling!.getBoundingClientRect().bottom,
        );
        expect(gap).toBe(info.project.name === "mobile" ? 4 : 8);
      }
    }
    await expect(row("Parent item")).toHaveCSS(
      "border-bottom-left-radius",
      radius,
    );
    await expect(row(localized["fixture.7df5a6765bb5"])).toHaveCSS(
      "border-bottom-left-radius",
      radius,
    );
    await expect(row(localized["fixture.7df5a6765bb5"])).toHaveCSS(
      "margin-top",
      info.project.name === "mobile" ? "4px" : "8px",
    );
    const heights = () =>
      page
        .locator(".entries > .entry")
        .evaluateAll((nodes) =>
          nodes.map((el) => el.getBoundingClientRect().height),
        );
    if (info.project.name === "mobile") {
      expect(await heights()).toEqual(Array(9).fill(40));
      const background = await root.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      await root.tap();
      await expect(root).toHaveCSS("background-color", background);
      await expect(row("Root consecutive").locator(".entry-note")).toBeHidden();
    } else {
      expect((await row("Root first").boundingBox())!.height).toBe(52);
      expect((await row(localized["fixture.745a621953bf"]).boundingBox())!.height).toBe(58);
      expect((await row(localized["Section "] + childName).boundingBox())!.height).toBe(54);
    }
    if (kind === "checklist") {
      await page
        .getByRole("checkbox", { name: localized["fixture.b56d4875e85e"], exact: true })
        .check();
      await expect(
        page.getByRole("checkbox", {
          name: localized["fixture.b56d4875e85e"],
          exact: true,
        }),
      ).toBeChecked();
    }
    await page.screenshot({
      path: `test-results/${kind}-${info.project.name}-root-rows.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: localized["Edit mode"], exact: true }).click();
    await expect(
      page.getByRole("button", { name: localized["fixture.0a38d28ad5cc"], exact: true }),
    ).toBeVisible();
    if (info.project.name === "mobile")
      expect(await heights()).toEqual(Array(9).fill(40));
    expect(
      (
        await (await page.request.get("/api/v1/documents/" + d.id)).json()
      ).entries.find((e: any) => e.name === "Root consecutive").note,
    ).toBe("Entry note");
  });
}
