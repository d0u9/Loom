import { test } from "node:test";
import assert from "node:assert/strict";
import { id } from "../server/db.js";
import { setup, entry } from "./helpers.js";
import { removeEntry } from "../shared/groups.js";
test("direct member previews reject stale members; merge preserves state and all sources", async () => {
  const h = await setup();
  try {
    const cat = async (name: string, parentId: string | null = null) =>
      (await h.call("POST", "/categories", { name, parentId })).json();
    const food = await cat("Food"),
      sub = food,
      lab = await cat("Lab");
    const egg = (
      await h.call("POST", "/items", {
        name: "egg",
        categoryIds: [sub.id, lab.id],
        requestId: id(),
      })
    ).json();
    let d = (
      await h.call("POST", "/documents", {
        kind: "checklist",
        name: "Mix",
        entries: [entry(egg)],
        groups: [],
        requestId: id(),
      })
    ).json();
    await h.call(
      "PUT",
      `/checklists/${d.id}/entries/${d.entries[0].id}/checked`,
      { checked: true, requestId: id() },
    );
    const preview = async (categoryId: string, groupId?: string) =>
      (
        await h.call("POST", "/documents/" + d.id + "/category-preview", {
          entries: d.entries,
          groups: d.groups,
          version: d.version,
          categoryId,
          ...(groupId ? { groupId } : {}),
        })
      ).json();
    const apply = async (categoryId: string, p: any, mode = "merge") => {
      const response = await h.call(
        "POST",
        "/documents/" + d.id + "/category-compose",
        {
          entries: d.entries,
          groups: d.groups,
          version: d.version,
          categoryId,
          expected: p.expected,
          choices: { [egg.id]: { mode, targetId: d.entries[0].id } },
          removeIds: [],
        },
      );
      assert.equal(response.statusCode, 200, response.body);
      const c = response.json();
      const saved = await h.call("PUT", "/documents/" + d.id, {
        name: d.name,
        version: d.version,
        ...c,
        requestId: id(),
      });
      assert.equal(saved.statusCode, 200, saved.body);
      d = saved.json();
    };
    const first = await preview(food.id);
    await apply(food.id, first);
    await apply(lab.id, await preview(lab.id));
    assert.equal(d.entries.length, 1);
    assert.equal(d.entries[0].groupIds.length, 2);
    assert.equal(d.entries[0].quantity, "2");
    assert.equal(d.entries[0].checked, true);
    assert.equal(
      (await h.call("DELETE", "/categories/" + food.id, { version: 1 }))
        .statusCode,
      409,
    );
    const stale = await preview(food.id, d.groups[0].id);
    await h.call("POST", "/items", {
      name: "water",
      categoryIds: [sub.id],
      requestId: id(),
    });
    assert.equal(
      (
        await h.call("POST", "/documents/" + d.id + "/category-compose", {
          entries: d.entries,
          groups: d.groups,
          version: d.version,
          categoryId: food.id,
          groupId: d.groups[0].id,
          expected: stale.expected,
        })
      ).statusCode,
      409,
    );
    const added = await preview(lab.id);
    await apply(lab.id, added);
    assert.equal(d.groups.length, 2);
    assert.equal(d.entries.length, 1);
    let content = removeEntry(d, d.entries[0].id);
    assert.deepEqual(
      content.groups.map((g) => g.excluded),
      [[egg.id], [egg.id]],
    );
    d = (
      await h.call("PUT", "/documents/" + d.id, {
        name: d.name,
        version: d.version,
        ...content,
        requestId: id(),
      })
    ).json();
    // Update preview lists excluded members; apply keeps them out unless restored.
    const compose = async (restore?: string[]) =>
      h.call("POST", "/documents/" + d.id + "/category-compose", {
        entries: d.entries,
        groups: d.groups,
        version: d.version,
        categoryId: food.id,
        groupId: d.groups[0].id,
        expected: (await preview(food.id, d.groups[0].id)).expected,
        ...(restore ? { restore } : {}),
      });
    const excludedPreview = await preview(food.id, d.groups[0].id);
    assert.deepEqual(
      excludedPreview.excluded.map((i: any) => i.id),
      [egg.id],
    );
    assert.ok(!excludedPreview.added.some((i: any) => i.id === egg.id));
    const kept = (await compose()).json();
    assert.ok(!kept.entries.some((e: any) => e.itemId === egg.id));
    assert.deepEqual(kept.groups[0].excluded, [egg.id]);
    const restored = (await compose([egg.id])).json();
    assert.ok(restored.entries.some((e: any) => e.itemId === egg.id));
    assert.deepEqual(restored.groups[0].excluded, []);
    assert.equal(
      (await compose([lab.id])).statusCode,
      400,
      "only excluded current members can be restored",
    );
  } finally {
    await h.close();
  }
});
