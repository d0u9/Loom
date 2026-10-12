import { DatabaseSync, backup } from "node:sqlite";
import { existsSync, renameSync, rmSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { requireThat, id } from "./db.js";
export async function backupDatabase(source: string, target: string) {
  requireThat(existsSync(source), "Database does not exist");
  requireThat(
    resolve(source) !== resolve(target),
    "Backup must use another path",
  );
  requireThat(!existsSync(target), "Backup target already exists");
  mkdirSync(dirname(target), { recursive: true });
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    await backup(db, target);
  } finally {
    db.close();
  }
}
export async function restoreDatabase(source: string, target: string) {
  requireThat(existsSync(source), "Backup does not exist");
  requireThat(
    !existsSync(target),
    "Restore requires a new database path; stop the server and preserve old data first",
  );
  requireThat(
    !existsSync(target + "-wal") && !existsSync(target + "-shm"),
    "Remove or preserve stale WAL files before restore",
  );
  const check = new DatabaseSync(source, { readOnly: true });
  try {
    requireThat(
      check.prepare("PRAGMA integrity_check").get()!.integrity_check === "ok",
      "Backup failed integrity check",
    );
    requireThat(
      !!(
        check.prepare("PRAGMA user_version").get()!.user_version ||
        check
          .prepare("SELECT 1 FROM sqlite_master WHERE name='migrations'")
          .get()
      ),
      "Not a Loom database",
    );
  } finally {
    check.close();
  }
  const temporary = target + "." + id() + ".tmp";
  try {
    await backupDatabase(source, temporary);
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}
