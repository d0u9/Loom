import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("Item form aligns labels and accessible category choices", async ({
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
  const name = localized["fixture.0f7696319105"] + info.project.name;
  await page.request.post("/api/v1/categories", {
    headers: { "x-csrf-token": csrf },
    data: { name },
  });
  await page.reload();
  await page.getByRole("button", { name: localized["New item"] }).click();
  const dialog = page.getByRole("dialog");
  const input = dialog.getByLabel(localized["Name"], { exact: true });
  await expect(input).toBeFocused();
  const legend = dialog.locator(".category-choice-field legend");
  expect((await legend.boundingBox())!.x).toBeCloseTo(
    (await input.boundingBox())!.x,
    0,
  );
  expect(await legend.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
    "13px",
  );
  const checkbox = dialog.getByRole("checkbox", { name, exact: true });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(checkbox).toBeChecked();
  const label = checkbox.locator("..");
  expect(await label.evaluate((el) => getComputedStyle(el).alignItems)).toBe(
    "center",
  );
  await input.fill("Form " + info.project.name);
  await page.screenshot({
    path: `test-results/${info.project.name}-item-form.png`,
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: localized["Save"], exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const search = page.getByRole("searchbox", {
    name: localized["Search"],
    exact: true,
  });
  await search.fill("Form " + info.project.name);
  const before = await search.boundingBox();
  await page
    .getByRole("button", {
      name: localized["fixture.9af4009d647e"] + info.project.name,
      exact: true,
    })
    .click();
  await expect(checkbox).toBeChecked();
  await expect(search).toBeVisible();
  await expect(search).toHaveValue("Form " + info.project.name);
  expect(await search.boundingBox()).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
