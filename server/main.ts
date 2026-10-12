import { Store } from "./db.js";
import { readConfig } from "./config.js";
import { app } from "./app.js";
const config = readConfig();
const store = new Store(process.env.LOOM_DB || "data/loom.sqlite");
const server = await app(store, config);
await server.listen({
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3000),
});
console.log("Loom listening on", server.server.address());
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await server.close();
    store.close();
    process.exit(0);
  });
