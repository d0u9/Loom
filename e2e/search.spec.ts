import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("four resource directories share live search in card and list views", async ({
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
  const name = "FindMe " + info.project.name;
  const parent = await create("/categories", {
    name: "SearchParent " + info.project.name,
  });
  const category = await create("/categories", { name });
  await create("/items", {
    name,
    note: "RemarkNeedle " + info.project.name,
    categoryIds: [category.id],
    requestId: crypto.randomUUID(),
  });
  for (const kind of ["template", "checklist"]) {
    await create("/documents", {
      kind,
      name,
      entries: [],
      ...(kind === "checklist" ? { useDate: "2027-05-23" } : {}),
      requestId: crypto.randomUUID(),
    });
  }
  for (const [path, section] of [
    ["items", localized["Item"]],
    ["categories", localized["Category"]],
    ["templates", localized["Template"]],
    ["checklists", localized["Checklist"]],
  ]) {
    await page.goto("/" + path);
    const search = page.getByRole("searchbox", {
      name: localized["Search"],
      exact: true,
    });
    await expect(search).toHaveAttribute("data-1p-ignore", "true");
    await search.fill("  " + name.toLowerCase() + "  ");
    const cards = page.locator(".record-card");
    await expect(cards).toHaveCount(1);
    await expect(
      cards.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: localized["List"], exact: true })
      .click();
    await expect(page.locator(".records-list .record-card")).toHaveCount(1);
    await search.fill("MissingSearchResult");
    await expect(cards).toHaveCount(0);
    await expect(
      page.getByText(localized["No matching results."], { exact: true }),
    ).toBeVisible();
    await search.press("Escape");
    await expect(search).toHaveValue("");
    await expect(
      cards.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    if (section === localized["Item"]) {
      await search.fill("remarkneedle " + info.project.name);
      await expect(cards).toHaveCount(1);
    } else if (section === localized["Category"]) {
      await search.fill(name);
      await expect(
        cards.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    } else if (section === localized["Checklist"]) {
      await search.fill("2027-05-23");
      await expect(
        cards.getByRole("heading", { name, exact: true }),
      ).toBeVisible();
    }
    await search.fill(name.toLowerCase());
    await page
      .getByRole("button", { name: localized["Clear search"], exact: true })
      .click();
    await expect(search).toHaveValue("");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/checklists?date=2027-05-24");
  await page
    .getByRole("searchbox", { name: localized["Search"], exact: true })
    .fill(name.toLowerCase());
  await expect(page.locator(".record-card")).toHaveCount(0);
  await page
    .getByRole("link", { name: localized["Checklist"], exact: true })
    .click();
  await expect(
    page.locator(".record-card").getByRole("heading", { name, exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: localized["Template"], exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", { name: localized["Search"], exact: true }),
  ).toHaveValue("");
  await page.screenshot({
    path: `test-results/${info.project.name}-search.png`,
    fullPage: true,
  });
});
