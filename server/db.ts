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
    // Foreign keys turn on after a possible table rebuild below.
    this.db = new DatabaseSync(path, { enableForeignKeyConstraints: false });
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    // Schema version lives in PRAGMA user_version; pre-8 dev databases
    // recorded theirs in a migrations table instead.
    const legacy = this.get(
      "SELECT 1 FROM sqlite_master WHERE name='migrations'",
    );
    if (!legacy && !this.get("PRAGMA user_version").user_version)
      this.tx(() => this.db.exec(schema));
    else if (legacy) {
      const { v } = this.get("SELECT MAX(version) AS v FROM migrations");
      // 8 = baseline already built by an interim dev build; only the marker moves.
      if (v === 8) this.db.exec("DROP TABLE migrations; PRAGMA user_version=8");
      else requireThat(v === 7, "Upgrade through the previous release first");
      // Table rebuild: foreign keys stay off until every row is copied.
      if (v === 7)
        this.tx(() => {
          this.db.exec(upgradeFrom7);
          requireThat(
            !this.all("PRAGMA foreign_key_check").length,
            "Upgrade left dangling references",
          );
        });
    }
    this.db.exec("PRAGMA foreign_keys=ON");
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

// Version 8 baseline. sections.afterEntryId: NULL = after all entries
// (legacy), '' = before all entries, otherwise the previous sibling entry.
const schema = `
CREATE TABLE account(username TEXT PRIMARY KEY,password TEXT NOT NULL) STRICT;
CREATE TABLE sessions(hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL) STRICT;
CREATE TABLE tokens(id TEXT PRIMARY KEY,name TEXT NOT NULL,hash TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE requests(id TEXT PRIMARY KEY,scope TEXT NOT NULL,digest TEXT NOT NULL,result TEXT NOT NULL) STRICT;
CREATE TABLE items(id TEXT PRIMARY KEY,name TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',itemGroup TEXT,version INTEGER NOT NULL DEFAULT 1) STRICT;
CREATE TABLE categories(id TEXT PRIMARY KEY,name TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1) STRICT;
CREATE TABLE item_categories(itemId TEXT NOT NULL REFERENCES items(id),categoryId TEXT NOT NULL REFERENCES categories(id),position INTEGER,PRIMARY KEY(itemId,categoryId)) STRICT;
CREATE INDEX item_categories_category ON item_categories(categoryId);
CREATE TABLE documents(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('template','checklist')),name TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),useDate TEXT CHECK(useDate GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),source TEXT,archive TEXT) STRICT;
CREATE TABLE sections(id TEXT PRIMARY KEY,documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,parentSectionId TEXT REFERENCES sections(id) DEFERRABLE INITIALLY DEFERRED,name TEXT NOT NULL,afterEntryId TEXT,position INTEGER NOT NULL) STRICT;
CREATE INDEX sections_document ON sections(documentId);
CREATE TABLE entries(id TEXT PRIMARY KEY,documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,itemId TEXT REFERENCES items(id),sectionId TEXT REFERENCES sections(id) DEFERRABLE INITIALLY DEFERRED,name TEXT NOT NULL,quantity TEXT NOT NULL,unit TEXT NOT NULL,note TEXT NOT NULL,position INTEGER NOT NULL,checked INTEGER NOT NULL DEFAULT 0 CHECK(checked IN (0,1)),direct INTEGER NOT NULL DEFAULT 1 CHECK(direct IN (0,1))) STRICT;
CREATE INDEX entries_document ON entries(documentId);
CREATE UNIQUE INDEX entries_item ON entries(itemId,documentId) WHERE itemId IS NOT NULL;
CREATE TABLE groups(id TEXT PRIMARY KEY,documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,categoryId TEXT REFERENCES categories(id),originalCategoryId TEXT NOT NULL,name TEXT NOT NULL,members TEXT NOT NULL,excluded TEXT NOT NULL) STRICT;
CREATE INDEX groups_document ON groups(documentId);
CREATE TABLE entry_sources(entryId TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,groupId TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,PRIMARY KEY(entryId,groupId)) STRICT;
CREATE INDEX entry_sources_group ON entry_sources(groupId);
CREATE TABLE template_revisions(documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,revision INTEGER NOT NULL,snapshot TEXT NOT NULL,PRIMARY KEY(documentId,revision)) STRICT;
CREATE TRIGGER revisions_immutable BEFORE UPDATE ON template_revisions BEGIN SELECT RAISE(ABORT,'Revision is immutable'); END;
PRAGMA user_version=8;
`;
// ponytail: one-shot copy from the last pre-baseline dev schema; delete once no v7 databases remain.
const old = [
  "account",
  "sessions",
  "tokens",
  "requests",
  "items",
  "categories",
  "item_categories",
  "category_order",
  "documents",
  "entries",
  "groups",
  "entry_sources",
  "template_revisions",
];
const upgradeFrom7 = `
DROP TABLE IF EXISTS legacy_category_parents;
DROP TRIGGER revisions_immutable;
${old.map((t) => `ALTER TABLE ${t} RENAME TO old_${t};`).join("\n")}
${schema}
INSERT INTO account SELECT * FROM old_account;
INSERT INTO sessions SELECT * FROM old_sessions;
INSERT INTO tokens SELECT * FROM old_tokens;
INSERT INTO requests SELECT * FROM old_requests;
INSERT INTO items(id,name,note,itemGroup,version) SELECT id,name,note,itemGroup,version FROM old_items;
INSERT INTO categories SELECT id,name,version FROM old_categories;
INSERT INTO item_categories SELECT r.itemId,r.categoryId,o.position FROM old_item_categories r LEFT JOIN old_category_order o USING(itemId,categoryId);
INSERT INTO documents SELECT id,kind,name,version,status,useDate,source,archive FROM old_documents;
INSERT INTO sections SELECT s.value->>'id',d.id,s.value->>'parentSectionId',s.value->>'name',CASE json_type(s.value,'$.afterEntryId') WHEN 'null' THEN '' ELSE s.value->>'afterEntryId' END,s.key FROM old_documents d,json_each(d.sections) s;
INSERT INTO entries SELECT id,documentId,itemId,sectionId,name,quantity,unit,note,position,checked,direct FROM old_entries;
INSERT INTO groups SELECT id,documentId,categoryId,originalCategoryId,name,members,excluded FROM old_groups;
INSERT INTO entry_sources SELECT * FROM old_entry_sources;
INSERT INTO template_revisions SELECT * FROM old_template_revisions;
${old.map((t) => `DROP TABLE old_${t};`).join("\n")}
DROP TABLE migrations;
`;
