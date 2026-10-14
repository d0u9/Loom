import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, verify } from "../server/db.js";
import { app } from "../server/app.js";

test("first-run setup protects initialization and creates a session only once", async () => {
  const store = new Store(":memory:");
  const server = await app(store, {
    auth: { enabled: true, loginRateLimit: 100 },
  });
  try {
    const initial = await server.inject("/api/v1/session");
    assert.equal(initial.statusCode, 200);
    assert.equal(initial.headers["cache-control"], "no-store");
    const state = initial.json();
    assert.equal(state.setupRequired, true);
    assert.equal(state.authEnabled, true);
    assert.equal((await server.inject("/api/v1/items")).statusCode, 401);
    assert.equal(
      (
        await server.inject({
          url: "/api/v1/session",
          headers: { authorization: "Bearer invalid" },
        })
      ).statusCode,
      401,
    );
    const create = (payload: any, headers: any = {}) =>
      server.inject({ method: "POST", url: "/api/v1/setup", payload, headers });
    const body = { username: " admin ", password: "setup-password" };
    assert.equal((await create(body)).statusCode, 403);
    const headers = { "x-csrf-token": state.csrf };
    assert.equal(
      (await create(body, { ...headers, origin: "https://evil.example" }))
        .statusCode,
      403,
    );
    assert.equal(
      (await create({ ...body, password: "123456789" }, headers)).statusCode,
      400,
    );
    assert.equal(
      (await create({ ...body, username: "   " }, headers)).statusCode,
      400,
    );
    assert.equal(store.get("SELECT username FROM account"), undefined);
    assert.equal(store.all("SELECT * FROM sessions").length, 0);
    const results = await Promise.all([
      create(body, headers),
      create({ ...body, username: "other" }, headers),
    ]);
    assert.deepEqual(results.map((r) => r.statusCode).sort(), [200, 409]);
    const created = results.find((r) => r.statusCode === 200)!;
    assert.equal(created.json().username, "admin");
    assert(
      verify(body.password, store.get("SELECT password FROM account").password),
    );
    const cookie = created.headers["set-cookie"] as string;
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.equal(
      (
        await server.inject({ url: "/api/v1/session", headers: { cookie } })
      ).json().username,
      "admin",
    );
    assert.equal((await server.inject("/api/v1/session")).statusCode, 401);
    assert.equal(
      (await create({ ...body, password: "replace-password" }, headers))
        .statusCode,
      409,
    );
    assert.equal(store.all("SELECT * FROM account").length, 1);
    assert.equal(store.all("SELECT * FROM sessions").length, 1);
  } finally {
    await server.close();
    store.close();
  }
});

test("anonymous mode skips setup and setup attempts are rate limited", async () => {
  const store = new Store(":memory:");
  let server = await app(store, { auth: { enabled: false } });
  try {
    const state = (await server.inject("/api/v1/session")).json();
    assert.equal(state.setupRequired, undefined);
    assert.equal(
      (
        await server.inject({
          method: "POST",
          url: "/api/v1/setup",
          headers: { "x-csrf-token": state.csrf },
          payload: { username: "admin", password: "setup-password" },
        })
      ).statusCode,
      409,
    );
    assert.equal(store.get("SELECT username FROM account"), undefined);
    await server.close();
    server = await app(store, { auth: { enabled: true, loginRateLimit: 1 } });
    const { csrf } = (await server.inject("/api/v1/session")).json();
    const request = {
      method: "POST" as const,
      url: "/api/v1/setup",
      headers: { "x-csrf-token": csrf },
      payload: { username: "admin", password: "short" },
    };
    assert.equal((await server.inject(request)).statusCode, 400);
    assert.equal((await server.inject(request)).statusCode, 429);
  } finally {
    await server.close();
    store.close();
  }
});
