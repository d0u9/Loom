import { Store, id, requireThat, Problem } from "./db.js";
import {
  active,
  document,
  createDocument,
  writeEntries,
  reid,
  writeSections,
  useDateSchema,
} from "./documents.js";
import {
  object as obj,
  uuid,
  short as str,
  version,
  type Route,
} from "./schema.js";
import { writeGroups } from "./groups.js";
import {
  mergeContent,
  duplicateItems,
  type Content,
} from "../shared/groups.js";
function source(store: Store, key: string, action: string, revision?: number) {
  const d = store.resource("documents", key);
  if (action === "instantiate") {
    requireThat(d.kind === "template", "Not a template");
    const row = store.get(
      "SELECT snapshot FROM template_revisions WHERE documentId=? AND revision=?",
      key,
      revision,
    );
    requireThat(row, "Revision not found", 404);
    return JSON.parse(row.snapshot);
  }
  if (action === "copy" || action === "template")
    requireThat(d.kind === "checklist", "Operation needs a checklist");
  if (action === "restore")
    requireThat(d.status === "archived", "Not archived", 409);
  return document(store, key);
}
export function missing(store: Store, snapshot: Content) {
  return {
    items: [...new Set(snapshot.entries.map((e) => e.itemId).filter(Boolean))]
      .filter((k) => !store.get("SELECT id FROM items WHERE id=?", k))
      .map((k) => ({
        id: k,
        name: snapshot.entries.find((e) => e.itemId === k)!.name,
      })),
    categories: snapshot.groups
      .filter(
        (g) =>
          g.categoryId &&
          !store.get("SELECT id FROM categories WHERE id=?", g.categoryId),
      )
      .map((g) => ({ id: g.categoryId, name: g.name })),
  };
}
export function resolveContent(
  store: Store,
  snapshot: Content,
  resolutions: Record<string, any>,
  mergeTargets: Record<string, string> = {},
): Content {
  const content = structuredClone(snapshot),
    mapping = new Map<string, string | null>();
  for (const old of missing(store, content).items) {
    const choice = resolutions[old.id!];
    requireThat(choice, "Choose how to resolve " + old.name);
    if (choice.mode === "temporary") mapping.set(old.id!, null);
    else if (choice.mode === "existing") {
      store.resource("items", choice.itemId);
      mapping.set(old.id!, choice.itemId);
    } else if (choice.mode === "new") {
      requireThat(
        typeof choice.name === "string" &&
          choice.name.trim() &&
          choice.name.length <= 200,
        "New Item needs a name",
      );
      const key = id();
      store.run("INSERT INTO items(id,name) VALUES(?,?)", key, choice.name);
      mapping.set(old.id!, key);
    } else throw new Problem(400, "Invalid resolution");
  }
  for (const e of content.entries) {
    if (e.itemId && mapping.has(e.itemId)) {
      e.itemId = mapping.get(e.itemId)!;
      if (!e.itemId) {
        e.direct = true;
        e.groupIds = [];
      }
    }
    if (e.itemId) e.name = store.resource("items", e.itemId).name;
  }
  const remap = (keys: string[]) => [
    ...new Set(keys.map((k) => mapping.get(k) || k)),
  ];
  for (const g of content.groups) {
    if (
      g.categoryId &&
      !store.get("SELECT id FROM categories WHERE id=?", g.categoryId)
    )
      g.categoryId = null;
    g.members = remap(g.members);
    g.excluded = remap(g.excluded);
    delete g.expected;
  }
  const targets: Record<string, string> = {};
  for (const entryId of Object.values(mergeTargets)) {
    const e = content.entries.find((e) => e.id === entryId);
    if (e?.itemId) targets[e.itemId] = entryId;
  }
  return mergeContent(content, targets);
}
export function registerHistory(route: Route, store: Store) {
  route(
    "POST",
    "/checklists/:id/archive",
    obj({ version, requestId: uuid }, ["version", "requestId"]),
    (req: any) =>
      store.once("archive:" + req.params.id, req.body, () => {
        const d = active(store, req.params.id);
        requireThat(d.kind === "checklist", "Not a checklist");
        store.version(d, req.body.version);
        const snapshot = {
          schemaVersion: 2,
          ...document(store, d.id),
          archivedAt: new Date().toISOString(),
        };
        store.run("DELETE FROM entries WHERE documentId=?", d.id);
        store.run("DELETE FROM groups WHERE documentId=?", d.id);
        store.run("DELETE FROM sections WHERE documentId=?", d.id);
        store.run(
          "UPDATE documents SET archive=?,status='archived',version=version+1 WHERE id=?",
          JSON.stringify(snapshot),
          d.id,
        );
        return document(store, d.id);
      }),
  );
  const props = {
    action: {
      type: "string",
      enum: ["restore", "copy", "template", "instantiate"],
    },
    revision: version,
    version,
    name: str,
    requestId: uuid,
    useDate: useDateSchema,
    mergeTargets: { type: "object", additionalProperties: uuid },
    resolutions: {
      type: "object",
      additionalProperties: obj(
        {
          mode: { type: "string", enum: ["temporary", "existing", "new"] },
          itemId: uuid,
          name: str,
        },
        ["mode"],
      ),
    },
  };
  route(
    "POST",
    "/documents/:id/history-preview",
    obj(props, ["action", "version"]),
    (req: any) => {
      store.version(
        store.resource("documents", req.params.id),
        req.body.version,
      );
      const s = source(
        store,
        req.params.id,
        req.body.action,
        req.body.revision,
      );
      return {
        ...missing(store, s),
        duplicates: duplicateItems(s),
        name: s.name,
        version: req.body.version,
      };
    },
  );
  route(
    "POST",
    "/documents/:id/history-apply",
    obj(props, ["action", "version", "name", "requestId", "resolutions"]),
    (req: any) =>
      store.once("history:" + req.params.id, req.body, () => {
        const { action, revision, name, resolutions } = req.body;
        const d = store.resource("documents", req.params.id);
        store.version(d, req.body.version);
        const s = source(store, d.id, action, revision);
        const content = resolveContent(
          store,
          s,
          resolutions,
          req.body.mergeTargets,
        );
        if (action === "restore") {
          const restored = reid(content);
          store.run(
            "UPDATE documents SET name=?,status='active',archive=NULL,version=version+1 WHERE id=?",
            name,
            d.id,
          );
          writeSections(store, d.id, restored);
          writeEntries(store, d.id, restored.entries, false);
          writeGroups(store, d.id, restored);
          return document(store, d.id);
        }
        const kind = action === "template" ? "template" : "checklist";
        const provenance =
          action === "instantiate"
            ? { templateId: d.id, revision, templateName: s.name }
            : s.source;
        return createDocument(
          store,
          kind,
          name,
          content,
          provenance,
          false,
          kind === "checklist" ? (req.body.useDate ?? null) : null,
        );
      }),
  );
  route(
    "DELETE",
    "/templates/:id",
    obj({ version, confirm: { type: "boolean", const: true } }, [
      "version",
      "confirm",
    ]),
    (req: any) =>
      store.tx(() => {
        const d = store.resource("documents", req.params.id);
        requireThat(d.kind === "template", "Not a template");
        store.version(d, req.body.version);
        for (const c of store.all(
          "SELECT id,source FROM documents WHERE source IS NOT NULL",
        )) {
          const origin = JSON.parse(c.source);
          if (origin.templateId === d.id) {
            origin.originalTemplateId = origin.templateId;
            origin.templateId = null;
            store.run(
              "UPDATE documents SET source=? WHERE id=?",
              JSON.stringify(origin),
              c.id,
            );
          }
        }
        store.run("DELETE FROM documents WHERE id=?", d.id);
        return { ok: true };
      }),
  );
  // Active or archived; entries, groups and archive snapshot go with it.
  route(
    "DELETE",
    "/checklists/:id",
    obj({ version, confirm: { type: "boolean", const: true } }, [
      "version",
      "confirm",
    ]),
    (req: any) =>
      store.tx(() => {
        const d = store.resource("documents", req.params.id);
        requireThat(d.kind === "checklist", "Not a checklist");
        store.version(d, req.body.version);
        store.run("DELETE FROM documents WHERE id=?", d.id);
        return { ok: true };
      }),
  );
}
