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
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    // Schema version lives in PRAGMA user_version. Changing it needs the
    // owner's explicit approval (see AGENTS.md).
    const { user_version } = this.get("PRAGMA user_version");
    if (!user_version) this.tx(() => this.db.exec(schema));
    else requireThat(user_version === 1, "Unsupported database version");
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
        "INSERT INTO requests(id,scope,digest,result) VALUES(?,?,?,?)",
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

// Version 1 schema. sections.afterEntryId: NULL = after all sibling entries
// '' = before all entries, otherwise the previous sibling entry.
function collectionLayoutSchema(kind: "category" | "template") {
  const table = kind === "category" ? "categories" : "documents";
  return `
CREATE TABLE ${kind}_sections(id TEXT PRIMARY KEY,name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),position INTEGER NOT NULL CHECK(position>=0)) STRICT;
CREATE TABLE ${kind}_positions(${kind}Id TEXT PRIMARY KEY REFERENCES ${table}(id) ON DELETE CASCADE,sectionId TEXT REFERENCES ${kind}_sections(id) ON DELETE SET NULL,position INTEGER NOT NULL CHECK(position>=0)) STRICT;
CREATE INDEX ${kind}_positions_section ON ${kind}_positions(sectionId);
CREATE TABLE ${kind}_layout(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL CHECK(version>0),rootPosition INTEGER NOT NULL DEFAULT 0 CHECK(rootPosition>=0)) STRICT;
INSERT INTO ${kind}_layout(id,version) VALUES(1,1);
`;
}
export const categoryLayoutSchema = collectionLayoutSchema("category");
export const templateLayoutSchema =
  collectionLayoutSchema("template") +
  `
CREATE TRIGGER template_layout_insert AFTER INSERT ON documents WHEN NEW.kind='template' BEGIN
  INSERT INTO template_positions(templateId,sectionId,position) SELECT NEW.id,NULL,COALESCE(MAX(position)+1,0) FROM template_positions;
  UPDATE template_layout SET version=version+1 WHERE id=1;
END;
CREATE TRIGGER template_layout_delete AFTER DELETE ON documents WHEN OLD.kind='template' BEGIN
  UPDATE template_layout SET version=version+1 WHERE id=1;
END;
`;
const schema = `
CREATE TABLE account(username TEXT PRIMARY KEY,password TEXT NOT NULL) STRICT;
CREATE TABLE sessions(hash TEXT PRIMARY KEY,csrf TEXT NOT NULL,expires INTEGER NOT NULL) STRICT;
CREATE TABLE tokens(id TEXT PRIMARY KEY,name TEXT NOT NULL,hash TEXT NOT NULL UNIQUE) STRICT;
CREATE TABLE requests(id TEXT PRIMARY KEY,scope TEXT NOT NULL,digest TEXT NOT NULL,result TEXT NOT NULL) STRICT;
CREATE TABLE items(id TEXT PRIMARY KEY,name TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',itemGroup TEXT,version INTEGER NOT NULL DEFAULT 1) STRICT;
CREATE TABLE categories(id TEXT PRIMARY KEY,name TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1) STRICT;
CREATE TABLE item_categories(itemId TEXT NOT NULL REFERENCES items(id),categoryId TEXT NOT NULL REFERENCES categories(id),position INTEGER NOT NULL,PRIMARY KEY(itemId,categoryId)) STRICT;
CREATE INDEX item_categories_category ON item_categories(categoryId);
CREATE TABLE documents(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('template','checklist')),name TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),useDate TEXT CHECK(useDate GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),source TEXT,archive TEXT) STRICT;
CREATE TABLE sections(id TEXT PRIMARY KEY,documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,parentSectionId TEXT REFERENCES sections(id) DEFERRABLE INITIALLY DEFERRED,name TEXT NOT NULL,afterEntryId TEXT,position INTEGER NOT NULL) STRICT;
CREATE INDEX sections_document ON sections(documentId);
CREATE TABLE entries(id TEXT PRIMARY KEY,documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,itemId TEXT REFERENCES items(id),sectionId TEXT REFERENCES sections(id) DEFERRABLE INITIALLY DEFERRED,name TEXT NOT NULL,quantity TEXT NOT NULL,unit TEXT NOT NULL,note TEXT NOT NULL,position INTEGER NOT NULL,checked INTEGER NOT NULL DEFAULT 0 CHECK(checked IN (0,1))) STRICT;
CREATE INDEX entries_document ON entries(documentId);
CREATE UNIQUE INDEX entries_item ON entries(itemId,documentId) WHERE itemId IS NOT NULL;
${categoryLayoutSchema}
${templateLayoutSchema}
PRAGMA user_version=1;
`;
