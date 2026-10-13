import { test } from "node:test";
import assert from "node:assert/strict";
import { id } from "../server/db.js";
import { setup, entry } from "./helpers.js";
import { addItems } from "../shared/groups.js";

test("category addition is an ordered one-time selection and preserves existing entry state", async () => {
  const h = await setup();
  try {
    const cat = (await h.call("POST", "/categories", { name: "Food" })).json();
    const items = [];
    for (const name of ["egg", "water", "milk"])
      items.push(
        (
          await h.call("POST", "/items", {
            name,
            categoryIds: [cat.id],
            requestId: id(),
          })
        ).json(),
      );
    const order = [items[2].id, items[0].id, items[1].id];
    await h.call("PUT", `/categories/${cat.id}/order`, {
      version: cat.version,
      itemIds: order,
      requestId: id(),
    });
    let d = (
      await h.call("POST", "/documents", {
        kind: "checklist",
        name: "Food",
        entries: [entry(items[0])],
        requestId: id(),
      })
    ).json();
    await h.call(
      "PUT",
      `/checklists/${d.id}/entries/${d.entries[0].id}/checked`,
      { checked: true, requestId: id() },
    );
    d = (await h.call("GET", `/documents/${d.id}`)).json();
    const original = d.entries[0];
    const add = async () => {
      const { itemIds } = (
        await h.call("GET", `/categories/${cat.id}/order`)
      ).json();
      const all = (await h.call("GET", "/items")).json();
      const members = itemIds.map((k: string) =>
        all.find((i: any) => i.id === k),
      );
      const saved = await h.call("PUT", `/documents/${d.id}`, {
        name: d.name,
        version: d.version,
        entries: addItems(d, members, id).entries,
        sections: d.sections,
        requestId: id(),
      });
      assert.equal(saved.statusCode, 200, saved.body);
      d = saved.json();
    };
    await add();
    assert.deepEqual(
      d.entries.map((e: any) => e.itemId),
      [items[0].id, items[2].id, items[1].id],
    );
    assert.deepEqual(d.entries[0], original);
    await add();
    assert.equal(d.entries.length, 3);
    await h.call("PUT", `/items/${items[0].id}`, {
      name: "egg",
      categoryIds: [],
      version: items[0].version,
    });
    await add();
    assert.deepEqual(
      d.entries[0],
      original,
      "removing a category membership never removes a document entry",
    );
    const content = {
      ...d,
      entries: d.entries.filter((e: any) => e.id !== d.entries[1].id),
    };
    d = (
      await h.call("PUT", `/documents/${d.id}`, {
        name: d.name,
        version: d.version,
        ...content,
        requestId: id(),
      })
    ).json();
    assert.equal(d.entries.length, 2);
    await add();
    assert.equal(
      d.entries.length,
      3,
      "explicit repeat addition re-adds deleted entries without exclusions",
    );
    assert.equal(d.entries[2].itemId, items[2].id);
  } finally {
    await h.close();
  }
});
