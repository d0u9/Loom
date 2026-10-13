import { test } from "node:test";
import assert from "node:assert/strict";
import { id } from "../server/db.js";
import { setup, entry } from "./helpers.js";
test("current template saves, latest names, independent checks and safe retries", async () => {
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
        requestId: id(),
      })
    ).json();
    const save = {
      name: "Meal 2",
      version: template.version,
      entries: template.entries,
      requestId: id(),
    };
    assert.equal(
      (await h.call("PUT", "/documents/" + template.id, save)).statusCode,
      200,
    );
    await h.call("PUT", "/documents/" + template.id, save);
    await h.call("PUT", "/items/" + item.id, {
      name: "eggs",
      categoryIds: [],
      version: 1,
    });
    assert.equal(
      (await h.call("GET", "/documents/" + template.id)).json().entries[0].name,
      "eggs",
    );
    const create = {
      action: "instantiate",
      version: 2,
      name: "Today",
      requestId: id(),
      resolutions: {},
      useDate: "2026-10-20",
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
    assert.equal(a.name, "Today");
    assert.equal(a.source.revision, undefined);
    assert.equal(a.source.templateName, "Meal 2");
    // Instantiation can schedule the new checklist on the calendar.
    assert.equal(a.useDate, "2026-10-20");
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
  } finally {
    await h.close();
  }
});

test("document creation supports existing request tables with an extra timestamp column", async () => {
  const h = await setup();
  try {
    h.store.run(
      "ALTER TABLE requests ADD COLUMN createdAt INTEGER NOT NULL DEFAULT 0",
    );
    const body = {
      kind: "checklist",
      name: "gogo",
      useDate: null,
      entries: [],
      requestId: id(),
    };
    const response = await h.call("POST", "/documents", body);
    assert.equal(response.statusCode, 200, response.body);
    const retry = await h.call("POST", "/documents", body);
    assert.equal(retry.statusCode, 200, retry.body);
    assert.deepEqual(retry.json(), response.json());
    assert.equal(h.store.all("SELECT id FROM documents").length, 1);
  } finally {
    await h.close();
  }
});
