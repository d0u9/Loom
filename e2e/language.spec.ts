import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("language changes framework labels, persists after refresh and preserves item data", async ({
  page,
}) => {
  await page.goto("/items");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page
    .getByLabel("Password", { exact: true })
    .fill("loom-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Item", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "New Item", exact: true }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Name", { exact: true }).fill(localized["fixture.81958f1d38b6"]);
  await form.getByLabel("Note", { exact: true }).fill(localized["fixture.762b5d98c702"]);
  await form.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: localized["fixture.81958f1d38b6"] }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Item", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Name", exact: true }),
  ).toBeVisible();
  for (const name of ["Category", "Template", "Checklist"]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.locator(".page-header h2")).toHaveText(name);
    await page
      .getByRole("button", { name: "New " + name, exact: true })
      .click();
    await expect(
      page.getByRole("dialog").getByLabel("Name", { exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
  }
  await page
    .getByRole("button", { name: "Switch to Chinese", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: localized["Checklist"], exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: localized["Item"], exact: true }).click();
  await expect(
    page.getByRole("heading", { name: localized["fixture.81958f1d38b6"] }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: localized["Item"], exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});
