import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

for (const kind of ["template", "checklist"]) {
  test(`${kind}: a background save does not cancel dragging or restore stale content`, async ({
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
    for (const input of info.project.name === "mobile"
      ? ["mouse", "touch"]
      : ["mouse"]) {
      const response = await page.request.post("/api/v1/documents", {
        headers: { "x-csrf-token": csrf },
        data: {
          kind,
          name: "Drag during save",
          requestId: crypto.randomUUID(),
          entries: ["First", "Second"].map((name) => ({
            id: crypto.randomUUID(),
            name,
            itemId: null,
            quantity: "2",
            unit: localized["fixture.58561cce9d4d"],
            note: "keep " + name,
            checked: false,
          })),
        },
      });
      expect(response.ok()).toBe(true);
      const doc = await response.json();
      await page.goto(`/${kind}s/${doc.id}`);
      if (kind === "template")
        await page
          .getByRole("button", { name: localized["Edit mode"], exact: true })
          .click();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let writes = 0;
      await page.route(`**/api/v1/documents/${doc.id}`, async (route) => {
        if (route.request().method() === "PUT" && ++writes === 1) {
          const saved = await route.fetch();
          await gate;
          return route.fulfill({ response: saved });
        }
        return route.continue();
      });
      await page.getByLabel(localized["New temporary entry"], { exact: true }).fill("Pending");
      await page.getByLabel(localized["New temporary entry"], { exact: true }).press("Enter");
      await expect.poll(() => writes).toBe(1);
      const row = page.locator(`[data-sort-id="${doc.entries[0].id}"]`);
      const target = page.locator(`[data-sort-id="${doc.entries[1].id}"]`);
      const sourceBox = (await row.locator(".name").boundingBox())!;
      const targetBox = (await target.boundingBox())!;
      const a = { x: sourceBox.x + 16, y: sourceBox.y + sourceBox.height / 2 };
      const b = {
        x: targetBox.x + targetBox.width / 2,
        y: targetBox.y + targetBox.height * 0.8,
      };
      const touch =
        input === "touch" ? await page.context().newCDPSession(page) : null;
      if (touch) {
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [a],
        });
        await page.waitForTimeout(280);
      } else {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move(a.x + 8, a.y + 8);
      }
      await expect(page.locator(".drag-preview")).toBeVisible();
      release();
      await expect(page.getByRole("status")).toContainText(localized["Saved"]);
      await expect(page.locator(".drag-preview")).toBeVisible();
      if (touch)
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [b],
        });
      else await page.mouse.move(b.x, b.y, { steps: 8 });
      await expect(target).toHaveClass(/drop-after/);
      if (touch) {
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await touch.detach();
      } else await page.mouse.up();
      await expect(page.locator(".drag-preview,.is-dragging")).toHaveCount(0);
      await expect
        .poll(async () => {
          const saved = await (
            await page.request.get(`/api/v1/documents/${doc.id}`)
          ).json();
          return saved.entries.map((e: any) => [
            e.name,
            e.quantity,
            e.unit,
            e.note,
          ]);
        })
        .toEqual([
          ["Second", "2", localized["fixture.58561cce9d4d"], "keep Second"],
          ["First", "2", localized["fixture.58561cce9d4d"], "keep First"],
          ["Pending", "", "", ""],
        ]);
      expect(writes).toBe(2);
    }
  });
}
