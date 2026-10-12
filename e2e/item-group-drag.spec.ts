import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("drag Item cards and rows onto group tags without opening or losing fields", async ({
  page,
}, info) => {
  await page.goto("/items");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await expect(page.getByRole("button", { name: localized["fixture.aa7084084271"] })).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const create = async (path: string, data: any) =>
    (
      await page.request.post("/api/v1" + path, {
        headers: { "x-csrf-token": csrf },
        data,
      })
    ).json();
  const category = await create("/categories", {
    name: "Drag category " + info.project.name,
  });
  const group = "Target " + info.project.name;
  const item = await create("/items", {
    name: "Dragged " + info.project.name,
    note: "keep this",
    categoryIds: [category.id],
    requestId: crypto.randomUUID(),
  });
  await create("/items", {
    name: "Target seed " + info.project.name,
    categoryIds: [],
    itemGroup: group,
    requestId: crypto.randomUUID(),
  });
  await page.reload();
  const row = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: item.name, exact: true }),
  });
  await expect(row.locator(".item-group-tag")).toHaveText(localized["fixture.96e477512df8"]);
  const tag = page.getByRole("tab", { name: group, exact: true });
  const current = async () =>
    (await (await page.request.get("/api/v1/items")).json()).find(
      (x: any) => x.id === item.id,
    );
  await page
    .getByRole("searchbox", { name: localized["Search"], exact: true })
    .fill(item.name);
  async function drag(target: typeof tag, cancel = false) {
    await row.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await target.scrollIntoViewIfNeeded();
    const from = (await row.locator(".card-open").boundingBox())!;
    const to = (await target.boundingBox())!;
    const a = { x: from.x + 16, y: from.y + from.height / 2 };
    const b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    if (info.project.name === "mobile") {
      const session = await page.context().newCDPSession(page);
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [a],
      });
      await page.waitForTimeout(300);
      await expect(page.locator(".drag-preview")).toContainText(item.name);
      await expect(row).toHaveClass(/is-dragging/);
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [b],
      });
      await expect(target).toHaveClass(/drop-hover/);
      await expect(page.locator(".drag-preview")).toContainText(item.name);
      if (cancel) {
        await page.screenshot({
          path: `test-results/${info.project.name}-drag-preview.png`,
        });
        await page.keyboard.press("Escape");
      }
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await session.detach();
    } else {
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 8 });
      await expect(target).toHaveClass(/drop-hover/);
      await expect(page.locator(".drag-preview")).toContainText(item.name);
      if (cancel) {
        await page.screenshot({
          path: `test-results/${info.project.name}-drag-preview.png`,
        });
        await page.keyboard.press("Escape");
      }
      await page.mouse.up();
    }
    await expect(page.locator(".drag-preview")).toHaveCount(0);
    await expect(row).not.toHaveClass(/is-dragging/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(target).not.toHaveClass(/drop-hover/);
  }
  await drag(tag, true);
  expect((await current()).itemGroup).toBeNull();
  await drag(tag);
  await expect.poll(async () => (await current()).itemGroup).toBe(group);
  await expect(row.locator(".item-group-tag")).toHaveText("Group · " + group);
  expect((await current()).note).toBe("keep this");
  expect((await current()).categoryIds).toEqual([category.id]);
  await page.getByRole("button", { name: localized["List"], exact: true }).click();
  await drag(page.getByRole("tab", { name: localized["Ungrouped"], exact: true }));
  await expect.poll(async () => (await current()).itemGroup).toBeNull();
  await expect(row.locator(".item-group-tag")).toHaveText(localized["fixture.96e477512df8"]);
  await page.reload();
  expect((await current()).itemGroup).toBeNull();
  await page
    .getByRole("searchbox", { name: localized["Search"], exact: true })
    .fill(item.name);
  await page.route("**/api/v1/items/" + item.id, (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        message: "Resource changed; reload before saving",
      }),
    }),
  );
  await drag(tag);
  await expect(
    page.getByText("Error: Resource changed; reload before saving", {
      exact: true,
    }),
  ).toBeVisible();
  expect((await current()).itemGroup).toBeNull();
  await page.unroute("**/api/v1/items/" + item.id);
  await page.screenshot({
    path: `test-results/${info.project.name}-group-tags.png`,
    fullPage: true,
  });
});
