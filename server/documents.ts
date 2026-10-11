import { Store, id, requireThat } from "./db.js";
import { migrateGroups, writeGroups } from "./groups.js";
import type { Entry, Content } from "../shared/groups.js";
import { object as obj, uuid, short, version, type Route } from "./schema.js";
export function migrateDocuments(store: Store) {
  store.migrate(
    2,
    `
 CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('template','checklist')),name TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'active',source TEXT,archive TEXT);
 CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,itemId TEXT REFERENCES items(id) ON DELETE RESTRICT,name TEXT NOT NULL,quantity TEXT NOT NULL,unit TEXT NOT NULL,note TEXT NOT NULL,position INTEGER NOT NULL,checked INTEGER NOT NULL DEFAULT 0,direct INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS template_revisions(documentId TEXT REFERENCES documents(id) ON DELETE CASCADE,revision INTEGER NOT NULL,snapshot TEXT NOT NULL,PRIMARY KEY(documentId,revision));
 CREATE TRIGGER IF NOT EXISTS revisions_immutable BEFORE UPDATE ON template_revisions BEGIN SELECT RAISE(ABORT,'Revision is immutable'); END;
 `,
  );
  migrateGroups(store);
  store.migrate(4, "ALTER TABLE documents ADD COLUMN useDate TEXT");
}
export function document(store: Store, key: string, live = true): any {
  const d = store.resource("documents", key);
  if (d.status === "archived") {
    const snapshot = JSON.parse(d.archive);
    requireThat(snapshot.schemaVersion === 1, "Unsupported snapshot schema");
    const { archive, ...metadata } = d;
    return {
      ...metadata,
      ...snapshot,
      status: d.status,
      version: d.version,
      useDate: snapshot.useDate ?? d.useDate ?? null,
    };
  }
  const entries = store
    .all("SELECT * FROM entries WHERE documentId=? ORDER BY position", key)
    .map((e) => ({
      ...e,
      name: live && e.itemId ? store.resource("items", e.itemId).name : e.name,
      checked: !!e.checked,
      direct: !!e.direct,
      groupIds: store
        .all("SELECT groupId FROM entry_sources WHERE entryId=?", e.id)
        .map((x) => x.groupId),
    }));
  return {
    ...d,
    source: d.source ? JSON.parse(d.source) : null,
    entries,
    groups: store
      .all("SELECT * FROM groups WHERE documentId=?", key)
      .map((g) => ({
        ...g,
        members: JSON.parse(g.members),
        excluded: JSON.parse(g.excluded),
      })),
  };
}
export function active(store: Store, key: string) {
  const d = store.resource("documents", key);
  requireThat(d.status === "active", "Checklist is archived", 409);
  return d;
}
export function writeEntries(
  store: Store,
  key: string,
  entries: Entry[],
  preserveChecks = true,
) {
  const old = new Map(
    store
      .all("SELECT id,checked FROM entries WHERE documentId=?", key)
      .map((e) => [e.id, e.checked]),
  );
  const seen = new Set<string>();
  for (const e of entries) {
    requireThat(!seen.has(e.id), "Duplicate entry ID");
    seen.add(e.id);
    const existing = store.get(
      "SELECT documentId FROM entries WHERE id=?",
      e.id,
    );
    requireThat(
      !existing || existing.documentId === key,
      "Entry belongs to another document",
      409,
    );
    if (e.itemId) e.name = store.resource("items", e.itemId).name;
    requireThat(e.name.trim(), "Entry needs a name");
  }
  store.run("DELETE FROM entries WHERE documentId=?", key);
  entries.forEach((e, p) =>
    store.run(
      "INSERT INTO entries VALUES(?,?,?,?,?,?,?,?,?,?)",
      e.id,
      key,
      e.itemId,
      e.name,
      e.quantity,
      e.unit,
      e.note,
      p,
      preserveChecks ? old.get(e.id) || 0 : e.checked ? 1 : 0,
      e.direct ? 1 : 0,
    ),
  );
}
export function createDocument(
  store: Store,
  kind: string,
  name: string,
  content: Content,
  source: any = null,
  preserve = false,
  useDate: string | null = null,
) {
  validateUseDate(kind, useDate);
  const key = id();
  store.run(
    "INSERT INTO documents(id,kind,name,source,useDate) VALUES(?,?,?,?,?)",
    key,
    kind,
    name,
    source ? JSON.stringify(source) : null,
    useDate,
  );
  const copied = reid(content);
  if (!preserve) copied.entries.forEach((e) => (e.checked = false));
  writeEntries(store, key, copied.entries, false);
  writeGroups(store, key, copied);
  if (kind === "template") saveRevision(store, key);
  return document(store, key);
}
export function reid(content: Content): Content {
  const mapping = new Map(content.groups.map((g) => [g.id, id()]));
  return {
    entries: content.entries.map((e) => ({
      ...e,
      id: id(),
      groupIds: e.groupIds.map((k) => mapping.get(k)!),
    })),
    groups: content.groups.map((g) => ({ ...g, id: mapping.get(g.id)! })),
  };
}
export function saveRevision(store: Store, key: string) {
  const snapshot = document(store, key);
  const rev =
    (store.get(
      "SELECT MAX(revision) AS n FROM template_revisions WHERE documentId=?",
      key,
    ).n || 0) + 1;
  store.run(
    "INSERT INTO template_revisions VALUES(?,?,?)",
    key,
    rev,
    JSON.stringify({ schemaVersion: 1, ...snapshot, revision: rev }),
  );
  return rev;
}
export const useDateSchema = {
  anyOf: [
    { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
    { type: "null" },
  ],
};
export function validateUseDate(kind: string, value: string | null) {
  const date = new Date(value + "T00:00:00Z");
  requireThat(
    value === null ||
      (kind === "checklist" &&
        !value.startsWith("0000") &&
        !isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value),
    "Invalid checklist use date",
  );
}
const str = { type: "string", maxLength: 10000 };
const entry = obj(
  {
    id: uuid,
    itemId: { anyOf: [uuid, { type: "null" }] },
    name: short,
    quantity: { type: "string", maxLength: 100 },
    unit: { type: "string", maxLength: 100 },
    note: str,
    checked: { type: "boolean" },
    direct: { type: "boolean" },
    groupIds: { type: "array", items: uuid, uniqueItems: true },
  },
  ["id", "itemId", "name", "quantity", "unit", "note", "direct", "groupIds"],
);
const group = obj(
  {
    id: uuid,
    categoryId: { anyOf: [uuid, { type: "null" }] },
    originalCategoryId: uuid,
    name: short,
    members: { type: "array", items: uuid, uniqueItems: true },
    excluded: { type: "array", items: uuid, uniqueItems: true },
    expected: { type: "array", items: uuid, uniqueItems: true },
    documentId: uuid,
  },
  ["id", "categoryId", "originalCategoryId", "name", "members", "excluded"],
);
export const contentSchema = {
  entries: { type: "array", maxItems: 10000, items: entry },
  groups: { type: "array", maxItems: 1000, items: group },
};
export function registerDocuments(route: Route, store: Store) {
  migrateDocuments(store);
  route("GET", "/documents", null, () =>
    store
      .all(
        "SELECT id,kind,name,version,status,source,useDate FROM documents ORDER BY rowid DESC",
      )
      .map((d) => ({ ...d, source: d.source ? JSON.parse(d.source) : null })),
  );
  route("GET", "/documents/:id", null, (req: any) =>
    document(store, req.params.id),
  );
  route(
    "POST",
    "/documents",
    obj(
      {
        useDate: useDateSchema,
        kind: { enum: ["template", "checklist"], type: "string" },
        name: short,
        requestId: uuid,
        ...contentSchema,
      },
      ["kind", "name", "requestId", "entries", "groups"],
    ),
    (req: any) =>
      store.once("create-document", req.body, () => {
        return createDocument(
          store,
          req.body.kind,
          req.body.name,
          req.body,
          null,
          false,
          req.body.useDate ?? null,
        );
      }),
  );
  route(
    "PUT",
    "/documents/:id",
    obj(
      {
        name: short,
        useDate: useDateSchema,
        version,
        requestId: uuid,
        ...contentSchema,
      },
      ["name", "version", "requestId", "entries", "groups"],
    ),
    (req: any) =>
      store.once("save-document:" + req.params.id, req.body, () => {
        const d = active(store, req.params.id);
        store.version(d, req.body.version);
        const useDate =
          req.body.useDate === undefined ? d.useDate : req.body.useDate;
        validateUseDate(d.kind, useDate);
        store.run(
          "UPDATE documents SET name=?,useDate=?,version=version+1 WHERE id=?",
          req.body.name,
          useDate,
          d.id,
        );
        writeEntries(store, d.id, req.body.entries);
        writeGroups(store, d.id, req.body);
        if (d.kind === "template") saveRevision(store, d.id);
        return document(store, d.id);
      }),
  );
  route(
    "PUT",
    "/checklists/:id/entries/:entryId/checked",
    obj({ checked: { type: "boolean" }, requestId: uuid }, [
      "checked",
      "requestId",
    ]),
    (req: any) =>
      store.once(
        "check:" + req.params.id + ":" + req.params.entryId,
        req.body,
        () => {
          const d = active(store, req.params.id);
          requireThat(d.kind === "checklist", "Not a checklist");
          const e = store.get(
            "SELECT id FROM entries WHERE id=? AND documentId=?",
            req.params.entryId,
            d.id,
          );
          requireThat(e, "Entry not found", 404);
          store.run(
            "UPDATE entries SET checked=? WHERE id=?",
            req.body.checked ? 1 : 0,
            e.id,
          );
          return { checked: req.body.checked };
        },
      ),
  );
  route("GET", "/templates/:id/revisions", null, (req: any) => {
    requireThat(
      store.resource("documents", req.params.id).kind === "template",
      "Not a template",
    );
    return store.all(
      "SELECT revision FROM template_revisions WHERE documentId=? ORDER BY revision DESC",
      req.params.id,
    );
  });
  route("GET", "/templates/:id/revisions/:revision", null, (req: any) => {
    const row = store.get(
      "SELECT snapshot FROM template_revisions WHERE documentId=? AND revision=?",
      req.params.id,
      req.params.revision,
    );
    requireThat(row, "Revision not found", 404);
    return JSON.parse(row.snapshot);
  });
}
