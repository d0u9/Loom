import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("catalog to template, checklist, archive and restore", async ({
  page,
}, info) => {
  const suffix = info.project.name;
  await page.goto("/");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await page.getByRole("link", { name: "Category", exact: true }).click();
  await page.getByRole("button", { name: localized["fixture.eb6e24aee1a6"] }).click();
  await page.getByLabel(localized["Name"], { exact: true }).fill("Food " + suffix);
  await page.getByRole("button", { name: localized["Save"], exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Food " + suffix, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Item", exact: true }).click();
  await page.getByRole("button", { name: localized["fixture.aa7084084271"] }).click();
  let droppedItem = false;
  await page.route("**/api/v1/items", async (route) => {
    if (route.request().method() === "POST" && !droppedItem) {
      droppedItem = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });

  await page.getByLabel(localized["Name"], { exact: true }).fill("egg " + suffix);
  await page.getByLabel("Food " + suffix).check();
  await page.getByRole("button", { name: localized["Save"], exact: true }).click();
  await expect(
    page.getByRole("button", { name: localized["Retry save"], exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: localized["Retry save"], exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "egg " + suffix, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Template", exact: true }).click();
  await page.getByRole("button", { name: localized["fixture.7d56750df596"] }).click();
  await expect(
    page.getByRole("dialog").getByLabel(localized["Name"], { exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: localized["fixture.7d56750df596"] }),
  ).toBeFocused();
  await page.getByRole("button", { name: localized["fixture.7d56750df596"] }).click();
  let droppedDocument = false;
  await page.route("**/api/v1/documents", async (route) => {
    if (route.request().method() === "POST" && !droppedDocument) {
      droppedDocument = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });

  await page
    .getByRole("dialog")
    .getByLabel(localized["Name"], { exact: true })
    .fill("Meal " + suffix);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: localized["Create"], exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: localized["Retry creation"], exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog").getByLabel(localized["Name"], { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: localized["Retry creation"], exact: true })
    .click();

  await expect(
    page
      .locator(".page-header")
      .getByRole("heading", { name: "Meal " + suffix, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${suffix}-template-editor.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: localized["Add entries"], exact: true }).click();
  // Item and Category are alternative sources, one tab each.
  const dialogBox = await page.getByRole("dialog").boundingBox();
  await page.getByRole("tab", { name: localized["fixture.2cec23ad2305"], exact: true }).click();
  expect(await page.getByRole("dialog").boundingBox()).toEqual(dialogBox);
  await expect(page.getByLabel(localized["fixture.2de8d9b98b44"], { exact: true })).toHaveCount(0);
  await page.getByLabel(localized["fixture.132c3a2fd757"], { exact: true }).fill("Food " + suffix);
  await page
    .getByRole("button", { name: localized["fixture.1db821558226"] + suffix, exact: true })
    .click();
  await page.getByRole("button", { name: localized["Apply selection"], exact: true }).click();
  await expect(page.getByLabel(localized["Entry name"])).toHaveValue("egg " + suffix);
  // Quantity and unit are hidden for now.
  await expect(page.getByLabel("quantity", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: localized["fixture.9031f7ab2f77"] }).click();
  await expect(page.getByRole("status")).toHaveText(localized["Saved"]);
  // Instantiating is a top-level action, not hidden in the more menu.
  await page
    .locator(".page-header")
    .getByRole("button", { name: localized["Create checklist"], exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel(localized["Use date (optional)"])
    .fill("2026-10-20");
  await page.getByRole("button", { name: localized["Confirm / Retry"] }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Checklist", exact: true }).click();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: "Meal " + suffix })
      .getByText(localized["fixture.5d234f9450bb"], { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: "Meal " + suffix, exact: true }),
    })
    .getByRole("button", { name: localized["fixture.304b9dd745ae"] + suffix, exact: true })
    .click();
  await expect(page.getByLabel(localized["Entry name"])).toHaveValue("egg " + suffix);
  // Checklists hide category group rows; sources are managed in Templates.
  await expect(page.locator(".entry-group")).toHaveCount(0);
  let dropped = false;
  await page.route("**/checked", async (route) => {
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page.getByLabel(localized["fixture.2e0dda7942ec"] + suffix).check();
  await expect(page.getByRole("button", { name: localized["Retry check"] })).toBeVisible();
  await page.getByRole("button", { name: localized["Retry check"] }).click();
  await expect(page.getByRole("status")).toHaveText(localized["Check saved"]);
  await page.getByRole("button", { name: localized["More actions"], exact: true }).click();
  await page.getByRole("button", { name: localized["Archive"], exact: true }).click();
  await page.getByRole("button", { name: localized["More actions"], exact: true }).click();
  await expect(page.getByRole("button", { name: localized["Restore archive"] })).toBeVisible();
  await page.getByRole("button", { name: localized["Restore archive"] }).click();
  await page.getByRole("button", { name: localized["Confirm / Retry"] }).click();
  await expect(page.getByLabel(localized["fixture.2e0dda7942ec"] + suffix)).toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/" + suffix + ".png",
    fullPage: true,
  });
  // Checklists can be deleted outright instead of only archived.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: localized["More actions"], exact: true }).click();
  await page.getByRole("button", { name: localized["Delete checklist"], exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Meal " + suffix, exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Meal " + suffix, exact: true }),
  ).toHaveCount(0);
});
