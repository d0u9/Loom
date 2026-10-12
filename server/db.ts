import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  randomUUID,
  scryptSync,
  timingSafeEqual,
  randomBytes,
  createHash,
} from "node:crypto";
export const id = () => randomUUID();
export class Problem extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details: unknown = null,
  ) {
    super(message);
  }
}
export function requireThat(
  ok: unknown,
  message: string,
  code = 400,
): asserts ok {
  if (!ok) throw new Problem(code, message);
}
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY)",
    );
    this.migrate(
      1,
      `
    CREATE TABLE IF NOT EXISTS account(username TEXT PRIMARY KEY,password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tokens(id TEXT PRIMARY KEY,name TEXT NOT NULL,hash TEXT UNIQUE NOT NULL);
    CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,name TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS categories(id TEXT PRIMARY KEY,name TEXT NOT NULL,parentId TEXT REFERENCES categories(id) ON DELETE RESTRICT,version INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS item_categories(itemId TEXT REFERENCES items(id) ON DELETE RESTRICT,categoryId TEXT REFERENCES categories(id) ON DELETE RESTRICT,PRIMARY KEY(itemId,categoryId));
    CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,scope TEXT NOT NULL,digest TEXT NOT NULL,result TEXT NOT NULL);
  `,
    );
  }
  migrate(version: number, sql: string) {
    this.tx(() => {
      if (this.get("SELECT 1 FROM migrations WHERE version=?", version)) return;
      this.db.exec(sql);
      this.run("INSERT INTO migrations VALUES(?)", version);
    });
  }
  all(sql: string, ...args: any[]): any[] {
    return this.db.prepare(sql).all(...args);
  }
  get(sql: string, ...args: any[]): any {
    return this.db.prepare(sql).get(...args);
  }
  run(sql: string, ...args: any[]) {
    return this.db.prepare(sql).run(...args);
  }
  tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  once<T>(scope: string, body: any, fn: () => T): T {
    return this.tx(() => {
      const digest = hash(canonical(body));
      const prior = this.get(
        "SELECT * FROM requests WHERE id=?",
        body.requestId,
      );
      if (prior) {
        requireThat(
          prior.scope === scope && prior.digest === digest,
          "requestId reused with different content",
          409,
        );
        return JSON.parse(prior.result);
      }
      const result = fn();
      this.run(
        "INSERT INTO requests VALUES(?,?,?,?)",
        body.requestId,
        scope,
        digest,
        JSON.stringify(result),
      );
      return result;
    });
  }
  resource(table: string, key: string) {
    const value = this.get(`SELECT * FROM ${table} WHERE id=?`, key);
    requireThat(value, "Resource not found", 404);
    return value;
  }
  version(value: any, version: number) {
    requireThat(
      value.version === version,
      "Resource changed; reload before saving",
      409,
    );
  }
  members(categoryId: string): string[] {
    this.resource("categories", categoryId);
    return this.all(
      "SELECT itemId FROM item_categories WHERE categoryId=? ORDER BY itemId",
      categoryId,
    ).map((x) => x.itemId);
  }
  itemRefs(key: string): any[] {
    return this.all(
      "SELECT c.id,c.name,'Category' AS kind FROM categories c JOIN item_categories r ON r.categoryId=c.id WHERE r.itemId=? UNION SELECT d.id,d.name,d.kind FROM documents d JOIN entries e ON e.documentId=d.id WHERE e.itemId=?",
      key,
      key,
    );
  }
  close() {
    this.db.close();
  }
}
export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export function password(text: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(text, salt, 64).toString("hex");
}
export function verify(text: string, encoded: string) {
  const [salt, digest] = encoded.split(":");
  const candidate = scryptSync(text, salt, 64);
  return timingSafeEqual(candidate, Buffer.from(digest, "hex"));
}

function canonical(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonical(value[key]))
      .join(",") +
    "}"
  );
}
