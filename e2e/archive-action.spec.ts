import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

for (const view of ["List", "Cards"] as const) {
  test(`${view} checklist archive action preserves content and retries safely`, async ({
    page,
  }, info) => {
    await page.goto("/checklists");
    await page
      .getByLabel(localized["Password"], { exact: true })
      .fill("loom-browser-password");
    await page
      .getByRole("button", { name: localized["Sign in"], exact: true })
      .click();
    await expect(page.getByRole("searchbox")).toBeVisible();
    const csrf = (await (await page.request.get("/api/v1/session")).json())
      .csrf;
    const name = `Archive action ${view} ${info.project.name}`;
    const response = await page.request.post("/api/v1/documents", {
      headers: { "x-csrf-token": csrf },
      data: {
        kind: "checklist",
        name,
        useDate: "2027-03-12",
        entries: [
          {
            id: crypto.randomUUID(),
            itemId: null,
            name: "Keep me",
            note: "Keep note",
            quantity: "",
            unit: "",
            checked: true,
          },
        ],
        requestId: crypto.randomUUID(),
      },
    });
    expect(response.ok()).toBe(true);
    const doc = await response.json();
    await page.reload();
    await page
      .getByRole("button", { name: localized[view], exact: true })
      .click();
    await page.getByRole("searchbox").fill(name);
    const record = page
      .getByRole("article")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
    const button = record.getByRole("button", {
      name: localized["Archive"],
      exact: true,
    });
    await expect(button).toBeVisible();
    await expect(button.locator("svg.lucide-archive")).toHaveCount(1);
    const requests: any[] = [];
    await page.route(
      `**/api/v1/checklists/${doc.id}/archive`,
      async (route) => {
        requests.push(route.request().postDataJSON());
        if (requests.length === 1) {
          await route.fetch();
          return route.abort();
        }
        return route.continue();
      },
    );
    await button.focus();
    await button.press("Enter");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(page).toHaveURL(/\/checklists$/);
    await button.click();
    await expect(record).toHaveCount(0);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    await page
      .getByRole("group", { name: localized["Checklist status"], exact: true })
      .getByRole("button", { name: localized["Archived"], exact: true })
      .click();
    await expect(record).toBeVisible();
    await expect(button).toHaveCount(0);
    const activate = record.getByRole("button", {
      name: localized["Activate"],
      exact: true,
    });
    await expect(activate.locator("svg.lucide-archive-restore")).toHaveCount(1);
    const archived = await (
      await page.request.get(`/api/v1/documents/${doc.id}`)
    ).json();
    expect(archived.status).toBe("archived");
    expect(archived.useDate).toBe("2027-03-12");
    expect(archived.entries).toEqual(doc.entries);
    await activate.click();
    await expect(record).toHaveCount(0);
    await page
      .getByRole("group", { name: localized["Checklist status"], exact: true })
      .getByRole("button", { name: localized["Active"], exact: true })
      .click();
    await expect(record).toBeVisible();
    await expect(button).toBeVisible();
    const restored = await (
      await page.request.get(`/api/v1/documents/${doc.id}`)
    ).json();
    expect(restored.status).toBe("active");
    expect(restored.useDate).toBe(doc.useDate);
    expect(restored.entries.map(({ id, ...entry }: any) => entry)).toEqual(
      doc.entries.map(({ id, ...entry }: any) => entry),
    );
  });
}
