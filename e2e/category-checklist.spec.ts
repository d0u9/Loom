import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("create checklist from Category supports cancel, date and safe retry", async ({
  page,
}, info) => {
  await page.goto("/categories");
  await page
    .getByLabel(localized["Password"], { exact: true })
    .fill("loom-browser-password");
  await page
    .getByRole("button", { name: localized["Sign in"], exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: localized["fixture.aa50ecc050be"] }),
  ).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const create = async (path: string, data: any) => {
    const r = await page.request.post("/api/v1" + path, {
      headers: { "x-csrf-token": csrf },
      data: { ...data, requestId: crypto.randomUUID() },
    });
    expect(r.ok()).toBe(true);
    return r.json();
  };
  const category = await create("/categories", {
    name: "Create from category " + info.project.name,
  });
  await create("/items", {
    name: localized["fixture.a5233356b8d8"] + info.project.name,
    categoryIds: [category.id],
  });
  await page.goto("/categories/" + category.id);
  const trigger = page.getByRole("button", {
    name: localized["Create checklist"],
    exact: true,
  });
  await trigger.click();
  const modal = page.getByRole("dialog", {
    name: localized["Create checklist"],
    exact: true,
  });
  await expect(
    modal.getByLabel(localized["Name"], { exact: true }),
  ).toBeFocused();
  await expect(
    modal.getByLabel(localized["Name"], { exact: true }),
  ).toHaveValue(category.name);
  await modal
    .getByRole("button", { name: localized["Cancel"], exact: true })
    .click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await modal
    .getByLabel(localized["Use date [8e8a943bc35e]"])
    .fill("2026-10-26");
  const bodies: any[] = [];
  await page.route("**/api/v1/categories/*/checklists", async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) {
      await route.fetch();
      await route.fulfill({
        status: 500,
        json: { message: "Temporary failure" },
      });
    } else await route.continue();
  });
  await modal
    .getByRole("button", { name: localized["Create"], exact: true })
    .click();
  await expect(modal.getByRole("alert")).toBeVisible();
  await modal
    .getByRole("button", { name: localized["Retry creation"], exact: true })
    .click();
  await expect(page).toHaveURL(/\/checklists\/[\w-]+$/);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  await expect(
    page.getByRole("checkbox", {
      name: localized["fixture.abbcca2c16ca"] + info.project.name,
      exact: true,
    }),
  ).not.toBeChecked();
  const docs = (
    await (await page.request.get("/api/v1/documents")).json()
  ).filter((d: any) => d.name === category.name);
  expect(docs).toHaveLength(1);
  expect(docs[0].useDate).toBe("2026-10-26");
  await page.goto("/categories/" + category.id);
  await trigger.click();
  const refreshName = category.name + " refresh failure";
  await modal.getByLabel(localized["Name"], { exact: true }).fill(refreshName);
  await page.route("**/api/v1/documents", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 500,
          json: { message: "Calendar refresh failed" },
        })
      : route.continue(),
  );
  await modal
    .getByRole("button", { name: localized["Create"], exact: true })
    .click();
  await expect(page).toHaveURL(/\/checklists\/[\w-]+$/);
  await expect(
    page.getByRole("checkbox", {
      name: localized["fixture.abbcca2c16ca"] + info.project.name,
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/v1/documents")).json()).filter(
      (d: any) => d.name === refreshName,
    ),
  ).toHaveLength(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
