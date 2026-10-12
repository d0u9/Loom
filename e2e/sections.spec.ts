import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("shared document editor creates three levels, moves items and preserves sections on reload", async ({
  page,
}, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for":
      info.project.name === "desktop" ? "192.0.2.31" : "192.0.2.32",
  });
  await page.goto("/templates");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await page
    .getByRole("button", { name: localized["fixture.7d56750df596"], exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel(localized["Name"], { exact: true })
    .fill("Sections " + info.project.name);
  await page.getByRole("button", { name: localized["Create"], exact: true }).click();
  const createSection = async (name: string, parentName?: string) => {
    await page
      .locator(".page-header")
      .getByRole("button", { name: localized["New section"], exact: true })
      .click();
    const modal = page.getByRole("dialog", { name: localized["New section"], exact: true });
    await modal.getByLabel(localized["Name"], { exact: true }).fill(name);
    if (parentName)
      await modal
        .getByLabel(localized["Parent section"], { exact: true })
        .selectOption({ label: parentName });
    await modal.getByRole("button", { name: localized["Save section"], exact: true }).click();
  };
  await createSection(localized["fixture.339dd3cabd55"]);
  await createSection(localized["fixture.04ceb362830f"], localized["fixture.339dd3cabd55"]);
  await createSection(localized["fixture.327b54d04f71"], localized["fixture.3cadcf8086c7"]);
  await createSection(localized["fixture.dc86470f56ab"], localized["fixture.36dc20d4e883"]);
  await expect(page.getByRole("alert")).toContainText("three levels");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: localized["Add entries"], exact: true }).click();
  await page
    .getByLabel(localized["Add to section"], { exact: true })
    .selectOption({ label: localized["fixture.36dc20d4e883"] });
  await page.getByRole("button", { name: localized["fixture.82d440e5f3ee"], exact: true }).click();
  await page.getByLabel(localized["Entry name"], { exact: true }).fill(localized["fixture.6b1311e9a899"]);
  await page
    .getByRole("button", { name: localized["fixture.9031f7ab2f77"], exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(localized["Saved"]);
  await page.reload();
  await expect(page.getByLabel(localized["Entry name"], { exact: true })).toHaveValue(
    localized["fixture.6b1311e9a899"],
  );
  await page.getByRole("button", { name: localized["fixture.1846bc6ee759"], exact: true }).click();
  await expect(page.getByLabel(localized["fixture.e35f16d27295"], { exact: true })).toHaveValue(
    /.+/,
  );
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: `test-results/${info.project.name}-sections-nested.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: localized["fixture.2eb956971886"], exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel(localized["Name"], { exact: true })
    .fill(localized["fixture.db855c3d0d1b"]);
  await page.getByRole("button", { name: localized["Save section"], exact: true }).click();
  await page
    .getByRole("button", { name: localized["fixture.8efc88206b15"], exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: localized["fixture.a036de71bed3"], exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: localized["fixture.1846bc6ee759"], exact: true }).click();
  await page.getByLabel(localized["fixture.e35f16d27295"], { exact: true }).selectOption("");
  await page.getByRole("button", { name: localized["Move"], exact: true }).click();
  await page
    .getByRole("button", { name: localized["fixture.9031f7ab2f77"], exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(localized["Saved"]);
  await page.reload();
  await page.getByRole("button", { name: localized["fixture.1846bc6ee759"], exact: true }).click();
  await expect(page.getByLabel(localized["fixture.e35f16d27295"], { exact: true })).toHaveValue("");
  await page.keyboard.press("Escape");
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const create = async (path: string, data: any) => {
    const r = await page.request.post("/api/v1" + path, {
      headers: { "x-csrf-token": csrf },
      data,
    });
    expect(r.ok()).toBe(true);
    return r.json();
  };
  const food = await create("/categories", {
      name: "MergeFood " + info.project.name,
    }),
    lab = await create("/categories", {
      name: "MergeLab " + info.project.name,
    });
  const egg = await create("/items", {
    name: "MergeEgg " + info.project.name,
    categoryIds: [food.id, lab.id],
    requestId: crypto.randomUUID(),
  });
  await page.reload();
  const addCategory = async (category: any) => {
    await page.getByRole("button", { name: localized["Add entries"], exact: true }).click();
    await page
      .getByLabel(localized["fixture.1c6b15dc81da"], { exact: true })
      .selectOption(category.id);
    await page.getByRole("button", { name: localized["Add category"], exact: true }).click();
    await expect(
      page.getByRole("button", { name: localized["fixture.e825f4c26f87"] }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: localized["Apply selection"], exact: true }).click();
  };
  await addCategory(food);
  await addCategory(lab);
  await addCategory(lab);
  await expect(page.getByLabel(localized["Entry name"])).toHaveCount(2);
  await expect(page.getByText(localized["fixture.afa3ba748beb"], { exact: true })).toBeVisible();
  const removeCategory = async (category: any) => {
    await page
      .locator(".entry-group")
      .filter({ hasText: category.name })
      .getByRole("button", { name: localized["Remove category source"], exact: true })
      .click();
  };
  await removeCategory(food);
  await expect(page.getByLabel(localized["Entry name"])).toHaveCount(2);
  await removeCategory(lab);
  await expect(page.getByLabel(localized["Entry name"])).toHaveCount(1);
  await page.getByRole("button", { name: localized["Add entries"], exact: true }).click();
  const addModal = page.getByRole("dialog", { name: localized["Add entries"], exact: true });
  await expect(addModal.getByRole("button", { name: localized["New section"] })).toHaveCount(
    0,
  );
  await addModal.getByLabel(localized["fixture.2de8d9b98b44"], { exact: true }).fill("no-match-item");
  await expect(addModal.getByText(localized["fixture.b9bffce17bd7"])).toBeVisible();
  await addModal.getByLabel(localized["fixture.2de8d9b98b44"], { exact: true }).fill(egg.name);
  await page.screenshot({
    path: `test-results/${info.project.name}-add-items.png`,
  });
  await addModal.getByRole("button", { name: egg.name, exact: true }).click();
  await expect(addModal).toHaveCount(0);
  await expect(page.getByLabel(localized["Entry name"])).toHaveCount(2);
  await page
    .getByRole("button", { name: localized["fixture.9031f7ab2f77"], exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(localized["Saved"]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-sections.png`,
    fullPage: true,
  });
});
