import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

for (const kind of ["template", "checklist"]) {
  test(`${kind}: ordinary swipes do not sort and failed drag saves retain the draft for an identical retry`, async ({
    page,
  }, info) => {
    await page.goto("/items");
    await page
      .getByLabel(localized["Password"], { exact: true })
      .fill("loom-browser-password");
    await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
    await expect(page.getByRole("button", { name: localized["New item"] })).toBeVisible();
    const csrf = (await (await page.request.get("/api/v1/session")).json())
      .csrf;
    const response = await page.request.post("/api/v1/documents", {
      headers: { "x-csrf-token": csrf },
      data: {
        kind,
        name: "Drag retry",
        requestId: crypto.randomUUID(),
        entries: Array.from({ length: 25 }, (_, index) => ({
          id: crypto.randomUUID(),
          name: "Row " + index,
          itemId: null,
          quantity: String(index),
          unit: localized["fixture.58561cce9d4d"],
          note: "keep " + index,
          checked: false,
        })),
      },
    });
    expect(response.ok()).toBe(true);
    const doc = await response.json();
    await page.goto(`/${kind}s/${doc.id}`);
    if (kind === "template")
      await page.getByRole("button", { name: localized["Edit mode"], exact: true }).click();
    const rows = page.locator(".entries > .entry");
    const read = async () =>
      await (await page.request.get(`/api/v1/documents/${doc.id}`)).json();
    if (info.project.name === "mobile") {
      const touch = await page.context().newCDPSession(page);
      const start = (await rows.first().locator(".name").boundingBox())!;
      const a = { x: start.x + 16, y: start.y + start.height / 2 };
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [a],
      });
      for (const distance of [25, 50, 75, 100]) {
        await page.waitForTimeout(16);
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: a.x, y: a.y - distance }],
        });
      }
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForTimeout(300);
      await expect(page.locator(".drag-preview,.is-dragging")).toHaveCount(0);
      expect((await read()).entries).toEqual(doc.entries);
      await expect
        .poll(() => page.evaluate(() => document.scrollingElement!.scrollTop))
        .toBeGreaterThan(0);
      await page.evaluate(() => window.scrollTo(0, 0));
      await touch.detach();
    }
    const requests: string[] = [];
    await page.route(`**/api/v1/documents/${doc.id}`, async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      requests.push(route.request().postData()!);
      if (requests.length === 1)
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "Temporary failure" }),
        });
      return route.continue();
    });
    const from = (await rows.first().locator(".name").boundingBox())!;
    const target = (await rows.nth(1).boundingBox())!;
    await page.mouse.move(from.x + 16, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      target.x + target.width / 2,
      target.y + target.height * 0.8,
      { steps: 8 },
    );
    await page.mouse.up();
    await expect(page.getByRole("alert")).toContainText(localized["fixture.bb87c5f2cdbf"]);
    await expect(rows.first()).toHaveAttribute("aria-label", "Row 1");
    await expect(rows.nth(1)).toHaveAttribute("aria-label", "Row 0");
    expect((await read()).entries).toEqual(doc.entries);
    await page
      .getByRole("alert")
      .getByRole("button", { name: localized["Retry save"], exact: true })
      .click();
    const expected = [doc.entries[1], doc.entries[0], ...doc.entries.slice(2)];
    await expect.poll(async () => (await read()).entries).toEqual(expected);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toBe(requests[0]);
    await page.reload();
    await expect(rows.first()).toHaveAttribute("aria-label", "Row 1");
    await expect(rows.nth(1)).toHaveAttribute("aria-label", "Row 0");
  });
}
