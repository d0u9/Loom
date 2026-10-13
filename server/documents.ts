import { Store, id, requireThat } from "./db.js";
import { writeGroups } from "./groups.js";
import {
  validateSections,
  mergeContent,
  duplicateItems,
  type Entry,
  type Content,
} from "../shared/groups.js";
import { object as obj, uuid, short, version, type Route } from "./schema.js";
export function document(store: Store, key: string, live = true): any {
  const d = store.resource("documents", key);
  if (d.status === "archived") {
    const snapshot = JSON.parse(d.archive);
    requireThat(snapshot.schemaVersion === 2, "Unsupported snapshot schema");
    const { archive, ...metadata } = d;
    return {
      ...metadata,
      ...snapshot,
      sections: snapshot.sections ?? [],
      entries: snapshot.entries.map((e: Entry) => ({
        ...e,
        sectionId: e.sectionId ?? null,
        sourceCount: e.groupIds.length + Number(e.direct),
      })),
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
      sourceCount:
        Number(e.direct) +
        store.get(
          "SELECT count(*) AS n FROM entry_sources WHERE entryId=?",
          e.id,
        ).n,
      groupIds: store
        .all("SELECT groupId FROM entry_sources WHERE entryId=?", e.id)
        .map((x) => x.groupId),
    }));
  return {
    ...d,
    source: d.source ? JSON.parse(d.source) : null,
    entries,
    sections: store
      .all(
        "SELECT id,name,parentSectionId,afterEntryId FROM sections WHERE documentId=? ORDER BY position",
        key,
      )
      .map(({ afterEntryId, ...s }) =>
        afterEntryId === null
          ? s
          : { ...s, afterEntryId: afterEntryId || null },
      ),
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
  const itemIds = new Set<string>();
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
    if (e.itemId) {
      requireThat(
        !itemIds.has(e.itemId),
        "Duplicate Item; merge before saving",
        409,
      );
      itemIds.add(e.itemId);
      e.name = store.resource("items", e.itemId).name;
    }
    requireThat(e.name.trim(), "Entry needs a name");
  }
  store.run("DELETE FROM entries WHERE documentId=?", key);
  entries.forEach((e, p) =>
    store.run(
      "INSERT INTO entries(id,documentId,itemId,name,quantity,unit,note,position,checked,direct,sectionId) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
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
      e.sectionId ?? null,
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
  validateSections(content);
  const copied = reid(
    mergeContent(
      content,
      Object.fromEntries(
        duplicateItems(content).map((d) => [d.itemId, d.entries[0].id]),
      ),
    ),
  );
  writeSections(store, key, copied);
  if (!preserve) copied.entries.forEach((e) => (e.checked = false));
  writeEntries(store, key, copied.entries, false);
  writeGroups(store, key, copied);
  if (kind === "template") saveRevision(store, key);
  return document(store, key);
}
export function reid(content: Content): Content {
  const mapping = new Map(content.groups.map((g) => [g.id, id()]));
  const sections = new Map((content.sections ?? []).map((s) => [s.id, id()]));
  const entries = new Map(content.entries.map((e) => [e.id, id()]));
  return {
    entries: content.entries.map((e) => ({
      ...e,
      id: entries.get(e.id)!,
      sectionId: e.sectionId ? sections.get(e.sectionId)! : null,
      groupIds: e.groupIds.map((k) => mapping.get(k)!),
    })),
    groups: content.groups.map((g) => ({ ...g, id: mapping.get(g.id)! })),
    sections: (content.sections ?? []).map((s) => ({
      ...s,
      id: sections.get(s.id)!,
      parentSectionId: s.parentSectionId
        ? sections.get(s.parentSectionId)!
        : null,
      // null (first) stays null; missing or stale stays missing (= last).
      afterEntryId:
        s.afterEntryId === null ? null : entries.get(s.afterEntryId ?? ""),
    })),
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
    JSON.stringify({ schemaVersion: 2, ...snapshot, revision: rev }),
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
    sectionId: { anyOf: [uuid, { type: "null" }] },
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
export function writeSections(store: Store, key: string, content: Content) {
  validateSections(content);
  const sections = content.sections ?? [];
  for (const s of sections)
    requireThat(
      !store.get(
        "SELECT 1 FROM sections WHERE id=? AND documentId<>?",
        s.id,
        key,
      ),
      "Section belongs to another document",
      409,
    );
  store.run("DELETE FROM sections WHERE documentId=?", key);
  sections.forEach((s, p) =>
    store.run(
      "INSERT INTO sections VALUES(?,?,?,?,?,?)",
      s.id,
      key,
      s.parentSectionId ?? null,
      s.name,
      // See schema: '' = first, NULL = legacy "after all entries".
      s.afterEntryId === undefined ? null : (s.afterEntryId ?? ""),
      p,
    ),
  );
}
export const contentSchema = {
  sections: {
    type: "array",
    maxItems: 1000,
    items: obj(
      {
        id: uuid,
        name: short,
        parentSectionId: { anyOf: [uuid, { type: "null" }] },
        afterEntryId: { anyOf: [uuid, { type: "null" }] },
      },
      ["id", "name", "parentSectionId"],
    ),
  },
  entries: { type: "array", maxItems: 10000, items: entry },
  groups: { type: "array", maxItems: 1000, items: group },
};
export function registerDocuments(route: Route, store: Store) {
  route("GET", "/documents", null, () =>
    store
      .all(
        "SELECT d.id,d.kind,d.name,d.version,d.status,d.source,d.useDate,d.archive,COUNT(e.id) AS total,COALESCE(SUM(e.checked),0) AS done FROM documents d LEFT JOIN entries e ON e.documentId=d.id GROUP BY d.id ORDER BY d.rowid DESC",
      )
      .map(({ archive, ...d }) => {
        // Archived entries live only in the snapshot.
        const entries = archive ? JSON.parse(archive).entries : null;
        return {
          ...d,
          source: d.source ? JSON.parse(d.source) : null,
          total: entries ? entries.length : d.total,
          done: entries ? entries.filter((e: any) => e.checked).length : d.done,
        };
      }),
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
        const knownGroups = new Set([
          ...req.body.groups.map((g: Content["groups"][number]) => g.id),
          ...store
            .all("SELECT id FROM groups WHERE documentId=?", d.id)
            .map((g) => g.id),
        ]);
        requireThat(
          req.body.entries.every((e: Entry) =>
            e.groupIds.every((k) => knownGroups.has(k)),
          ),
          "Unknown source group",
        );
        const useDate =
          req.body.useDate === undefined ? d.useDate : req.body.useDate;
        validateUseDate(d.kind, useDate);
        store.run(
          "UPDATE documents SET name=?,useDate=?,version=version+1 WHERE id=?",
          req.body.name,
          useDate,
          d.id,
        );
        const targets: Record<string, string> = {};
        for (const duplicate of duplicateItems(req.body)) {
          const prior = store.all(
            "SELECT id FROM entries WHERE documentId=? AND itemId=?",
            d.id,
            duplicate.itemId,
          );
          if (
            prior.length === 1 &&
            duplicate.entries.some((e) => e.id === prior[0].id)
          )
            targets[duplicate.itemId] = prior[0].id;
        }
        const content = mergeContent(
          {
            ...req.body,
            sections: req.body.sections ?? document(store, d.id).sections,
          },
          targets,
        );
        const groupIds = new Set(content.groups.map((g) => g.id));
        content.entries = content.entries
          .map((e) => ({
            ...e,
            groupIds: e.groupIds.filter((k) => groupIds.has(k)),
          }))
          .filter((e) => e.direct || e.groupIds.length);
        writeSections(store, d.id, content);
        writeEntries(store, d.id, content.entries);
        writeGroups(store, d.id, content);
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
