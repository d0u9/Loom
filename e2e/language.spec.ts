import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("language changes framework labels, persists after refresh and preserves item data", async ({
  page,
}) => {
  await page.goto("/items");
  const switchButton = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const dimensions = async (name: string) =>
    switchButton(name).evaluate((el) => ({
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
    }));
  await expect(
    switchButton(localized["fixture.3e8e498593dc"]).locator(".lucide-languages"),
  ).toBeVisible();
  const loginSize = await dimensions(localized["fixture.3e8e498593dc"]);
  expect(loginSize.width).toBe(loginSize.height);
  await switchButton(localized["fixture.3e8e498593dc"]).click();
  expect(await dimensions("Switch to Chinese")).toEqual(loginSize);
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await page
    .getByLabel("Password", { exact: true })
    .fill("loom-browser-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Item", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const accountSize = await dimensions("Switch to Chinese");
  expect(accountSize).toEqual(loginSize);
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
  expect(await dimensions(localized["fixture.3e8e498593dc"])).toEqual(accountSize);
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
