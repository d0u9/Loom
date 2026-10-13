import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
test("category single rows sort with keyboard and pointer and survive reload", async ({
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
  const c = await post("/categories", {
    name: "Sorting " + info.project.name,
  });
  const a = await post("/items", {
    name: "First " + info.project.name,
    categoryIds: [c.id],
    requestId: crypto.randomUUID(),
  });
  const b = await post("/items", {
    name: "Second " + info.project.name,
    categoryIds: [c.id],
    requestId: crypto.randomUUID(),
  });
  async function open() {
    await page.reload();
    await page.getByRole("link", { name: localized["Category"], exact: true }).click();
    await page
      .getByRole("button", { name: localized["Open "] + c.name, exact: true })
      .click();
    await page.getByRole("button", { name: localized["List"], exact: true }).click();
  }
  await open();
  const rows = page.locator("[data-sort-id]");
  const handles = rows.locator(".card-open");
  await expect(page.locator(".sort-handle")).toHaveCount(0);
  await expect(handles).toHaveCount(2);
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/v1/categories/${c.id}/order`)
          ).json()
        ).itemIds.length,
    )
    .toBe(2);
  const before = await rows.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-sort-id")),
  );
  await handles.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/v1/categories/${c.id}/order`)
          ).json()
        ).itemIds,
    )
    .toEqual([...before].reverse());
  await expect(rows.first()).toHaveAttribute("data-sort-id", before[1]!);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const from = await handles.first().boundingBox(),
    target = await page.getByRole("article").last().boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    target!.x + target!.width / 2,
    target!.y + target!.height / 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/v1/categories/${c.id}/order`)
          ).json()
        ).itemIds,
    )
    .toEqual(before);
  await open();
  await expect(rows.first()).toHaveAttribute("data-sort-id", before[0]!);
  await expect(page.getByText(localized["fixture.9378c94cc635"], { exact: false })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: localized["fixture.44f94ef284cf"], exact: true }),
  ).toHaveCount(0);
  if (info.project.name === "mobile") {
    const session = await page.context().newCDPSession(page);
    const first = await handles.first().boundingBox();
    const last = await handles.last().boundingBox();
    const point = { x: first!.x + 20, y: first!.y + first!.height / 2 };
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point],
    });
    await page.waitForTimeout(300);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: point.x, y: last!.y + last!.height / 2 }],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(
        async () =>
          (
            await (
              await page.request.get(`/api/v1/categories/${c.id}/order`)
            ).json()
          ).itemIds,
      )
      .toEqual([...before].reverse());
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await session.detach();
  }
  await page.screenshot({
    path: `test-results/${info.project.name}-sorted-category.png`,
    fullPage: true,
  });
});
