import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("row tools stay inline on desktop and mobile", async ({ page }, info) => {
  await page.goto("/items");
  await page
    .getByLabel(localized["Password"], { exact: true })
    .fill("loom-browser-password");
  await page
    .getByRole("button", { name: localized["Sign in"], exact: true })
    .click();
  await page
    .getByRole("button", { name: localized["New item"], exact: true })
    .click();
  const name = "Tools " + info.project.name;
  await page.getByLabel(localized["Name"], { exact: true }).fill(name);
  await page
    .getByRole("button", { name: localized["Save"], exact: true })
    .click();
  const row = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  const edit = row.getByRole("button", {
    name: localized["Edit"],
    exact: true,
  });
  await expect(edit).toBeVisible();
  await edit.click();
  await expect(
    page.getByRole("dialog", { name: localized["fixture.5bff2f523d3d"] }),
  ).toBeVisible();
});
