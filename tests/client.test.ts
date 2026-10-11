import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../web/client.js";

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
      error.message === "Invalid credentials",
  );
});
