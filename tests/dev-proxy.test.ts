import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import config from "../vite.config.js";
import { app } from "../server/app.js";
import { Store } from "../server/db.js";

test("development proxy preserves login origin protection", async () => {
  const store = new Store(":memory:");
  const backend = await app(store);
  await backend.listen({ host: "127.0.0.1", port: 0 });
  const address = backend.server.address();
  assert.ok(address && typeof address !== "string");
  const frontend = await createServer({
    configFile: false,
    server: {
      host: "127.0.0.1",
      port: 0,
      proxy: {
        "/api": {
          ...(config.server!.proxy!["/api"] as object),
          target: `http://127.0.0.1:${address.port}`,
        },
      },
    },
  });
  try {
    await frontend.listen();
    const frontAddress = frontend.httpServer!.address();
    assert.ok(frontAddress && typeof frontAddress !== "string");
    const origin = `http://127.0.0.1:${frontAddress.port}`;
    for (const [requestOrigin, status] of [
      [origin, 401],
      ["https://other.example", 403],
    ] as const) {
      const response = await fetch(`${origin}/api/v1/login`, {
        method: "POST",
        headers: { origin: requestOrigin, "content-type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "invalid" }),
      });
      assert.equal(response.status, status);
      assert.equal(
        (await response.json()).message,
        status === 401 ? "Invalid credentials" : "Invalid origin",
      );
    }
  } finally {
    await frontend.close();
    await backend.close();
    store.close();
  }
});
