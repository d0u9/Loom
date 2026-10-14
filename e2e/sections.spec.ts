import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("shared document editor creates two levels, moves items and preserves sections on reload", async ({
  page,
}, info) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for":
      info.project.name === "desktop" ? "192.0.2.31" : "192.0.2.32",
  });
  await page.goto("/templates");
  await page
    .getByLabel(localized["Password"], { exact: true })
    .fill("loom-browser-password");
  await page
    .getByRole("button", { name: localized["Sign in"], exact: true })
    .click();
  await page
    .getByRole("button", {
      name: localized["fixture.8b6c722cd24d"],
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel(localized["Name"], { exact: true })
    .fill("Sections " + info.project.name);
  await page
    .getByRole("button", { name: localized["Create"], exact: true })
    .click();
  await expect(page).toHaveURL(/\/templates\/[\w-]+$/);
  if (info.project.name === "mobile") {
    // A long title truncates; header actions stay on one row inside the viewport.
    const title = page.locator(".page-header h2");
    await expect(page.locator(".page-header .page-actions")).toBeVisible();
    const original = await title.textContent();
    await title.evaluate(
      (el) => (el.textContent = "A very long title".repeat(12)),
    );
    const row = await page.evaluate(() => {
      const header = document.querySelector(".page-header")!;
      const primary = header
        .querySelector(".page-actions")!
        .getBoundingClientRect();
      const h2 = header.querySelector("h2")!.getBoundingClientRect();
      return {
        fits: primary.right <= innerWidth,
        same: Math.abs(primary.top - h2.top) < 20,
      };
    });
    expect(row).toEqual({ fits: true, same: true });
    await title.evaluate((el, text) => (el.textContent = text), original);
  }
  const tool = async (name: string) => {
    const button = page.getByRole("button", {
      name,
      exact: true,
      includeHidden: true,
    });
    await button.click();
  };
  const createSection = async (name: string, parentName?: string) => {
    await page
      .locator(".page-header")
      .getByRole("button", { name: localized["New section"], exact: true })
      .click();
    const modal = page.getByRole("dialog", {
      name: localized["New section"],
      exact: true,
    });
    await modal.getByLabel(localized["Name"], { exact: true }).fill(name);
    if (parentName) {
      await modal
        .getByLabel(localized["Parent section"], { exact: true })
        .click();
      await page
        .getByRole("combobox", {
          name: localized["Parent section"],
          exact: true,
        })
        .fill(parentName);
      await page.getByRole("option", { name: parentName, exact: true }).click();
    }
    await modal
      .getByRole("button", { name: localized["Save section"], exact: true })
      .click();
  };
  await createSection(localized["fixture.339dd3cabd55"]);
  await createSection(
    localized["fixture.04ceb362830f"],
    localized["fixture.339dd3cabd55"],
  );
  await createSection(
    localized["fixture.327b54d04f71"],
    localized["fixture.339dd3cabd55"],
  );
  await page
    .getByRole("button", { name: localized["Add entries"], exact: true })
    .click();
  const sourceBounds = await page
    .locator(".add-sources .button")
    .evaluateAll((nodes) =>
      nodes.map((el) => {
        const r = el.getBoundingClientRect();
        return { y: r.y, height: r.height, width: r.width };
      }),
    );
  expect(sourceBounds).toHaveLength(2);
  expect(
    Math.max(...sourceBounds.map((b) => b.y)) -
      Math.min(...sourceBounds.map((b) => b.y)),
  ).toBeLessThan(1);
  expect(
    Math.max(...sourceBounds.map((b) => b.height)) -
      Math.min(...sourceBounds.map((b) => b.height)),
  ).toBeLessThan(1);
  expect(
    Math.max(...sourceBounds.map((b) => b.width)) -
      Math.min(...sourceBounds.map((b) => b.width)),
  ).toBeLessThan(2);

  await page.getByLabel(localized["Add to section"], { exact: true }).click();
  await page
    .getByRole("combobox", { name: localized["Add to section"], exact: true })
    .fill(localized["fixture.e574b02bac47"]);
  await page
    .getByRole("option", {
      name: localized["fixture.e574b02bac47"],
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: localized["Done"], exact: true })
    .click();
  await page
    .getByLabel(localized["New temporary entry"], { exact: true })
    .fill(localized["fixture.6b1311e9a899"]);
  await page
    .getByLabel(localized["New temporary entry"], { exact: true })
    .press("Enter");
  await tool(localized["fixture.1846bc6ee759"]);
  await page
    .getByLabel(localized["fixture.e35f16d27295"], { exact: true })
    .click();
  await page
    .getByRole("option", {
      name: localized["fixture.e574b02bac47"],
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: localized["Move"], exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(localized["Saved"]);
  await page.reload();
  await page
    .getByRole("button", { name: localized["Edit mode"], exact: true })
    .click();
  await expect(
    page.getByLabel(localized["Entry name"], { exact: true }),
  ).toHaveText(localized["fixture.6b1311e9a899"]);
  // Fold arrows hide a section's contents without changing the document.
  await page
    .getByRole("button", {
      name: localized["fixture.f868a50b3767"],
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel(localized["Entry name"], { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: localized["fixture.2eb956971886"],
      exact: true,
    }),
  ).toHaveCount(0);
  // Clicking the heading row itself toggles too.
  await page
    .getByLabel(localized["fixture.e7b177a44877"], { exact: true })
    .click({ position: { x: 200, y: 10 } });
  await expect(
    page.getByLabel(localized["Entry name"], { exact: true }),
  ).toHaveText(localized["fixture.6b1311e9a899"]);
  await tool(localized["fixture.1846bc6ee759"]);
  await expect(
    page.getByLabel(localized["fixture.e35f16d27295"], { exact: true }),
  ).toHaveValue(/.+/);
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: `test-results/${info.project.name}-sections-nested.png`,
    fullPage: true,
  });
  await tool(localized["fixture.2eb956971886"]);
  await page
    .getByRole("dialog")
    .getByLabel(localized["Name"], { exact: true })
    .fill(localized["fixture.db855c3d0d1b"]);
  await page
    .getByRole("button", { name: localized["Save section"], exact: true })
    .click();
  await tool(localized["fixture.8efc88206b15"]);
  await expect(
    page.getByRole("button", {
      name: localized["fixture.a036de71bed3"],
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(1);
  await tool(localized["fixture.1846bc6ee759"]);
  await page
    .getByLabel(localized["fixture.e35f16d27295"], { exact: true })
    .click();
  await page
    .getByRole("option", { name: localized["Root"], exact: true })
    .click();
  await page
    .getByRole("button", { name: localized["Move"], exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(localized["Saved"]);
  await page.reload();
  await page
    .getByRole("button", { name: localized["Edit mode"], exact: true })
    .click();
  await tool(localized["fixture.1846bc6ee759"]);
  await expect(
    page.getByLabel(localized["fixture.e35f16d27295"], { exact: true }),
  ).toHaveValue(localized["Root"]);
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
  await page
    .getByRole("button", { name: localized["Edit mode"], exact: true })
    .click();
  const addCategory = async (category: any) => {
    await page
      .getByRole("button", { name: localized["Add entries"], exact: true })
      .click();
    await page
      .getByRole("tab", { name: localized["Add from categories"], exact: true })
      .click();
    await page
      .getByRole("button", {
        name: localized["Add category "] + category.name,
        exact: true,
      })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: localized["Done"], exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: localized["fixture.e825f4c26f87"] }),
    ).toHaveCount(0);
  };
  await addCategory(food);
  await addCategory(lab);
  await addCategory(lab);
  await expect(page.getByLabel(localized["Entry name"])).toHaveCount(2);
  await expect(page.locator(".entry-group")).toHaveCount(0);
  await expect(page.locator(".entry-source-count")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(localized["Saved"]);
  await tool(localized["Remove "] + egg.name);
  await expect(page.getByLabel(localized["Entry name"])).toHaveCount(1);
  await addCategory(food);
  await expect(page.getByLabel(localized["Entry name"])).toHaveCount(2);
  await tool(localized["Remove "] + egg.name);
  await expect(page.getByLabel(localized["Entry name"])).toHaveCount(1);
  await page
    .getByRole("button", { name: localized["Add entries"], exact: true })
    .click();
  const addModal = page.getByRole("dialog", {
    name: localized["Add entries"],
    exact: true,
  });
  await expect(
    addModal.getByRole("button", { name: localized["New section"] }),
  ).toHaveCount(0);
  await addModal
    .getByRole("tab", { name: localized["Add from items"], exact: true })
    .click();
  await addModal
    .getByLabel(localized["fixture.bb732b6bd964"], { exact: true })
    .fill("no-match-item");
  await expect(
    addModal.getByText(localized["fixture.2a762fa51309"]),
  ).toBeVisible();
  await addModal
    .getByLabel(localized["fixture.bb732b6bd964"], { exact: true })
    .fill(egg.name);
  await page.screenshot({
    path: `test-results/${info.project.name}-add-items.png`,
  });
  await addModal.getByRole("button", { name: egg.name, exact: true }).click();
  await expect(addModal).toBeVisible();
  await addModal
    .getByRole("button", { name: localized["Done"], exact: true })
    .click();
  await expect(addModal).toHaveCount(0);
  await expect(page.getByLabel(localized["Entry name"])).toHaveCount(2);
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
