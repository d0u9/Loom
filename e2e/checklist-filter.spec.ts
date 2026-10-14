import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("checklists default to active and combine status, search and date", async ({
  page,
}, info) => {
  await page.goto("/checklists");
  await page
    .getByLabel(localized["Password"], { exact: true })
    .fill("loom-browser-password");
  await page
    .getByRole("button", { name: localized["Sign in"], exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: localized["fixture.9502ae5b9eb9"] }),
  ).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  for (const archived of [false, true]) {
    const response = await page.request.post("/api/v1/documents", {
      headers: { "x-csrf-token": csrf },
      data: {
        kind: "checklist",
        name:
          "Filter proof " +
          (archived ? "archived" : "active") +
          info.project.name,
        useDate: "2027-03-12",
        entries: [],
        requestId: crypto.randomUUID(),
      },
    });
    expect(response.ok()).toBe(true);
    const doc = await response.json();
    if (archived)
      expect(
        (
          await page.request.post(`/api/v1/checklists/${doc.id}/archive`, {
            headers: { "x-csrf-token": csrf },
            data: { version: doc.version, requestId: crypto.randomUUID() },
          })
        ).ok(),
      ).toBe(true);
  }
  await page.reload();
  const filter = page
    .locator(".page-header")
    .getByRole("group", { name: localized["Checklist status"], exact: true });
  const active = page.getByRole("button", {
    name: localized["fixture.0c4f1a14699b"] + info.project.name,
    exact: true,
  });
  const archived = page.getByRole("button", {
    name: localized["fixture.73a0da90151f"] + info.project.name,
    exact: true,
  });
  await expect(
    filter.getByRole("button", { name: localized["Active"], exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(active).toBeVisible();
  await expect(archived).toHaveCount(0);
  await filter
    .getByRole("button", { name: localized["Archived"], exact: true })
    .click();
  await expect(active).toHaveCount(0);
  await expect(archived).toBeVisible();
  await filter
    .getByRole("button", { name: localized["All"], exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(active).toBeVisible();
  await expect(archived).toBeVisible();
  await page
    .getByRole("searchbox")
    .fill("Filter proof archived" + info.project.name);
  await expect(active).toHaveCount(0);
  await expect(archived).toBeVisible();
  await page.goto("/checklists?date=2027-03-12");
  await expect(
    filter.getByRole("button", { name: localized["All"], exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(archived).toBeVisible();
  await page
    .getByRole("link", { name: localized["Checklist"], exact: true })
    .click();
  await expect(
    filter.getByRole("button", { name: localized["Active"], exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
