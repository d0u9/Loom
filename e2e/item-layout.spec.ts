import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("Item category badges and reserved note space align cards", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await expect(page.getByRole("button", { name: localized["New item"] })).toBeVisible();
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
  });
  const second = await post("/categories", {
    name: "Second badge " + info.project.name,
  });
  const multi = await post("/items", {
    name: "Multiple badges " + info.project.name,
    itemGroup: localized["fixture.b37a297aed80"].repeat(8),
    categoryIds: [category.id, second.id],
    requestId: crypto.randomUUID(),
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
  const multiCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: multi.name, exact: true }),
  });
  const compact = multiCard.locator(".category-compact-tag");
  if (info.project.name === "mobile") {
    await expect(compact).toBeVisible();
    await expect(compact).toHaveText(localized["fixture.c49044b713d3"]);
    await expect(
      multiCard.locator(".category-detail-tag").first(),
    ).toBeHidden();
    const groupBounds = (await multiCard
      .locator(".item-group-tag")
      .boundingBox())!;
    const countBounds = (await compact.boundingBox())!;
    expect(groupBounds.y).toBe(countBounds.y);
    expect(countBounds.x + countBounds.width).toBeLessThanOrEqual(
      (await multiCard.boundingBox())!.x +
        (await multiCard.boundingBox())!.width,
    );
  } else {
    await expect(compact).toBeHidden();
    await expect(
      multiCard.locator(".category-detail-tag").first(),
    ).toBeVisible();
  }
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
  if (info.project.name === "mobile") {
    const summary = (await a.locator(".item-summary").boundingBox())!;
    expect(summary.width).toBeGreaterThan((await a.boundingBox())!.width - 40);
    const group = a.locator(".item-group-tag");
    expect(await group.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await expect(a.locator(".record-actions")).toHaveCSS("gap", "0px");
    await a.locator(".action-tools summary").click();
    for (const button of await a.locator(".record-actions button").all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.width).toBe(32);
      expect(bounds.height).toBe(32);
    }
    await a.locator(".action-tools summary").click();
  }
  const noteHeight = info.project.name === "mobile" ? 18 : 36;
  expect((await a.locator(".item-note").boundingBox())!.height).toBe(
    noteHeight,
  );
  expect((await b.locator(".item-note").boundingBox())!.height).toBe(
    noteHeight,
  );
  if (info.project.name === "mobile") {
    await expect(a.locator(".item-note")).toHaveAttribute(
      "data-overflow",
      "true",
    );
    await expect(a.locator(".item-note")).not.toHaveCSS("mask-image", "none");
    await expect(b.locator(".item-note")).toHaveCSS("mask-image", "none");
  }
  expect(
    await a
      .locator(".item-note")
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("12px");
  await page.screenshot({
    path: `test-results/${info.project.name}-item-cards.png`,
    fullPage: true,
  });
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
