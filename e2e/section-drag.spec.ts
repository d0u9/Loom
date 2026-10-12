import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";

test("dragging changes section levels and moves entries into any section", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "mouse drag; touch shares SortableRow");
  await page.goto("/items");
  await page.getByLabel(localized["Password"], { exact: true }).fill("loom-browser-password");
  await page.getByRole("button", { name: localized["Sign in"], exact: true }).click();
  await expect(page.getByRole("button", { name: localized["fixture.aa7084084271"] })).toBeVisible();
  const csrf = (await (await page.request.get("/api/v1/session")).json()).csrf;
  const [a, b, c] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const doc = await (
    await page.request.post("/api/v1/documents", {
      headers: { "x-csrf-token": csrf },
      data: {
        kind: "checklist",
        name: "Section drag",
        groups: [],
        sections: [
          { id: a, name: "L1", parentSectionId: null },
          { id: b, name: "L2", parentSectionId: a },
          { id: c, name: "Root", parentSectionId: null },
        ],
        entries: [
          {
            id: crypto.randomUUID(),
            itemId: null,
            name: "X",
            quantity: "",
            unit: "",
            note: "",
            checked: false,
            direct: true,
            groupIds: [],
            sectionId: null,
          },
        ],
        requestId: crypto.randomUUID(),
      },
    })
  ).json();
  await page.goto("/checklists/" + doc.id);
  const head = (name: string) =>
    page.locator(".section-heading", { hasText: name });
  // Grab rows away from inputs/buttons; land on the target's upper or lower part.
  const drag = async (from: any, to: any, part: number) => {
    const f = (await from.boundingBox())!;
    const t = (await to.boundingBox())!;
    await page.mouse.move(f.x + Math.min(200, f.width / 2), f.y + f.height / 2);
    await page.mouse.down();
    await page.mouse.move(t.x + 200, t.y + t.height * part, { steps: 10 });
    await page.mouse.up();
  };
  const parentOf = async (name: string) => {
    const d = await (await page.request.get("/api/v1/documents/" + doc.id)).json();
    const section = d.sections.find((s: any) => s.name === name);
    return d.sections.find((s: any) => s.id === section.parentSectionId)?.name ?? null;
  };
  // Upper half: sibling of the target, so level 2 becomes level 1.
  await drag(head("L2"), head("L1"), 0.2);
  await expect.poll(() => parentOf("L2")).toBe(null);
  // Lower half: nests into the target.
  await drag(head("L2"), head("L1"), 0.8);
  await expect.poll(() => parentOf("L2")).toBe("L1");
  // A third level is refused: Root stays at level 1.
  await drag(head("Root"), head("L2"), 0.8);
  await page.waitForTimeout(300);
  expect(await parentOf("Root")).toBe(null);
  // Entries nest into any heading via its lower half.
  await drag(
    page.locator(".entry[data-sort-id]:not(.section-heading)").first().locator(".entry-source-count"),
    head("L2"),
    0.8,
  );
  await expect
    .poll(async () => {
      const d = await (await page.request.get("/api/v1/documents/" + doc.id)).json();
      return d.sections.find((s: any) => s.id === d.entries[0].sectionId)?.name;
    })
    .toBe("L2");
});
