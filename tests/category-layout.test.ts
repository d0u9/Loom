import { test } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { id } from "../server/db.js";

test("category sections retain membership, validate complete layouts, and retry atomically", async () => {
  const h = await setup();
  try {
    const a = (await h.call("POST", "/categories", { name: "A" })).json();
    const b = (await h.call("POST", "/categories", { name: "B" })).json();
    const item = (
      await h.call("POST", "/items", {
        name: "Shared",
        categoryIds: [a.id, b.id],
        requestId: id(),
      })
    ).json();
    const before = (await h.call("GET", "/category-layout")).json();
    const section = id();
    const body = {
      version: before.version,
      rootPosition: 1,
      requestId: id(),
      sections: [{ id: section, name: "Travel" }],
      categories: [
        { id: b.id, sectionId: section },
        { id: a.id, sectionId: null },
      ],
    };
    const saved = await h.call("PUT", "/category-layout", body);
    assert.equal(saved.statusCode, 200);
    assert.equal(saved.json().version, before.version + 1);
    assert.equal(saved.json().rootPosition, 1);
    assert.deepEqual(saved.json().categories, body.categories);
    assert.deepEqual(
      (await h.call("PUT", "/category-layout", body)).json(),
      saved.json(),
    );
    assert.equal(
      (await h.call("PUT", "/category-layout", { ...body, requestId: id() }))
        .statusCode,
      409,
    );
    assert.equal(
      (await h.call("PUT", "/category-layout", { ...body, sections: [] }))
        .statusCode,
      409,
    );
    const next = { ...body, version: saved.json().version, requestId: id() };
    assert.equal(
      (
        await h.call("PUT", "/category-layout", {
          ...next,
          categories: [body.categories[0], body.categories[0]],
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await h.call("PUT", "/category-layout", { ...next, sections: [] }))
        .statusCode,
      400,
    );
    assert.deepEqual(
      (await h.call("GET", "/category-layout")).json(),
      saved.json(),
    );
    const promoted = await h.call("PUT", "/category-layout", {
      ...next,
      requestId: id(),
      sections: [],
      rootPosition: 0,
      categories: body.categories.map((c) => ({ ...c, sectionId: null })),
    });
    assert.equal(promoted.statusCode, 200);
    assert.deepEqual(
      promoted.json().categories.map((c: any) => c.id),
      [b.id, a.id],
    );
    assert.deepEqual(
      (await h.call("GET", `/categories/${a.id}/members`)).json().itemIds,
      [item.id],
    );
    assert.deepEqual(
      (await h.call("GET", `/categories/${b.id}/members`)).json().itemIds,
      [item.id],
    );
    assert.equal(h.store.all("PRAGMA foreign_key_check").length, 0);
  } finally {
    await h.close();
  }
});

test("template organization shares layout rules and keeps document content independent", async () => {
  const h = await setup();
  try {
    const create = async (kind: string) => {
      const response = await h.call("POST", "/documents", {
        kind,
        name: kind,
        requestId: id(),
        sections: [{ id: id(), name: "Inside", parentSectionId: null }],
        entries: [],
      });
      assert.equal(response.statusCode, 200);
      return response.json();
    };
    const initial = (await h.call("GET", "/template-layout")).json();
    const template = await create("template");
    const checklist = await create("checklist");
    const before = (await h.call("GET", "/template-layout")).json();
    assert.equal(before.version, initial.version + 1);
    assert.deepEqual(before.templates, [{ id: template.id, sectionId: null }]);
    const section = id();
    const body = {
      ...before,
      requestId: id(),
      rootPosition: 1,
      sections: [{ id: section, name: "Travel" }],
      templates: [{ id: template.id, sectionId: section }],
    };
    const response = await h.call("PUT", "/template-layout", body);
    assert.equal(response.statusCode, 200);
    const saved = response.json();
    assert.deepEqual(
      (await h.call("PUT", "/template-layout", body)).json(),
      saved,
    );
    assert.equal(
      (await h.call("PUT", "/template-layout", { ...body, requestId: id() }))
        .statusCode,
      409,
    );
    assert.equal(
      (
        await h.call("PUT", "/template-layout", {
          ...body,
          version: saved.version,
          requestId: id(),
          templates: [{ id: checklist.id, sectionId: null }],
        })
      ).statusCode,
      409,
    );
    assert.deepEqual((await h.call("GET", "/template-layout")).json(), saved);
    assert.deepEqual(
      (await h.call("GET", `/documents/${template.id}`)).json(),
      template,
    );
    assert.deepEqual(
      (await h.call("GET", "/category-layout")).json().sections,
      [],
    );
    const promoted = await h.call("PUT", "/template-layout", {
      ...saved,
      requestId: id(),
      rootPosition: 0,
      sections: [],
      templates: [{ id: template.id, sectionId: null }],
    });
    assert.equal(promoted.statusCode, 200);
    assert.equal(
      (
        await h.call("DELETE", `/templates/${template.id}`, {
          version: template.version,
          confirm: true,
        })
      ).statusCode,
      200,
    );
    const after = (await h.call("GET", "/template-layout")).json();
    assert.equal(after.version, promoted.json().version + 1);
    assert.deepEqual(after.templates, []);
    assert.deepEqual(h.store.all("PRAGMA foreign_key_check"), []);
  } finally {
    await h.close();
  }
});
