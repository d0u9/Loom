import { Store, password, requireThat } from "./db.js";
import { backupDatabase, restoreDatabase } from "./backup.js";
const command = process.argv[2],
  path = process.env.LOOM_DB || "data/loom.sqlite";
if (command === "backup") {
  requireThat(process.argv[3], "Specify backup path");
  await backupDatabase(path, process.argv[3]);
  console.log("Backup complete");
} else if (command === "restore") {
  requireThat(process.argv[3], "Specify backup path");
  await restoreDatabase(process.argv[3], path);
  console.log("Restore complete");
} else {
  requireThat(
    command === "init",
    "Usage: cli init | backup PATH | restore PATH",
  );
  const store = new Store(path);
  try {
    store.tx(() => {
      requireThat(
        !store.get("SELECT username FROM account"),
        "Account already initialized",
      );
      requireThat(
        process.env.LOOM_PASSWORD && process.env.LOOM_PASSWORD.length >= 12,
        "Set LOOM_PASSWORD to at least 12 characters",
      );
      store.run(
        "INSERT INTO account VALUES(?,?)",
        process.env.LOOM_USER || "admin",
        password(process.env.LOOM_PASSWORD),
      );
    });
    console.log("Account initialized");
  } finally {
    store.close();
  }
}
