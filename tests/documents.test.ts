import { test } from "node:test";
import assert from "node:assert/strict";
import { id } from "../server/db.js";
import { setup, entry } from "./helpers.js";
test("immutable revisions, latest names, independent checks and safe retries", async () => {
  const h = await setup();
  try {
    const item = (
      await h.call("POST", "/items", {
        name: "egg",
        categoryIds: [],
        requestId: id(),
      })
    ).json();
    const template = (
      await h.call("POST", "/documents", {
        kind: "template",
        name: "Meal",
        entries: [entry(item), entry()],
        groups: [],
        requestId: id(),
      })
    ).json();
    const save = {
      name: "Meal 2",
      version: template.version,
      entries: template.entries,
      groups: [],
      requestId: id(),
    };
    assert.equal(
      (await h.call("PUT", "/documents/" + template.id, save)).statusCode,
      200,
    );
    await h.call("PUT", "/documents/" + template.id, save);
    assert.equal(
      (await h.call("GET", "/templates/" + template.id + "/revisions")).json()
        .length,
      2,
    );
    await h.call("PUT", "/items/" + item.id, {
      name: "eggs",
      categoryIds: [],
      version: 1,
    });
    assert.equal(
      (await h.call("GET", "/templates/" + template.id + "/revisions/1")).json()
        .entries[0].name,
      "egg",
    );
    assert.equal(
      (await h.call("GET", "/documents/" + template.id)).json().entries[0].name,
      "eggs",
    );
    const create = {
      action: "instantiate",
      version: 2,
      revision: 1,
      name: "Today",
      requestId: id(),
      resolutions: {},
    };
    const a = (
      await h.call(
        "POST",
        "/documents/" + template.id + "/history-apply",
        create,
      )
    ).json();
    assert.equal(
      (
        await h.call(
          "POST",
          "/documents/" + template.id + "/history-apply",
          create,
        )
      ).json().id,
      a.id,
    );
    const b = (
      await h.call("POST", "/documents/" + template.id + "/history-apply", {
        ...create,
        requestId: id(),
      })
    ).json();
    assert.notEqual(a.entries[0].id, b.entries[0].id);
    const check = { checked: true, requestId: id() };
    await h.call(
      "PUT",
      `/checklists/${a.id}/entries/${a.entries[0].id}/checked`,
      check,
    );
    await h.call(
      "PUT",
      `/checklists/${a.id}/entries/${a.entries[0].id}/checked`,
      { checked: false, requestId: id() },
    );
    await h.call(
      "PUT",
      `/checklists/${a.id}/entries/${a.entries[0].id}/checked`,
      check,
    );
    assert.equal(
      (await h.call("GET", "/documents/" + a.id)).json().entries[0].checked,
      false,
    );
    await h.call(
      "PUT",
      `/checklists/${a.id}/entries/${a.entries[0].id}/checked`,
      { checked: true, requestId: id() },
    );
    await h.call("PUT", "/documents/" + a.id, {
      name: a.name,
      version: a.version,
      entries: a.entries,
      groups: [],
      requestId: id(),
    });
    assert.equal(
      (await h.call("GET", "/documents/" + a.id)).json().entries[0].checked,
      true,
    );
    assert.equal(
      (await h.call("GET", "/documents/" + b.id)).json().entries[0].checked,
      false,
    );
    assert.equal(
      (await h.call("DELETE", "/items/" + item.id, { version: 2 })).statusCode,
      409,
    );
    assert.throws(() =>
      h.store.run(
        "UPDATE template_revisions SET snapshot=? WHERE documentId=?",
        "{}",
        template.id,
      ),
    );
  } finally {
    await h.close();
  }
});
