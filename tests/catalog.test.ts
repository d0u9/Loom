import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, password, id } from "../server/db.js";
import { app } from "../server/app.js";
test("catalog validates hierarchy, references, CSRF, versions and request replay", async () => {
  const store = new Store(":memory:");
  store.run(
    "INSERT INTO account VALUES(?,?)",
    "admin",
    password("a-long-test-password"),
  );
  const server = await app(store);
  try {
    assert.equal((await server.inject("/api/v1/items")).statusCode, 401);
    const login = await server.inject({
      method: "POST",
      url: "/api/v1/login",
      payload: { username: "admin", password: "a-long-test-password" },
    });
    const cookie = login.headers["set-cookie"]!.toString().split(";")[0],
      csrf = login.json().csrf;
    const call = async (method: any, url: string, payload?: any) =>
      await server.inject({
        method,
        url: "/api/v1" + url,
        headers: { cookie, "x-csrf-token": csrf },
        payload,
      });
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/v1/categories",
          headers: { cookie },
          payload: { name: "bad", parentId: null },
        })
      ).statusCode,
      403,
    );
    const root = (
      await call("POST", "/categories", { name: "Food", parentId: null })
    ).json();
    const child = (
      await call("POST", "/categories", {
        name: "Ingredients",
        parentId: root.id,
      })
    ).json();
    assert.equal(
      (
        await call("PUT", "/categories/" + root.id, {
          name: "Food",
          parentId: child.id,
          version: 1,
        })
      ).statusCode,
      400,
    );
    const body = {
      requestId: id(),
      name: "egg",
      categoryIds: [root.id, child.id],
    };
    const egg = (await call("POST", "/items", body)).json();
    assert.equal((await call("POST", "/items", body)).json().id, egg.id);
    assert.equal(
      (
        await call("POST", "/items", {
          categoryIds: body.categoryIds,
          name: body.name,
          requestId: body.requestId,
        })
      ).json().id,
      egg.id,
    );
    assert.equal(
      (await call("POST", "/items", { ...body, name: "water" })).statusCode,
      409,
    );
    assert.deepEqual(
      (await call("GET", "/categories/" + root.id + "/members")).json().itemIds,
      [egg.id],
    );
    assert.equal(
      (await call("DELETE", "/items/" + egg.id, { version: 1 })).statusCode,
      409,
    );
    assert.equal(
      (
        await call("PUT", "/items/" + egg.id, {
          name: "eggs",
          categoryIds: [],
          version: 1,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await call("PUT", "/items/" + egg.id, {
          name: "stale",
          categoryIds: [],
          version: 1,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await call("DELETE", "/items/" + egg.id, { version: 2 })).statusCode,
      200,
    );
  } finally {
    await server.close();
    store.close();
  }
});
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("SQLite catalog survives reopening", () => {
  const directory = mkdtempSync(join(tmpdir(), "loom-"));
  try {
    const path = join(directory, "loom.sqlite");
    let store = new Store(path);
    store.run("INSERT INTO items(id,name) VALUES(?,?)", id(), "persistent");
    store.close();
    store = new Store(path);
    assert.equal(store.all("SELECT name FROM items")[0].name, "persistent");
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("login throttling and origin protection", async () => {
  const store = new Store(":memory:");
  const server = await app(store);
  try {
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/v1/login",
          headers: { origin: "https://other.example" },
          payload: { username: "admin", password: "invalid" },
        })
      ).statusCode,
      403,
    );
    for (let i = 0; i < 10; i++)
      await server.inject({
        method: "POST",
        url: "/api/v1/login",
        payload: { username: "admin", password: "invalid" },
      });
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/v1/login",
          payload: { username: "admin", password: "invalid" },
        })
      ).statusCode,
      429,
    );
  } finally {
    await server.close();
    store.close();
  }
});
import { setup } from "./helpers.js";
test("revoked API token cannot read or write", async () => {
  const h = await setup();
  try {
    const created = (await h.call("POST", "/tokens", { name: "CLI" })).json();
    const headers = { authorization: "Bearer " + created.token };
    assert.equal(
      (await h.server.inject({ url: "/api/v1/items", headers })).statusCode,
      200,
    );
    await h.call("DELETE", "/tokens/" + created.id);
    assert.equal(
      (await h.server.inject({ url: "/api/v1/items", headers })).statusCode,
      401,
    );
  } finally {
    await h.close();
  }
});
