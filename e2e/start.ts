import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, password } from "../server/db.js";
import { app } from "../server/app.js";
const folder = mkdtempSync(join(tmpdir(), "loom-e2e-"));
const store = new Store(join(folder, "loom.sqlite"));
store.run(
  "INSERT INTO account VALUES(?,?)",
  "admin",
  password("loom-browser-password"),
);
// Simulated desktop/mobile clients arrive through the local test proxy.
process.env.TRUST_PROXY = "loopback";
const server = await app(store);
await server.listen({ host: "127.0.0.1", port: 3100 });
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, async () => {
    await server.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
    process.exit(0);
  });
