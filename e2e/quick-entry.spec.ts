import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("blank quick entry confirms on Enter and Checklist rename saves immediately", async ({
  page,
}, info) => {
  await page.goto("/checklists");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await expect(
    page.getByRole("button", { name: localized["fixture.9502ae5b9eb9"], exact: true }),
  ).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const section = crypto.randomUUID(),
    child = crypto.randomUUID();
  const create = async (kind: string) => {
    const r = await page.request.post("/api/v1/documents", {
      headers: { "x-csrf-token": csrf },
      data: {
        kind,
        name: "Quick " + kind + info.project.name,
        entries: [],
        groups: [],
        sections: [
          { id: section, name: "Parent", parentSectionId: null },
          { id: child, name: "Child", parentSectionId: section },
        ],
        requestId: crypto.randomUUID(),
      },
    });
    expect(r.ok()).toBe(true);
    return r.json();
  };
  for (const kind of ["checklist", "template"]) {
    const d = await create(kind);
    await page.goto(
      "/" + (kind === "template" ? "templates" : "checklists") + "/" + d.id,
    );
    const quick = page.getByLabel(localized["New temporary entry"], { exact: true });
    await expect(quick).toBeVisible();
    if (kind === "checklist") {
      const mode = page.getByRole("button", { name: new RegExp(localized["fixture.8ff72e270b7e"], "") });
      await expect(mode).toHaveAttribute("aria-pressed", "false");
      await expect(mode.locator("svg.lucide-list-checks")).toHaveCount(1);
      const inactive = await mode.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      await mode.click();
      await expect(mode).toHaveAttribute("aria-pressed", "true");
      await expect(mode.locator("svg.lucide-pencil")).toHaveCount(1);
      await expect(quick).toBeHidden();
      const active = await mode.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      );
      expect(active).not.toBe(inactive);
      if (info.project.name === "desktop") {
        await mode.hover();
        await expect(mode).toHaveCSS("background-color", active);
      }
      await mode.click();
      await expect(mode).toHaveAttribute("aria-pressed", "false");
      await expect(quick).toBeVisible();
    }
    await quick.press("Enter");
    await expect(page.getByLabel(localized["Entry name"], { exact: true })).toHaveCount(0);
    await quick.fill("First");
    await quick.press("Enter");
    await expect(quick).toHaveValue("");
    await expect(quick).toBeFocused();
    await expect(page.getByLabel(localized["Entry name"], { exact: true })).toHaveText(
      "First",
    );
    await expect(
      page.getByRole("button", { name: localized["fixture.d2774989deec"], exact: true }),
    ).toHaveCount(0);
    if (kind === "template")
      await page
        .getByRole("button", { name: localized["Save revision"], exact: true })
        .click();
    await expect(page.getByRole("status")).toContainText(localized["Saved"]);
    await page.getByRole("button", { name: localized["Entry name"], exact: true }).click();
    const input = page.getByLabel(localized["Entry name"], { exact: true });
    await input.fill("Renamed");
    await input.press("Enter");
    await expect(page.locator(localized["fixture.5c1684296f6f"])).toHaveCount(0);
    if (kind === "template")
      await page
        .getByRole("button", { name: localized["Save revision"], exact: true })
        .click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get("/api/v1/documents/" + d.id)).json())
            .entries[0].name,
      )
      .toBe("Renamed");
    for (const [name, sectionId] of [
      ["Parent", d.sections.find((s: any) => s.name === "Parent").id],
      ["Child", d.sections.find((s: any) => s.name === "Child").id],
    ]) {
      const nested = page.getByLabel(localized["New temporary entry · "] + name, { exact: true });
      await nested.fill("In " + name);
      await nested.press("Enter");
      await expect(nested).toHaveValue("");
      await expect(nested).toBeFocused();
      await expect(page.locator(".section-heading")).toHaveCount(2);
      await expect(page.locator(".section-heading strong")).toHaveText([
        "Parent",
        "Child",
      ]);
      await nested.fill("Again " + name);
      await nested.press("Enter");
      await expect(page.locator(".section-heading")).toHaveCount(2);
      await expect(page.locator(".section-heading strong")).toHaveText([
        "Parent",
        "Child",
      ]);
      if (kind === "template")
        await page
          .getByRole("button", { name: localized["Save revision"], exact: true })
          .click();
      await expect
        .poll(
          async () =>
            (
              await (await page.request.get("/api/v1/documents/" + d.id)).json()
            ).entries.find((e: any) => e.name === "In " + name)?.sectionId,
        )
        .toBe(sectionId);
    }
    if (kind === "checklist") {
      await page
        .getByRole("checkbox", { name: localized["fixture.8ab55a915a40"], exact: true })
        .check();
      await expect(page.locator(".entry[data-sort-id]").last()).toHaveAttribute(
        "aria-label",
        "Renamed",
      );
      await page
        .getByRole("button", { name: localized["Hide completed"], exact: true })
        .click();
      await expect(
        page.getByRole("checkbox", { name: localized["fixture.8ab55a915a40"], exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByLabel(localized["New temporary entry"], { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: localized["Show completed"], exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page
          .getByRole("button", { name: localized["Show completed"], exact: true })
          .locator("svg.lucide-list-filter"),
      ).toHaveCount(1);
      await page
        .getByRole("button", { name: localized["Show completed"], exact: true })
        .click();
      await expect(
        page.getByRole("checkbox", { name: localized["fixture.8ab55a915a40"], exact: true }),
      ).toBeChecked();
    }
    await expect(
      page.getByRole("button", { name: localized["fixture.82d440e5f3ee"], exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await expect(
      page
        .getByLabel(localized["Entry name"], { exact: true })
        .filter({ hasText: "Renamed" }),
    ).toHaveText("Renamed");
  }
});
