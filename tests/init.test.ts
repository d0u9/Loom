import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, verify } from "../server/db.js";

test("account initialization rejects 9 characters and accepts 10", () => {
  const folder = mkdtempSync(join(tmpdir(), "loom-init-"));
  const path = join(folder, "loom.sqlite");
  const init = (password: string) =>
    spawnSync(process.execPath, ["--import", "tsx", "server/cli.ts", "init"], {
      env: {
        ...process.env,
        LOOM_DB: path,
        LOOM_USER: "admin",
        LOOM_PASSWORD: password,
      },
      encoding: "utf8",
    });
  try {
    const rejected = init("123456789");
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /at least 10 characters/);
    let store = new Store(path);
    assert.equal(store.get("SELECT username FROM account"), undefined);
    store.close();
    const accepted = init("1234567890");
    assert.equal(accepted.status, 0, accepted.stderr);
    store = new Store(path);
    assert.equal(
      verify("1234567890", store.get("SELECT password FROM account").password),
      true,
    );
    store.close();
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
