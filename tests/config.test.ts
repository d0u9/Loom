import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readConfig } from "../server/config.js";
import { Store, id } from "../server/db.js";
import { app } from "../server/app.js";

test("global config accepts explicit booleans and rejects malformed or missing custom files", () => {
  const folder = mkdtempSync(join(tmpdir(), "loom-config-")),
    path = join(folder, "config.json");
  try {
    for (const enabled of [true, false]) {
      writeFileSync(path, JSON.stringify({ auth: { enabled } }));
      assert.equal(readConfig(path).auth.enabled, enabled);
    }
    for (const content of [
      "{",
      "null",
      "[]",
      "{}",
      '{"auth":{"enabled":"false"}}',
      '{"auth":{"enabled":false,"typo":true}}',
      '{"auth":{"enabled":false},"other":1}',
    ]) {
      writeFileSync(path, content);
      assert.throws(() => readConfig(path), /Invalid Loom config/);
    }
    assert.throws(
      () => readConfig(join(folder, "missing.json")),
      /Invalid Loom config/,
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test("anonymous mode works without an account, preserves CSRF and re-enabling auth protects existing data", async () => {
  const store = new Store(":memory:");
  let server = await app(store, { auth: { enabled: false } });
  try {
    const session = (await server.inject("/api/v1/session")).json();
    assert.equal(session.authEnabled, false);
    assert.match(session.csrf, /^[0-9a-f]{64}$/);
    assert.equal((await server.inject("/api/v1/items")).statusCode, 200);
    const body = { name: "anonymous", categoryIds: [], requestId: id() };
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/v1/items",
          payload: body,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/v1/items",
          headers: {
            "x-csrf-token": session.csrf,
            origin: "https://other.example",
          },
          payload: body,
        })
      ).statusCode,
      403,
    );
    const r = await server.inject({
      method: "POST",
      url: "/api/v1/items",
      headers: { "x-csrf-token": session.csrf, origin: "http://localhost:80" },
      payload: body,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/v1/items",
          headers: { "x-csrf-token": session.csrf },
          payload: body,
        })
      ).json().id,
      r.json().id,
    );
    assert.equal(
      (
        await server.inject({
          url: "/api/v1/items",
          headers: { authorization: "Bearer revoked" },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/v1/login",
          payload: { username: "admin", password: "anything" },
        })
      ).statusCode,
      409,
    );
    assert.deepEqual(
      (await server.inject("/api/v1/openapi.json")).json().security,
      [],
    );
    assert.equal(store.all("SELECT * FROM account").length, 0);
    assert.equal(store.all("SELECT * FROM sessions").length, 0);
    await server.close();
    server = await app(store);
    assert.equal((await server.inject("/api/v1/items")).statusCode, 401);
    assert.equal((await server.inject("/api/v1/session")).statusCode, 401);
    assert.equal(store.all("SELECT * FROM items").length, 1);
  } finally {
    await server.close();
    store.close();
  }
});
