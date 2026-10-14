import localized from "../locales/zh.json" with { type: "json" };
import { test, expect } from "@playwright/test";
import { children, nodeId } from "../shared/groups.js";

// Every case starts from the same mixed root / two-level / empty-section tree.
const cases = [
  ["downward before item", "R1", "R3", "before", null, "R1,R3"],
  ["upward after item", "R3", "R1", "after", null, "R1,R3"],
  ["downward after item", "R1", "R3", "after", null, "R3,R1"],
  ["upward before item", "R3", "R1", "before", null, "R3,R1"],
  ["adjacent before stays", "R2", "R3", "before", null, "R2,R3"],
  ["adjacent after stays", "R3", "R2", "after", null, "R2,R3"],
  ["within chapter before", "A1", "A2", "before", "A", "A1,A2"],
  ["within chapter after", "A2", "A1", "after", "A", "A1,A2"],
  ["root into chapter before item", "R1", "A2", "before", "A", "R1,A2"],
  ["root into chapter after item", "R3", "A1", "after", "A", "A1,R3"],
  ["root into second level before", "R1", "B1", "before", "B", "R1,B1"],
  ["root into second level after", "R3", "B1", "after", "B", "B1,R3"],
  ["second level to root before", "B1", "R3", "before", null, "B1,R3"],
  ["second level to root after", "B1", "R1", "after", null, "R1,B1"],
  ["cross chapter before", "B1", "A2", "before", "A", "B1,A2"],
  ["cross chapter after", "A2", "B1", "after", "B", "B1,A2"],
  ["above chapter from above", "R1", "C", "before", null, "R1,C"],
  ["above chapter from below", "R3", "A", "before", null, "R3,A"],
  ["prepend into populated chapter", "R3", "A", "into", "A", "R3,A1"],
  ["prepend into second level", "R1", "B", "into", "B", "R1,B1"],
  ["into empty folded chapter", "R1", "C", "into", "C", "R1", "fold"],
  ["into populated folded chapter", "R3", "A", "into", "A", "R3,A1", "fold"],
  ["section before root item", "C", "R1", "before", null, "C,R1"],
  ["section after root item", "A", "R3", "after", null, "R3,A"],
  ["promote section before root", "B", "R3", "before", null, "B,R3"],
  ["promote section after root", "B", "R1", "after", null, "R1,B"],
  ["leaf section into another", "B", "C", "into", "C", "B"],
  ["reject third level", "C", "B", "into", null, "", "reject"],
  ["reject deep subtree", "A", "C", "into", null, "", "reject"],
  ["reject own descendant", "A", "B1", "before", null, "", "reject"],
  ["reject own child", "A", "B", "into", null, "", "reject"],
  ["self drop", "R1", "R1", "before", null, "", "reject"],
  ["gap above root from above", "R1", "R3", "before", null, "R1,R3", "gap"],
  ["gap above root from below", "R3", "R2", "before", null, "R3,R2", "gap"],
  ["escape cancels", "R1", "R3", "after", null, "", "escape"],
  ["pointer cancellation", "R1", "R3", "after", null, "", "cancel"],
  [
    "middle of item selects after",
    "R1",
    "R3",
    "after",
    null,
    "R3,R1",
    "middle",
  ],
  ["middle of chapter selects inside", "R3", "C", "into", "C", "R3", "middle"],
  [
    "folded section carries subtree",
    "A",
    "R3",
    "after",
    null,
    "R3,A",
    "fold-source",
  ],
  ["outside list cancels", "R1", "R3", "after", null, "", "outside"],
] as const;

for (const kind of ["template", "checklist"]) {
  test(`${kind}: all drag positions follow the drop point`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    await page.setViewportSize({
      width: info.project.name === "mobile" ? 390 : 1280,
      height: 1200,
    });
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
    for (const input of info.project.name === "mobile"
      ? ["mouse", "touch"]
      : ["mouse"]) {
      const session =
        input === "touch" ? await page.context().newCDPSession(page) : null;
      for (const [
        label,
        fromName,
        toName,
        place,
        parent,
        adjacent,
        mode,
      ] of cases) {
        await test.step(input + ": " + label, async () => {
          const ids = Object.fromEntries(
            ["R1", "R2", "R3", "A1", "A2", "B1", "A", "B", "C"].map((name) => [
              name,
              crypto.randomUUID(),
            ]),
          );
          const response = await page.request.post("/api/v1/documents", {
            headers: { "x-csrf-token": csrf },
            data: {
              kind,
              name: label,
              requestId: crypto.randomUUID(),
              entries: ["R1", "R2", "R3", "A1", "A2", "B1"].map((name) => ({
                id: ids[name],
                name,
                itemId: null,
                sectionId: name.startsWith("A")
                  ? ids.A
                  : name === "B1"
                    ? ids.B
                    : null,
                quantity: "2",
                unit: localized["fixture.58561cce9d4d"],
                note: "preserve " + name,
                checked: false,
              })),
              sections: [
                {
                  id: ids.A,
                  name: "A",
                  parentSectionId: null,
                  afterEntryId: ids.R1,
                },
                {
                  id: ids.B,
                  name: "B",
                  parentSectionId: ids.A,
                  afterEntryId: ids.A1,
                },
                {
                  id: ids.C,
                  name: "C",
                  parentSectionId: null,
                  afterEntryId: label.startsWith("adjacent") ? ids.R3 : ids.R2,
                },
              ],
            },
          });
          expect(response.ok()).toBe(true);
          const original = await response.json();
          const nodes = [...original.entries, ...original.sections];
          const idFor = (name: string) =>
            nodes.find((n) => n.name === name)!.id;
          const names = new Map(nodes.map((n) => [n.id, n.name]));
          const row = (name: string) =>
            page.locator(`[data-sort-id="${idFor(name)}"]`);
          await page.goto(`/${kind}s/${original.id}`);
          await page
            .getByRole("button", {
              name: localized["Edit mode"],
              exact: true,
            })
            .click();
          if (mode === "fold")
            await row(toName)
              .getByRole("button", {
                name: localized["Collapse "] + toName,
                exact: true,
              })
              .click();
          if (mode === "fold-source")
            await row(fromName)
              .getByRole("button", {
                name: localized["Collapse "] + fromName,
                exact: true,
              })
              .click();
          const source = (await row(fromName)
            .locator("strong,.name")
            .boundingBox())!;
          const target = (await row(toName).boundingBox())!;
          const a = {
            x: source.x + Math.min(16, source.width / 2),
            y: source.y + source.height / 2,
          };
          const b = {
            x: target.x + target.width / 2,
            y:
              mode === "outside"
                ? 16
                : mode === "middle"
                  ? target.y + target.height / 2
                  : mode === "gap"
                    ? target.y - 3
                    : target.y +
                      target.height * (place === "before" ? 0.2 : 0.8),
          };
          if (mode === "outside") b.x = 0;
          if (session) {
            await session.send("Input.dispatchTouchEvent", {
              type: "touchStart",
              touchPoints: [a],
            });
            await page.waitForTimeout(280);
            await expect(page.locator(".drag-preview")).toBeVisible();
            await session.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [b],
            });
          } else {
            await page.mouse.move(a.x, a.y);
            await page.mouse.down();
            await page.mouse.move(b.x, b.y, { steps: 8 });
            await expect(page.locator(".drag-preview")).toBeVisible();
          }
          if (
            !mode ||
            mode === "gap" ||
            mode === "fold" ||
            mode === "middle" ||
            mode === "fold-source"
          )
            await expect(row(toName)).toHaveClass(
              new RegExp("drop-" + (place === "into" ? "hover" : place)),
            );
          if (mode === "escape") await page.keyboard.press("Escape");
          if (session)
            await session.send("Input.dispatchTouchEvent", {
              type: mode === "cancel" ? "touchCancel" : "touchEnd",
              touchPoints: [],
            });
          else {
            if (mode === "cancel")
              await row(fromName).dispatchEvent("pointercancel", {
                pointerType: "mouse",
              });
            await page.mouse.up();
          }
          await expect(
            page.locator(
              ".drag-preview,.is-dragging,.drop-before,.drop-after,.drop-hover",
            ),
          ).toHaveCount(0);
          await expect(page.locator("input.name:not(:disabled)")).toHaveCount(
            0,
          );
          const read = async () =>
            await (
              await page.request.get(`/api/v1/documents/${original.id}`)
            ).json();
          await expect
            .poll(async () => {
              const saved = await read();
              if (
                mode === "reject" ||
                mode === "escape" ||
                mode === "cancel" ||
                mode === "outside"
              )
                return JSON.stringify([saved.entries, saved.sections]);
              const order = children(saved, parent ? idFor(parent) : null).map(
                (n) => names.get(nodeId(n)),
              );
              return adjacent.includes(",")
                ? order
                    .slice(
                      order.indexOf(adjacent.split(",")[0]),
                      order.indexOf(adjacent.split(",")[0]) + 2,
                    )
                    .join(",")
                : order[0];
            })
            .toBe(
              mode === "reject" ||
                mode === "escape" ||
                mode === "cancel" ||
                mode === "outside"
                ? JSON.stringify([original.entries, original.sections])
                : adjacent,
            );
          const saved = await read();
          expect(
            saved.entries
              .map((e: any) => [
                e.id,
                e.name,
                e.itemId,
                e.quantity,
                e.unit,
                e.note,
                e.checked,
              ])
              .sort(),
          ).toEqual(
            original.entries
              .map((e: any) => [
                e.id,
                e.name,
                e.itemId,
                e.quantity,
                e.unit,
                e.note,
                e.checked,
              ])
              .sort(),
          );
          expect(saved.sections.map((s: any) => s.id).sort()).toEqual(
            original.sections.map((s: any) => s.id).sort(),
          );
          if (mode === "fold")
            await expect(
              row(toName).getByRole("button", {
                name: localized["Collapse "] + toName,
                exact: true,
              }),
            ).toBeVisible();
          if (fromName === "B")
            expect(
              saved.entries.find((e: any) => e.name === "B1").sectionId,
            ).toBe(idFor("B"));
          for (const entry of original.entries)
            if (entry.name !== fromName)
              expect(
                saved.entries.find((e: any) => e.id === entry.id).sectionId,
              ).toBe(entry.sectionId);
          for (const section of original.sections)
            if (section.name !== fromName)
              expect(
                saved.sections.find((s: any) => s.id === section.id)
                  .parentSectionId,
              ).toBe(section.parentSectionId);
        });
      }
      await session?.detach();
    }
  });
}
