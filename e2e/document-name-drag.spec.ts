import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

for (const kind of ["template", "checklist"]) {
  test(`${kind}: drag temporary names without opening the name editor`, async ({
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
    const csrf = (await (await page.request.get("/api/v1/session")).json())
      .csrf;
    let sectionId = crypto.randomUUID();
    let entryId = crypto.randomUUID();
    const response = await page.request.post("/api/v1/documents", {
      headers: { "x-csrf-token": csrf },
      data: {
        kind,
        name: "Name drag " + info.project.name,
        sections: [{ id: sectionId, name: "Target", parentSectionId: null }],
        entries: [
          {
            id: entryId,
            itemId: null,
            name: "Temporary",
            sectionId: null,
            quantity: "2",
            unit: localized["fixture.58561cce9d4d"],
            note: "keep this",
            checked: kind === "checklist",
          },
        ],
        requestId: crypto.randomUUID(),
      },
    });
    expect(response.ok()).toBe(true);
    const doc = await response.json();
    sectionId = doc.sections[0].id;
    entryId = doc.entries[0].id;
    await page.goto(`/${kind}s/${doc.id}`);
    await page
      .getByRole("button", { name: localized["Edit mode"], exact: true })
      .click();
    if (kind === "checklist")
      await page
        .getByRole("checkbox", {
          name: localized["fixture.3d65f5053109"],
          exact: true,
        })
        .check();
    const row = page.locator(`[data-sort-id="${entryId}"]`);
    const heading = page.locator(`[data-sort-id="${sectionId}"]`);
    const name = row.getByRole("button", {
      name: localized["Entry name"],
      exact: true,
    });
    const editor = row.locator("input.name");
    async function drag(cancel = false, touch = false) {
      const from = (await name.boundingBox())!;
      const to = (await heading.boundingBox())!;
      const a = { x: from.x + 16, y: from.y + from.height / 2 };
      const b = { x: to.x + to.width / 2, y: to.y + to.height * 0.8 };
      if (touch) {
        const session = await page.context().newCDPSession(page);
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [a],
        });
        await page.waitForTimeout(300);
        await expect(page.locator(".drag-preview")).toBeVisible();
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [b],
        });
        await expect(heading).toHaveClass(/drop-hover/);
        if (cancel) await page.keyboard.press("Escape");
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        await session.detach();
      } else {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.mouse.move(b.x, b.y, { steps: 8 });
        await expect(page.locator(".drag-preview")).toBeVisible();
        await expect(heading).toHaveClass(/drop-hover/);
        if (cancel) await page.keyboard.press("Escape");
        await page.mouse.up();
      }
      await expect(page.locator(".drag-preview")).toHaveCount(0);
      await expect(row).not.toHaveClass(/is-dragging/);
      await expect(heading).not.toHaveClass(/drop-hover/);
      await expect(editor).toHaveCount(0);
    }
    // Mouse dragging must also work in the computer's narrow mobile preview.
    await drag(true);
    await expect(row).toHaveAttribute("data-depth", "0");
    if (info.project.name === "mobile") await drag(true, true);
    await drag();
    await expect(row).toHaveAttribute("data-depth", "1");
    await row.focus();
    await page.keyboard.press("ArrowUp");
    await expect(row).toHaveAttribute("data-depth", "0");
    await drag(false, info.project.name === "mobile");
    await expect(row).toHaveAttribute("data-depth", "1");

    // A normal click still edits; typing and selecting text must not drag.
    await name.click();
    await expect(editor).toBeFocused();
    await editor.fill("Renamed");
    const inputBox = (await editor.boundingBox())!;
    const targetBox = (await heading.boundingBox())!;
    await page.mouse.move(inputBox.x + 16, inputBox.y + inputBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      targetBox.x + 16,
      targetBox.y + targetBox.height / 2,
      { steps: 8 },
    );
    await expect(page.locator(".drag-preview")).toHaveCount(0);
    await page.mouse.up();
    await editor.press("Enter");
    await expect(name).toHaveText("Renamed");
    await expect
      .poll(async () => {
        const saved = await (
          await page.request.get(`/api/v1/documents/${doc.id}`)
        ).json();
        const entry = saved.entries.find((e: any) => e.id === entryId);
        return [
          entry.name,
          entry.sectionId,
          entry.quantity,
          entry.unit,
          entry.note,
          entry.checked,
        ];
      })
      .toEqual([
        "Renamed",
        sectionId,
        "2",
        localized["fixture.58561cce9d4d"],
        "keep this",
        kind === "checklist",
      ]);
  });
}
