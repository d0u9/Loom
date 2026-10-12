import { Store, id, requireThat } from "./db.js";
import { active, contentSchema } from "./documents.js";
import { compose, type Group, type Content } from "../shared/groups.js";
import { object, uuid, version, type Route } from "./schema.js";
export function writeGroups(store: Store, key: string, content: Content) {
  const ids = new Set(content.groups.map((g) => g.id));
  const categories = content.groups.map((g) => g.categoryId).filter(Boolean);
  requireThat(
    new Set(categories).size === categories.length,
    "Duplicate Category group; merge before saving",
    409,
  );
  requireThat(ids.size === content.groups.length, "Duplicate group ID");
  for (const e of content.entries) {
    requireThat(e.direct || e.groupIds.length, "Entry needs a source");
    requireThat(
      e.groupIds.every((k) => ids.has(k)),
      "Unknown source group",
    );
  }
  for (const g of content.groups) {
    const existing = store.get(
      "SELECT documentId FROM groups WHERE id=?",
      g.id,
    );
    requireThat(
      !existing || existing.documentId === key,
      "Group belongs to another document",
      409,
    );
    if (g.categoryId) {
      store.resource("categories", g.categoryId);
      if (g.expected)
        requireThat(
          JSON.stringify(store.members(g.categoryId)) ===
            JSON.stringify([...g.expected].sort()),
          "Category members changed; refresh preview",
          409,
        );
    }
  }
  store.run("DELETE FROM groups WHERE documentId=?", key);
  for (const g of content.groups) {
    store.run(
      "INSERT INTO groups VALUES(?,?,?,?,?,?,?)",
      g.id,
      key,
      g.categoryId,
      g.originalCategoryId,
      g.name,
      JSON.stringify(g.members),
      JSON.stringify(g.excluded),
    );
  }
  for (const e of content.entries)
    for (const groupId of e.groupIds)
      store.run("INSERT INTO entry_sources VALUES(?,?)", e.id, groupId);
}
export function registerGroups(route: Route, store: Store) {
  const body = object(
    {
      ...contentSchema,
      categoryId: uuid,
      groupId: uuid,
      version,
      expected: { type: "array", items: uuid },
      choices: {
        type: "object",
        additionalProperties: object(
          { mode: { type: "string", enum: ["merge"] }, targetId: uuid },
          ["mode"],
        ),
      },
      removeIds: { type: "array", items: uuid },
      restore: { type: "array", items: uuid, uniqueItems: true },
    },
    ["entries", "groups", "categoryId", "version"],
  );
  for (const action of ["preview", "compose"])
    route(
      "POST",
      "/documents/:id/category-" + action,
      body,
      async (req: any) => {
        const d = active(store, req.params.id);
        store.version(d, req.body.version);
        const content: Content = {
          entries: req.body.entries,
          groups: req.body.groups,
          sections: req.body.sections ?? [],
        };
        const category = store.resource("categories", req.body.categoryId);
        const existing = req.body.groupId
          ? content.groups.find((g) => g.id === req.body.groupId)
          : content.groups.find((g) => g.categoryId === category.id);
        requireThat(!req.body.groupId || existing, "Group not found");
        const group: Group = existing || {
          id: id(),
          categoryId: category.id,
          originalCategoryId: category.id,
          name: category.name,
          members: [],
          excluded: [],
        };
        requireThat(
          group.categoryId === category.id,
          "Category does not match group",
        );
        const members = store.members(category.id);
        const items = members.map((k) => store.resource("items", k));
        const added = items.filter(
          (i) =>
            !group.excluded.includes(i.id) &&
            !content.entries.some(
              (e) => e.itemId === i.id && e.groupIds.includes(group.id),
            ),
        );
        const removed = content.entries.filter(
          (e) =>
            e.itemId &&
            e.groupIds.includes(group.id) &&
            !members.includes(e.itemId),
        );
        if (action === "preview")
          return {
            group,
            // Excluded current members: the user may add each back on apply.
            excluded: items.filter((i) => group.excluded.includes(i.id)),
            expected: members,
            added,
            removed,
            duplicates: added.filter((i) =>
              content.entries.some((e) => e.itemId === i.id),
            ),
          };
        requireThat(
          JSON.stringify(members) ===
            JSON.stringify([...(req.body.expected || [])].sort()),
          "Category members changed; refresh preview",
          409,
        );
        const restore: string[] = req.body.restore ?? [];
        requireThat(
          restore.every(
            (k) => group.excluded.includes(k) && members.includes(k),
          ),
          "Only excluded current members can be restored",
        );
        group.excluded = group.excluded.filter((k) => !restore.includes(k));
        return compose(content, group, items, id);
      },
    );
}
