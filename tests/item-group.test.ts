import test from "node:test";
import assert from "node:assert/strict";
import { Store, id } from "../server/db.js";
import { app } from "../server/app.js";

test("Item groups migrate safely, filter and survive old callers", async () => {
  const store = new Store(":memory:");
  const legacy = id();
  store.run("INSERT INTO items(id,name) VALUES(?,?)", legacy, "old");
  let server = await app(store, { auth: { enabled: false } });
  try {
    const csrf = (await server.inject("/api/v1/session")).json().csrf;
    const call = (method: any, path: string, payload?: any) =>
      server.inject({
        method,
        url: "/api/v1" + path,
        payload,
        headers: { "x-csrf-token": csrf },
      });
    assert.equal(store.resource("items", legacy).itemGroup, null);
    const body = {
      name: "egg",
      categoryIds: [],
      itemGroup: "  Food  ",
      requestId: id(),
    };
    const create = await call("POST", "/items", body);
    assert.equal(create.statusCode, 200);
    const item = create.json();
    assert.equal(item.itemGroup, "Food");
    assert.deepEqual((await call("POST", "/items", body)).json(), item);
    assert.deepEqual(
      (await call("GET", "/items?itemGroup=Food")).json().map((x: any) => x.id),
      [item.id],
    );
    assert.deepEqual(
      (await call("GET", "/items?itemGroup=")).json().map((x: any) => x.id),
      [legacy],
    );
    assert.equal(
      (await call("GET", "/items?itemGroup=Missing")).json().length,
      0,
    );
    const update = { name: "renamed", categoryIds: [], version: item.version };
    const preserved = (await call("PUT", "/items/" + item.id, update)).json();
    assert.equal(preserved.itemGroup, "Food");
    assert.equal(
      (await call("PUT", "/items/" + item.id, { ...update, itemGroup: null }))
        .statusCode,
      409,
    );
    for (const itemGroup of [[], {}, "x".repeat(201)]) {
      assert.equal(
        (
          await call("PUT", "/items/" + item.id, {
            ...update,
            version: preserved.version,
            itemGroup,
          })
        ).statusCode,
        400,
      );
    }
    const cleared = (
      await call("PUT", "/items/" + item.id, {
        ...update,
        version: preserved.version,
        itemGroup: null,
      })
    ).json();
    assert.equal(cleared.itemGroup, null);
    assert.equal((await call("GET", "/items?itemGroup=")).json().length, 2);
    const assigned = (
      await call("PUT", "/items/" + item.id, {
        ...update,
        version: cleared.version,
        itemGroup: "Drink",
      })
    ).json();
    assert.equal(assigned.itemGroup, "Drink");
    await server.close();
    server = await app(store, { auth: { enabled: false } });
    assert.equal(store.resource("items", item.id).itemGroup, "Drink");
    assert.equal(store.get("PRAGMA user_version").user_version, 8);
    assert.equal(store.resource("items", legacy).name, "old");
  } finally {
    await server.close();
    store.close();
  }
});
