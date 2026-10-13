import localized from "../locales/zh.json" with { type: "json" };
import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError, setCsrf } from "../web/client.js";

test("empty proxy response produces an actionable API error", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("", { status: 500 }),
  );
  await assert.rejects(
    () => api("/login", "POST", { username: "admin", password: "test" }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 500);
      assert.match(error.message, /HTTP 500/);
      assert.match(error.message, /pnpm dev/);
      return true;
    },
  );
});
test("malformed successful response remains an uncertain failure for safe retries", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response('{"id":', { status: 200 }),
  );
  await assert.rejects(
    () => api("/items", "POST", {}),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 502);
      assert.match(error.message, /HTTP 200/);
      return true;
    },
  );
});
test("valid success and JSON error responses retain their contract", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ csrf: "test" }),
  );
  assert.deepEqual(await api("/session"), { csrf: "test" });
  fetch.mock.mockImplementation(async () =>
    Response.json({ message: "Invalid credentials" }, { status: 401 }),
  );
  await assert.rejects(
    () => api("/login", "POST", {}),
    (error) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.message === localized["Incorrect username or password."],
  );
});

test("CSRF refresh retries exactly once with the original serialized request", async (t) => {
  setCsrf("old");
  const body = { name: "egg", requestId: "same-request" };
  const calls: any[] = [];
  t.mock.method(globalThis, "fetch", async (url: any, options: any) => {
    calls.push({ url, ...options });
    if (calls.length === 1) {
      body.name = "changed while waiting";
      return Response.json({ message: "Invalid CSRF token" }, { status: 403 });
    }
    if (url === "/api/v1/session")
      return Response.json({ csrf: "new", authEnabled: false });
    return Response.json({ id: "created" });
  });
  assert.deepEqual(await api("/items", "POST", body), { id: "created" });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].body, calls[2].body);
  assert.equal(calls[0].headers["x-csrf-token"], "old");
  assert.equal(calls[2].headers["x-csrf-token"], "new");
});
test("CSRF retries stop after one refresh and unrelated failures never refresh", async (t) => {
  const calls: string[] = [];
  const fetch = t.mock.method(globalThis, "fetch", async (url: any) => {
    calls.push(url);
    return url === "/api/v1/session"
      ? Response.json({ csrf: "new" })
      : Response.json({ message: "Invalid CSRF token" }, { status: 403 });
  });
  await assert.rejects(
    () => api("/items", "POST", {}),
    (e) => e instanceof ApiError && e.status === 403,
  );
  assert.deepEqual(calls, [
    "/api/v1/items",
    "/api/v1/session",
    "/api/v1/items",
  ]);
  calls.length = 0;
  fetch.mock.mockImplementation(async (url: any) => {
    calls.push(url);
    return Response.json({ message: "Invalid origin" }, { status: 403 });
  });
  await assert.rejects(() => api("/items", "POST", {}), new RegExp(localized["fixture.5b35e7398eb2"], ""));
  assert.deepEqual(calls, ["/api/v1/items"]);
  calls.length = 0;
  fetch.mock.mockImplementation(async (url: any) => {
    calls.push(url);
    return Response.json({ message: "Conflict" }, { status: 409 });
  });
  await assert.rejects(() => api("/items", "POST", {}), new RegExp(localized["fixture.45fb95610363"], ""));
  assert.deepEqual(calls, ["/api/v1/items"]);
});
