import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("Item category badges and reserved note space align cards", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await expect(page.getByRole("button", { name: localized["fixture.aa7084084271"] })).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const post = async (path: string, data: any) =>
    (
      await page.request.post("/api/v1" + path, {
        headers: { "x-csrf-token": csrf },
        data,
      })
    ).json();
  const category = await post("/categories", {
    name: "Badge " + info.project.name,
    parentId: null,
  });
  for (const [name, note] of [
    ["With note", localized["fixture.67bdf03511e8"].repeat(8)],
    ["Without note", ""],
  ])
    await post("/items", {
      name: name + info.project.name,
      note,
      categoryIds: [category.id],
      requestId: crypto.randomUUID(),
    });
  await page.reload();
  const a = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "With note" + info.project.name,
      exact: true,
    }),
  });
  const b = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "Without note" + info.project.name,
      exact: true,
    }),
  });
  await expect(a.locator(".category-tag:not(.item-group-tag)")).toHaveText(
    category.name,
  );
  await expect(b.locator(".category-tag:not(.item-group-tag)")).toHaveText(
    category.name,
  );
  expect((await a.boundingBox())!.height).toBe((await b.boundingBox())!.height);
  expect((await a.locator(".item-note").boundingBox())!.height).toBe(36);
  expect((await b.locator(".item-note").boundingBox())!.height).toBe(36);
  expect(
    await a
      .locator(".item-note")
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("12px");
  await page
    .locator(".page-header")
    .getByRole("button", { name: localized["List"], exact: true })
    .click();
  const longNote = a.locator(".item-note");
  expect((await longNote.boundingBox())!.width).toBeLessThanOrEqual(240);
  expect(
    await longNote.evaluate((el) => getComputedStyle(el).textOverflow),
  ).toBe("ellipsis");
  const left = (await a.locator(".item-group-tag").boundingBox())!.x;
  const right = (await b.locator(".item-group-tag").boundingBox())!.x;
  expect(Math.abs(left - right)).toBeLessThan(1);
  await expect(b.locator(".item-note")).toBeVisible();
  await page.screenshot({
    path: `test-results/${info.project.name}-item-badges.png`,
    fullPage: true,
  });
});
