import { test } from "node:test";
import assert from "node:assert/strict";
import { id } from "../server/db.js";
import { setup, entry } from "./helpers.js";
test("archive releases references, missing resources restore safely, copies reset checks", async () => {
  const h = await setup();
  try {
    const category = (
      await h.call("POST", "/categories", { name: "Food", parentId: null })
    ).json();
    const egg = (
      await h.call("POST", "/items", {
        name: "egg",
        categoryIds: [],
        requestId: id(),
      })
    ).json();
    const group = {
      id: id(),
      categoryId: category.id,
      originalCategoryId: category.id,
      name: "Food",
      members: [],
      excluded: [],
    };
    const e = { ...entry(egg), direct: false, groupIds: [group.id] };
    let d = (
      await h.call("POST", "/documents", {
        kind: "checklist",
        name: "Today",
        entries: [e],
        groups: [group],
        requestId: id(),
      })
    ).json();
    await h.call(
      "PUT",
      `/checklists/${d.id}/entries/${d.entries[0].id}/checked`,
      { checked: true, requestId: id() },
    );
    d = (
      await h.call("POST", "/checklists/" + d.id + "/archive", {
        version: d.version,
        requestId: id(),
      })
    ).json();
    assert.equal(d.status, "archived");
    assert.equal(d.entries[0].checked, true);
    // List progress for archived checklists comes from the snapshot.
    const listed = (await h.call("GET", "/documents"))
      .json()
      .find((x: any) => x.id === d.id);
    assert.deepEqual([listed.total, listed.done, listed.archive], [1, 1, undefined]);
    assert.equal(
      (
        await h.call("PUT", "/documents/" + d.id, {
          name: "bad",
          entries: [],
          groups: [],
          version: d.version,
          requestId: id(),
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await h.call("DELETE", "/items/" + egg.id, { version: 1 })).statusCode,
      200,
    );
    assert.equal(
      (await h.call("DELETE", "/categories/" + category.id, { version: 1 }))
        .statusCode,
      200,
    );
    const preview = (
      await h.call("POST", "/documents/" + d.id + "/history-preview", {
        action: "restore",
        version: d.version,
      })
    ).json();
    assert.equal(preview.items.length, 1);
    assert.equal(preview.categories.length, 1);
    const body = {
      action: "restore",
      version: d.version,
      name: d.name,
      requestId: id(),
      resolutions: { [egg.id]: { mode: "temporary" } },
    };
    const restored = (
      await h.call("POST", "/documents/" + d.id + "/history-apply", body)
    ).json();
    assert.equal(restored.status, "active");
    assert.equal(restored.entries[0].checked, true);
    assert.equal(restored.entries[0].itemId, null);
    assert.equal(restored.groups[0].categoryId, null);
    assert.equal(
      (
        await h.call("POST", "/documents/" + d.id + "/history-apply", body)
      ).json().id,
      d.id,
    );
    const copy = (
      await h.call("POST", "/documents/" + d.id + "/history-apply", {
        action: "copy",
        version: restored.version,
        name: "Copy",
        requestId: id(),
        resolutions: {},
      })
    ).json();
    assert.equal(copy.entries[0].checked, false);
    assert.notEqual(copy.entries[0].id, restored.entries[0].id);
    const template = (
      await h.call("POST", "/documents/" + copy.id + "/history-apply", {
        action: "template",
        version: copy.version,
        name: "New Template",
        requestId: id(),
        resolutions: {},
      })
    ).json();
    assert.equal(template.kind, "template");
    const instance = (
      await h.call("POST", "/documents/" + template.id + "/history-apply", {
        action: "instantiate",
        version: template.version,
        resolutions: {},
        revision: 1,
        name: "From history",
        requestId: id(),
      })
    ).json();
    assert.equal(instance.groups[0].categoryId, null);
    assert.equal(
      (
        await h.call("DELETE", "/templates/" + template.id, {
          version: template.version,
          confirm: true,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (await h.call("GET", "/documents/" + instance.id)).statusCode,
      200,
    );
  } finally {
    await h.close();
  }
});
test("missing Item creation is atomic and retry-safe", async () => {
  const h = await setup();
  try {
    const egg = (
      await h.call("POST", "/items", {
        name: "egg",
        categoryIds: [],
        requestId: id(),
      })
    ).json();
    let d = (
      await h.call("POST", "/documents", {
        kind: "checklist",
        name: "Old",
        entries: [entry(egg)],
        groups: [],
        requestId: id(),
      })
    ).json();
    d = (
      await h.call("POST", "/checklists/" + d.id + "/archive", {
        version: 1,
        requestId: id(),
      })
    ).json();
    await h.call("DELETE", "/items/" + egg.id, { version: 1 });
    const body = {
      action: "copy",
      version: d.version,
      name: "Copy",
      requestId: id(),
      resolutions: { [egg.id]: { mode: "new", name: "new egg" } },
    };
    const a = await h.call(
      "POST",
      "/documents/" + d.id + "/history-apply",
      body,
    );
    assert.equal(a.statusCode, 200, a.body);
    assert.equal(
      (
        await h.call("POST", "/documents/" + d.id + "/history-apply", body)
      ).json().id,
      a.json().id,
    );
    assert.equal((await h.call("GET", "/items")).json().length, 1);
    const replacement = a.json().entries[0].itemId;
    const linked = await h.call(
      "POST",
      "/documents/" + d.id + "/history-apply",
      {
        ...body,
        requestId: id(),
        resolutions: { [egg.id]: { mode: "existing", itemId: replacement } },
      },
    );
    assert.equal(linked.statusCode, 200, linked.body);
    assert.equal(linked.json().entries[0].itemId, replacement);

    assert.equal(
      (await h.call("GET", "/documents/" + d.id)).json().entries[0].name,
      "egg",
    );
  } finally {
    await h.close();
  }
});
test("checklist delete removes the document and releases Item references", async () => {
  const h = await setup();
  try {
    const egg = (
      await h.call("POST", "/items", {
        name: "egg",
        categoryIds: [],
        requestId: id(),
      })
    ).json();
    const d = (
      await h.call("POST", "/documents", {
        kind: "checklist",
        name: "Once",
        entries: [entry(egg)],
        groups: [],
        requestId: id(),
      })
    ).json();
    const template = (
      await h.call("POST", "/documents", {
        kind: "template",
        name: "T",
        entries: [],
        groups: [],
        requestId: id(),
      })
    ).json();
    assert.equal(
      (
        await h.call("DELETE", "/checklists/" + template.id, {
          version: template.version,
          confirm: true,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await h.call("DELETE", "/checklists/" + d.id, {
          version: d.version + 1,
          confirm: true,
        })
      ).statusCode,
      409,
    );
    const listed = (await h.call("GET", "/documents"))
      .json()
      .find((x: any) => x.id === d.id);
    assert.deepEqual([listed.total, listed.done], [1, 0]);
    const ok = await h.call("DELETE", "/checklists/" + d.id, {
      version: d.version,
      confirm: true,
    });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.equal((await h.call("GET", "/documents/" + d.id)).statusCode, 404);
    assert.equal(
      (await h.call("DELETE", "/items/" + egg.id, { version: egg.version }))
        .statusCode,
      200,
    );
  } finally {
    await h.close();
  }
});
