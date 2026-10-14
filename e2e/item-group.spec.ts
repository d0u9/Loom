import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("Item group tabs combine with search and shared editing", async ({
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
    page.getByRole("button", { name: localized["New item"] }),
  ).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const group = "Food " + info.project.name;
  const other = "Drink " + info.project.name;
  for (const [name, itemGroup] of [
    ["Egg", group],
    ["Water", other],
    ["Loose", null],
  ]) {
    const response = await page.request.post("/api/v1/items", {
      headers: { "x-csrf-token": csrf },
      data: {
        name: name + info.project.name,
        categoryIds: [],
        itemGroup,
        requestId: crypto.randomUUID(),
      },
    });
    expect(response.ok()).toBe(true);
  }
  await page.reload();
  const tab = page.getByRole("tab", { name: group, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".record-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Egg" + info.project.name, exact: true }),
  ).toBeVisible();
  const search = page.getByRole("searchbox", {
    name: localized["Search"],
    exact: true,
  });
  await search.fill("Water");
  await expect(page.locator(".record-card")).toHaveCount(0);
  await search.fill("");
  await page
    .getByRole("button", { name: localized["List"], exact: true })
    .click();
  await expect(page.locator(".records-list .record-card")).toHaveCount(1);
  await page.getByRole("button", { name: localized["New item"] }).click();
  const dialog = page.getByRole("dialog");
  const groupInput = dialog.getByRole("combobox", {
    name: localized["Catalog group"],
    exact: true,
  });
  await expect(groupInput).toHaveValue(group);
  await groupInput.click();
  await expect(
    dialog.getByRole("listbox", { name: localized["Catalog group"] }),
  ).toBeVisible();
  await dialog.getByRole("option", { name: other, exact: true }).click();
  await expect(groupInput).toHaveValue(other);
  await groupInput.fill(localized["fixture.0c8bca718d5c"] + info.project.name);
  await dialog
    .getByRole("option", {
      name: localized["fixture.7e4272be1779"] + info.project.name + "”",
      exact: true,
    })
    .click();
  await expect(groupInput).toHaveValue(
    localized["fixture.0c8bca718d5c"] + info.project.name,
  );
  await groupInput.fill(group);
  await groupInput.press("ArrowDown");
  await groupInput.press("ArrowDown");
  await page.screenshot({
    path: `test-results/${info.project.name}-group-dropdown.png`,
  });
  await groupInput.press("Enter");
  await expect(groupInput).toHaveValue(group);
  await expect(groupInput).toHaveAttribute("aria-expanded", "false");
  await groupInput.click();
  await groupInput.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(groupInput).toHaveAttribute("aria-expanded", "false");
  await dialog
    .getByLabel(localized["Name"], { exact: true })
    .fill("New" + info.project.name);
  await dialog
    .getByRole("button", { name: localized["Save"], exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".record-card")).toHaveCount(2);
  await page
    .getByRole("button", {
      name: localized["fixture.a6b4211e8042"] + info.project.name,
      exact: true,
    })
    .click();
  await dialog.getByLabel(localized["Catalog group"], { exact: true }).fill("");
  await dialog
    .getByRole("button", { name: localized["Save"], exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".record-card")).toHaveCount(1);
  await page
    .getByRole("tab", { name: localized["Ungrouped"], exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "New" + info.project.name, exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: localized["All"], exact: true }).focus();
  await page.keyboard.press("End");
  const lastTab = page.getByRole("tab").last();
  await expect(lastTab).toBeFocused();
  await expect(lastTab).toHaveAttribute("aria-selected", "true");
  await page.screenshot({
    path: `test-results/${info.project.name}-item-groups.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
