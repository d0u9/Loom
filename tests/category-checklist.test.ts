import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { id } from "../server/db.js";

test("Category creates an independent checklist atomically with version and retry protection", async () => {
  const h = await setup();
  try {
    const category = (
      await h.call("POST", "/categories", {
        name: "Groceries",
        requestId: id(),
      })
    ).json();
    const item = (
      await h.call("POST", "/items", {
        name: "Egg",
        categoryIds: [category.id],
        requestId: id(),
      })
    ).json();
    const current = (await h.call("GET", "/categories"))
      .json()
      .find((c: any) => c.id === category.id);
    const body = {
      name: "Shopping",
      memberIds: [item.id],
      useDate: "2026-10-26",
      version: current.version,
      requestId: id(),
    };
    const response = await h.call(
      "POST",
      `/categories/${category.id}/checklists`,
      body,
    );
    assert.equal(response.statusCode, 200, response.body);
    const doc = response.json();
    assert.equal(doc.kind, "checklist");
    assert.equal(doc.useDate, body.useDate);
    assert.equal(doc.entries.length, 1);
    assert.equal(doc.entries[0].itemId, item.id);
    assert.equal(doc.entries[0].checked, false);
    assert.equal(doc.entries[0].direct, false);
    assert.deepEqual(doc.entries[0].groupIds, [doc.groups[0].id]);
    assert.equal(doc.groups[0].categoryId, category.id);
    assert.deepEqual(doc.groups[0].members, [item.id]);
    assert.deepEqual(
      (
        await h.call("POST", `/categories/${category.id}/checklists`, body)
      ).json(),
      doc,
    );
    assert.equal(
      (
        await h.call("POST", `/categories/${category.id}/checklists`, {
          ...body,
          name: "Changed",
        })
      ).statusCode,
      409,
    );
    await h.call("POST", "/items", {
      name: "Milk",
      categoryIds: [category.id],
      requestId: id(),
    });
    assert.equal(
      (await h.call("GET", `/documents/${doc.id}`)).json().entries.length,
      1,
    );
    assert.equal(
      (
        await h.call("POST", `/categories/${category.id}/checklists`, {
          ...body,
          requestId: id(),
        })
      ).statusCode,
      409,
    );
    assert.equal(h.store.all("SELECT * FROM documents").length, 1);
    const empty = (
      await h.call("POST", "/categories", { name: "Empty", requestId: id() })
    ).json();
    const emptyDoc = (
      await h.call("POST", `/categories/${empty.id}/checklists`, {
        name: "Empty checklist",
        memberIds: [],
        version: empty.version,
        requestId: id(),
      })
    ).json();
    assert.equal(emptyDoc.entries.length, 0);
    assert.equal(emptyDoc.groups[0].categoryId, empty.id);
  } finally {
    await h.close();
  }
});

test("Category checklist preserves saved member order", async () => {
  const h = await setup();
  try {
    const category = (
      await h.call("POST", "/categories", { name: "Ordered", requestId: id() })
    ).json();
    for (const name of ["A", "B", "C"])
      await h.call("POST", "/items", {
        name,
        categoryIds: [category.id],
        requestId: id(),
      });
    const order = (
      await h.call("GET", `/categories/${category.id}/order`)
    ).json();
    const desired = h.store.members(category.id).reverse();
    const updated = (
      await h.call("PUT", `/categories/${category.id}/order`, {
        version: order.version,
        itemIds: desired,
        requestId: id(),
      })
    ).json();
    const r = await h.call("POST", `/categories/${category.id}/checklists`, {
      name: "Ordered checklist",
      version: updated.version,
      memberIds: desired,
      requestId: id(),
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(
      r.json().entries.map((e: any) => e.itemId),
      desired,
    );
  } finally {
    await h.close();
  }
});
