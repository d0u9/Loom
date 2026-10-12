import { app } from "../server/app.js";
import test from "node:test";
import assert from "node:assert/strict";
import { Store, id } from "../server/db.js";
import { setup } from "./helpers.js";
test("checklist dates validate, preserve on old writes/archive/restore, and reset on copy", async () => {
  const h = await setup();
  try {
    const create = (useDate: string | null, kind = "checklist") =>
      h.call("POST", "/documents", {
        kind,
        name: "Dated",
        entries: [],
        groups: [],
        useDate,
        requestId: id(),
      });
    for (const date of ["2026-02-30", "2026-13-01", "0000-01-01", "2026-2-1"])
      assert.equal((await create(date)).statusCode, 400);
    assert.equal((await create("2026-10-11", "template")).statusCode, 400);
    let d = (await create("2026-10-11")).json();
    assert.equal(d.useDate, "2026-10-11");
    assert.equal(
      (await h.call("GET", "/documents")).json().find((x: any) => x.id === d.id)
        .useDate,
      d.useDate,
    );
    d = (
      await h.call("PUT", `/documents/${d.id}`, {
        name: d.name,
        entries: [],
        groups: [],
        version: d.version,
        requestId: id(),
      })
    ).json();
    assert.equal(d.useDate, "2026-10-11");
    d = (
      await h.call("POST", `/checklists/${d.id}/archive`, {
        version: d.version,
        requestId: id(),
      })
    ).json();
    assert.equal(d.useDate, "2026-10-11");
    const apply = (action: string) =>
      h.call("POST", `/documents/${d.id}/history-apply`, {
        action,
        name: d.name,
        version: d.version,
        resolutions: {},
        requestId: id(),
      });
    assert.equal((await apply("copy")).json().useDate, null);
    d = (await apply("restore")).json();
    assert.equal(d.useDate, "2026-10-11");
    d = (
      await h.call("PUT", `/documents/${d.id}`, {
        name: d.name,
        entries: [],
        groups: [],
        version: d.version,
        useDate: null,
        requestId: id(),
      })
    ).json();
    assert.equal(d.useDate, null);
  } finally {
    await h.close();
  }
});
