import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setup } from "./helpers.js";
import { capture } from "./golden.js";
import { id } from "../server/db.js";

// v7.sqlite was written by the pre-refactor schema; v7.json is its API output.
test("old databases upgrade in place, read back identically and reopen idempotently", async () => {
  const folder = mkdtempSync(join(tmpdir(), "loom-schema-"));
  const path = join(folder, "loom.sqlite");
  copyFileSync(new URL("./fixtures/v7.sqlite", import.meta.url), path);
  const golden = JSON.parse(
    readFileSync(new URL("./fixtures/v7.json", import.meta.url), "utf8"),
  );
  try {
    for (let open = 0; open < 2; open++) {
      const h = await setup(path);
      try {
        assert.deepEqual(await capture(h.call), golden);
        assert.equal(
          h.store.get("PRAGMA integrity_check").integrity_check,
          "ok",
        );
        assert.deepEqual(h.store.all("PRAGMA foreign_key_check"), []);
      } finally {
        await h.close();
      }
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("database constraints hold without the application", async () => {
  const h = await setup();
  try {
    const item = (
      await h.call("POST", "/items", {
        name: "egg",
        categoryIds: [],
        requestId: id(),
      })
    ).json();
    const entry = {
      id: id(),
      itemId: item.id,
      name: "egg",
      quantity: "",
      unit: "",
      note: "",
      direct: true,
      groupIds: [],
      checked: false,
    };
    const d = (
      await h.call("POST", "/documents", {
        kind: "template",
        name: "t",
        entries: [entry],
        groups: [],
        sections: [{ id: id(), name: "S", parentSectionId: null }],
        requestId: id(),
      })
    ).json();
    const raw =
      (sql: string, ...args: any[]) =>
      () =>
        h.store.run(sql, ...args);
    // One entry per Item per document.
    assert.throws(
      raw(
        "INSERT INTO entries(id,documentId,itemId,name,quantity,unit,note,position) VALUES(?,?,?,?,?,?,?,?)",
        id(),
        d.id,
        item.id,
        "egg",
        "",
        "",
        "",
        1,
      ),
    );
    // Referenced Items cannot be deleted; revisions are immutable.
    assert.throws(raw("DELETE FROM items WHERE id=?", item.id));
    assert.throws(
      raw(
        "UPDATE template_revisions SET snapshot='{}' WHERE documentId=?",
        d.id,
      ),
    );
    // Deleting a document removes everything it owns.
    h.store.run("DELETE FROM documents WHERE id=?", d.id);
    for (const table of ["entries", "groups", "template_revisions"])
      assert.equal(
        h.store.get(
          `SELECT COUNT(*) AS n FROM ${table} WHERE documentId=?`,
          d.id,
        ).n,
        0,
      );
    assert.deepEqual(h.store.all("PRAGMA foreign_key_check"), []);
  } finally {
    await h.close();
  }
});
