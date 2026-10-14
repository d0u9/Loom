import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

for (const kind of ["template", "checklist"]) {
  test(`${kind} queues edits during saving and flushes before leaving`, async ({
    page,
  }) => {
    await page.goto("/items");
    await page
      .getByLabel(localized["Password"], { exact: true })
      .fill("loom-browser-password");
    await page
      .getByRole("button", { name: localized["Sign in"], exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: localized["New item"] }),
    ).toBeVisible();
    const csrf = (await (await page.request.get("/api/v1/session")).json())
      .csrf;
    const created = await page.request.post("/api/v1/documents", {
      headers: { "x-csrf-token": csrf },
      data: {
        kind,
        name: "Autosave",
        entries: [],
        requestId: crypto.randomUUID(),
      },
    });
    expect(created.ok()).toBe(true);
    const doc = await created.json();
    await page.goto(`/${kind}s/${doc.id}`);
    await expect(
      page.getByRole("button", {
        name: localized["Done editing"],
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: localized["Add entries"], exact: true }),
    ).toHaveCount(0);
    if (kind === "checklist")
      await expect(
        page.getByRole("button", {
          name: localized["Hide completed"],
          exact: true,
        }),
      ).toHaveAttribute("title", localized["Hide completed"]);

    await page
      .getByRole("button", { name: localized["Edit mode"], exact: true })
      .click();
    await expect(
      page
        .locator(".page-header")
        .getByRole("button", { name: localized["Save"], exact: true }),
    ).toHaveCount(0);
    const header = page.locator(".page-header");
    const editActions = ["New section", "Add entries", "Done editing"] as const;
    for (const label of editActions)
      await expect(
        header.getByRole("button", { name: localized[label], exact: true }),
      ).toBeVisible();
    expect(
      await header
        .locator(".page-actions button")
        .evaluateAll((buttons) =>
          buttons.slice(-3).map((button) => button.getAttribute("aria-label")),
        ),
    ).toEqual(editActions.map((label) => localized[label]));
    const done = header.getByRole("button", {
      name: localized["Done editing"],
      exact: true,
    });
    await done.focus();
    await done.press("Enter");
    for (const label of editActions)
      await expect(
        header.getByRole("button", { name: localized[label], exact: true }),
      ).toHaveCount(0);
    await header
      .getByRole("button", { name: localized["Edit mode"], exact: true })
      .click();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const writes: any[] = [];
    await page.route(`**/api/v1/documents/${doc.id}`, async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      writes.push(route.request().postDataJSON());
      if (writes.length === 1) {
        const saved = await route.fetch();
        await gate;
        return route.fulfill({ response: saved });
      }
      return route.continue();
    });
    const quick = page.getByLabel(localized["New temporary entry"], {
      exact: true,
    });
    await quick.fill("First");
    await quick.press("Enter");
    await expect.poll(() => writes.length).toBe(1);
    await quick.fill("Second");
    await quick.press("Enter");
    await page
      .getByRole("link", { name: localized["Item"], exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${kind}s/${doc.id}`));
    release();
    await expect(page).toHaveURL(/\/items$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const saved = await (
      await page.request.get(`/api/v1/documents/${doc.id}`)
    ).json();
    expect(saved.entries.map((e: any) => e.name)).toEqual(["First", "Second"]);
    expect(writes).toHaveLength(2);
    expect(writes[1].version).toBe(writes[0].version + 1);
    expect(writes[1].requestId).not.toBe(writes[0].requestId);
    await page.goto(`/${kind}s/${doc.id}`);
    await expect(page.getByLabel("First", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Second", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: localized["More actions"], exact: true })
      .click();
    await page
      .getByLabel(localized["Name"], { exact: true })
      .fill("Renamed automatically");
    await page.getByRole("dialog").getByRole("heading").click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/api/v1/documents/${doc.id}`)).json())
            .name,
      )
      .toBe("Renamed automatically");
    await page.unroute(`**/api/v1/documents/${doc.id}`);
    const retries: any[] = [];
    await page.route(`**/api/v1/documents/${doc.id}`, async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      retries.push(route.request().postDataJSON());
      if (retries.length === 1)
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Save unavailable" }),
        });
      return route.continue();
    });
    await page
      .getByLabel(localized["Name"], { exact: true })
      .fill("Failed name");
    await expect(page.getByRole("alert")).toContainText(
      localized["fixture.bb87c5f2cdbf"],
    );
    await page
      .getByLabel(localized["Name"], { exact: true })
      .fill("Latest name");
    await page.keyboard.press("Escape");
    await page
      .getByRole("alert")
      .getByRole("button", { name: localized["Retry save"], exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await (await page.request.get(`/api/v1/documents/${doc.id}`)).json())
            .name,
      )
      .toBe("Latest name");
    expect(retries).toHaveLength(3);
    expect(retries[1]).toEqual(retries[0]);
    expect(retries[2].name).toBe("Latest name");
    expect(retries[2].version).toBe(retries[1].version + 1);
    if (kind === "template") {
      await page
        .getByRole("button", { name: localized["More actions"], exact: true })
        .click();
      await page
        .getByLabel(localized["Name"], { exact: true })
        .fill("Instantiate latest");
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", {
          name: localized["Create checklist"],
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name: localized["Confirm / Retry"],
          exact: true,
        })
        .click();
      await expect
        .poll(async () =>
          (await (await page.request.get("/api/v1/documents")).json()).some(
            (d: any) =>
              d.kind === "checklist" && d.name === "Instantiate latest",
          ),
        )
        .toBe(true);
    }
  });
}
