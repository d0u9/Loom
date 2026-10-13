import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("document entries reorder by keyboard and drag, notes edit in a modal", async ({
  page,
}, info) => {
  await page.goto("/items");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await expect(page.getByRole("button", { name: localized["New item"] })).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const entry = (name: string) => ({
    id: crypto.randomUUID(),
    itemId: null,
    name: name + info.project.name,
    quantity: "",
    unit: "",
    note: "",
    checked: false,
    direct: true,
    groupIds: [],
  });
  const doc = await (
    await page.request.post("/api/v1/documents", {
      headers: { "x-csrf-token": csrf },
      data: {
        kind: "checklist",
        name: "Entries " + info.project.name,
        groups: [],
        entries: [entry("A"), entry("B"), entry("C")],
        requestId: crypto.randomUUID(),
      },
    })
  ).json();
  await page.goto("/checklists/" + doc.id);
  const names = () =>
    page.locator(".entry[data-sort-id] .name").evaluateAll((els) =>
      // Idle temporary names render as buttons, editing ones as inputs.
      els.map((el) =>
        ((el as HTMLInputElement).value || el.textContent!).slice(0, 1),
      ),
    );
  await expect.poll(names).toEqual(["A", "B", "C"]);
  await expect(page.getByRole("button", { name: new RegExp(localized["fixture.cfc7ae4882ff"], "") })).toHaveCount(0);

  await page.locator(".entry[data-sort-id]").first().focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(names).toEqual(["B", "A", "C"]);
  // Saved entries stay checkable right after a reorder.
  await page.getByLabel(localized["fixture.c9bba6ddc6b6"] + info.project.name).click();
  await expect(page.getByLabel(localized["fixture.c9bba6ddc6b6"] + info.project.name)).toBeChecked();
  await expect(page.getByRole("status")).toHaveText(new RegExp(localized["Saved"], ""));
  await page.getByLabel(localized["fixture.c9bba6ddc6b6"] + info.project.name).click();
  await expect(page.getByLabel(localized["fixture.c9bba6ddc6b6"] + info.project.name)).not.toBeChecked();
  // Circles stay visible while the reorder autosaves.
  expect(
    await page
      .locator(".entry input[type=checkbox]")
      .first()
      .evaluate((el) => getComputedStyle(el).borderTopColor),
  ).not.toBe("rgba(0, 0, 0, 0)");

  if (info.project.name === "desktop") {
    const rows = page.locator(".entry[data-sort-id]");
    const from = (await rows
      .nth(2)
      .locator(".entry-source-count")
      .boundingBox())!;
    const to = (await rows
      .nth(0)
      .locator(".entry-source-count")
      .boundingBox())!;
    await page.mouse.move(from.x + 4, from.y + 4);
    await page.mouse.down();
    await page.mouse.move(to.x + 4, to.y + 4, { steps: 8 });
    // The row copy follows the pointer and a line marks the landing spot.
    await expect(page.locator(".drag-preview .name")).toHaveText(/^C/);
    await expect(rows.nth(0)).toHaveClass(/drop-before/);
    await page.mouse.up();
    await expect(page.locator(".drag-preview, .drop-before")).toHaveCount(0);
    await expect.poll(names).toEqual(["C", "B", "A"]);
  }

  const note = page.getByRole("button", {
    name: localized["fixture.beef2896db00"] + info.project.name,
  });
  if (!(await note.isVisible()))
    await page
      .getByLabel(localized["fixture.bae2ce3e5309"] + info.project.name, { exact: true })
      .click();
  await note.click();
  const dialog = page.getByRole("dialog", { name: localized["Edit note"] });
  await dialog.getByLabel(localized["Note"]).fill("Two packs");
  await dialog.getByRole("button", { name: localized["Save"], exact: true }).click();
  await expect(page.locator(".entry-note")).toHaveText("Two packs");
  expect(
    await page
      .locator(".entry-note")
      .evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe("12px");
  expect(
    await page
      .getByLabel(localized["fixture.68d8e1692653"] + info.project.name)
      .evaluate((el) => getComputedStyle(el).borderRadius),
  ).toBe("50%");

  // Sections reorder by keyboard and accept dropped entries.
  const s1 = crypto.randomUUID(),
    s2 = crypto.randomUUID();
  const sectioned = await (
    await page.request.post("/api/v1/documents", {
      headers: { "x-csrf-token": csrf },
      data: {
        kind: "checklist",
        name: "Sections " + info.project.name,
        groups: [],
        sections: [
          { id: s1, name: "S1", parentSectionId: null },
          { id: s2, name: "S2", parentSectionId: null },
        ],
        entries: [entry("X")],
        requestId: crypto.randomUUID(),
      },
    })
  ).json();
  await page.goto("/checklists/" + sectioned.id);
  const headings = () =>
    page.locator(".section-heading strong").allTextContents();
  await expect.poll(headings).toEqual(["S1", "S2"]);
  await page.getByLabel(localized["fixture.755bc33fa9ae"], { exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(headings).toEqual(["S2", "S1"]);
  // An entry's arrow keys walk visible rows: down enters the next section,
  // up leaves it again.
  const rowOrder = () =>
    page
      .locator(".entry[data-sort-id]")
      .evaluateAll((els) =>
        els.map((el) =>
          el.classList.contains("section-heading")
            ? el.querySelector("strong")!.textContent
            : (
                (el.querySelector(".name") as HTMLInputElement).value ||
                el.querySelector(".name")!.textContent
              ).slice(0, 1),
        ),
      );
  await expect.poll(rowOrder).toEqual(["X", "S2", "S1"]);
  await page.getByLabel("X" + info.project.name, { exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(rowOrder).toEqual(["S2", "X", "S1"]);
  await page.keyboard.press("ArrowUp");
  await expect.poll(rowOrder).toEqual(["X", "S2", "S1"]);
  if (info.project.name === "desktop") {
    const x = (await page
      .locator(".entry[data-sort-id] .entry-source-count")
      .first()
      .boundingBox())!;
    const target = (await page
      .getByLabel(localized["fixture.755bc33fa9ae"], { exact: true })
      .boundingBox())!;
    await page.mouse.move(x.x + 4, x.y + 4);
    await page.mouse.down();
    // Lower half of a heading nests the entry into that section.
    await page.mouse.move(target.x + 40, target.y + target.height - 6, {
      steps: 8,
    });
    await expect(page.getByLabel(localized["fixture.755bc33fa9ae"], { exact: true })).toHaveClass(
      /drop-hover/,
    );
    await page.mouse.up();
    // X now sits under S1, which is the last row.
    await expect(page.locator(".entries > .entry").last()).toHaveAttribute(
      "aria-label",
      "X" + info.project.name,
    );
  }

  // Item-linked names are read-only text, so dragging can start on them.
  if (info.project.name === "desktop") {
    const item = await (
      await page.request.post("/api/v1/items", {
        headers: { "x-csrf-token": csrf },
        data: {
          name: "Linked " + info.project.name,
          note: "",
          categoryIds: [],
          requestId: crypto.randomUUID(),
        },
      })
    ).json();
    const linked = await (
      await page.request.post("/api/v1/documents", {
        headers: { "x-csrf-token": csrf },
        data: {
          kind: "checklist",
          name: "Linked " + info.project.name,
          groups: [],
          entries: [
            entry("P"),
            { ...entry("L"), itemId: item.id, name: item.name },
          ],
          requestId: crypto.randomUUID(),
        },
      })
    ).json();
    await page.goto("/checklists/" + linked.id);
    await expect.poll(names).toEqual(["P", "L"]);
    const from = (await page
      .locator(".entry[data-sort-id] .name")
      .nth(1)
      .boundingBox())!;
    const to = (await page
      .locator(".entry[data-sort-id] .entry-source-count")
      .first()
      .boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 4, to.y + 4, { steps: 8 });
    await page.mouse.up();
    await expect.poll(names).toEqual(["L", "P"]);
  }
});
