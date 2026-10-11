import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, id } from "../server/db.js";
import { backupDatabase, restoreDatabase } from "../server/backup.js";
import { setup } from "./helpers.js";
test("online WAL backup and restore preserve data and durable request results", async () => {
  const folder = mkdtempSync(join(tmpdir(), "loom-backup-"));
  const path = join(folder, "live.sqlite"),
    target = join(folder, "backup.sqlite"),
    restored = join(folder, "restored.sqlite");
  const h = await setup(path);
  try {
    const body = { name: "egg", categoryIds: [], requestId: id() };
    const item = (await h.call("POST", "/items", body)).json();
    await backupDatabase(path, target);
    await restoreDatabase(target, restored);
    const h2 = await setup(restored);
    try {
      assert.equal((await h2.call("POST", "/items", body)).json().id, item.id);
      assert.equal(
        h2.store.get("PRAGMA integrity_check").integrity_check,
        "ok",
      );
      assert.deepEqual(h2.store.all("PRAGMA foreign_key_check"), []);
    } finally {
      await h2.close();
    }
    await assert.rejects(
      () => restoreDatabase(target, path),
      /new database path/,
    );
    await assert.rejects(() => backupDatabase(path, target), /already exists/);
  } finally {
    await h.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
test("OpenAPI covers public routes and authentication", async () => {
  const h = await setup();
  try {
    const response = await h.call("GET", "/openapi.json");
    assert.equal(response.statusCode, 200);
    const spec = response.json();
    assert.ok(spec.paths["/api/v1/documents/{id}"].put.requestBody);
    assert.ok(
      spec.paths["/api/v1/documents/{id}"].put.responses["200"].content[
        "application/json"
      ].schema.properties.entries,
    );
    assert.ok(spec.components.securitySchemes.bearer);
  } finally {
    await h.close();
  }
});
