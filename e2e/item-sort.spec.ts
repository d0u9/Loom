import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("Item sorting supports both fields and directions with search and view switching", async ({
  page,
}, info) => {
  await page.goto("/items");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await expect(page.getByRole("button", { name: localized["New item"] })).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const prefix = `Sort ${info.project.name} `;
  for (const [name, itemGroup] of [
    ["A", "Z"],
    ["B", "A"],
    ["C", "A"],
    ["D", null],
  ]) {
    const r = await page.request.post("/api/v1/items", {
      headers: { "x-csrf-token": csrf },
      data: {
        name: prefix + name,
        itemGroup,
        categoryIds: [],
        requestId: crypto.randomUUID(),
      },
    });
    expect(r.ok()).toBe(true);
  }
  await page.reload();
  await page.getByRole("searchbox", { name: localized["Search"] }).fill(prefix);
  const names = page.locator("#item-directory .item-summary-name h3");
  const order = async (letters: string[]) =>
    expect(names).toHaveText(letters.map((n) => prefix + n));
  await order(["A", "B", "C", "D"]);
  await page.getByRole("button", { name: localized["Descending"], exact: true }).click();
  await order(["D", "C", "B", "A"]);
  await page.getByRole("button", { name: localized["Group"], exact: true }).click();
  await order(["A", "C", "B", "D"]);
  await page.getByRole("button", { name: localized["Ascending"], exact: true }).click();
  await order(["D", "B", "C", "A"]);
  await page.getByRole("button", { name: localized["List"], exact: true }).click();
  await order(["D", "B", "C", "A"]);
  await page.getByRole("tab", { name: "A", exact: true }).click();
  await order(["B", "C"]);
  const direction = page.getByRole("button", { name: localized["Descending"], exact: true });
  await direction.focus();
  await page.keyboard.press("Enter");
  await expect(direction).toHaveAttribute("aria-pressed", "true");
  await order(["C", "B"]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
