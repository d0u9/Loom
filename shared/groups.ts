export type Entry = {
  id: string;
  sectionId?: string | null;
  itemId: string | null;
  name: string;
  quantity: string;
  unit: string;
  note: string;
  checked: boolean;
  direct: boolean;
  groupIds: string[];
};
export type Group = {
  id: string;
  categoryId: string | null;
  originalCategoryId: string;
  name: string;
  members: string[];
  excluded: string[];
  expected?: string[];
};
export type Section = {
  id: string;
  name: string;
  parentSectionId: string | null;
  /** Previous sibling entry; sections and entries share one order per
   *  parent. null = before all entries; missing (old data) or stale = after. */
  afterEntryId?: string | null;
};
export type Node = { entry: Entry } | { section: Section };
export type Content = {
  entries: Entry[];
  groups: Group[];
  sections?: Section[];
};
export function removeEntry(content: Content, key: string): Content {
  const target = content.entries.find((e) => e.id === key)!;
  const entries = content.entries.filter((e) => e.id !== key);
  return {
    ...content,
    entries,
    groups: content.groups.map((g) =>
      target.itemId &&
      target.groupIds.includes(g.id) &&
      !entries.some(
        (e) => e.itemId === target.itemId && e.groupIds.includes(g.id),
      )
        ? { ...g, excluded: [...new Set([...g.excluded, target.itemId])] }
        : g,
    ),
  };
}
const invalid = (message: string) =>
  Object.assign(new Error(message), { statusCode: 400 });
export function compose(
  content: Content,
  group: Group,
  members: { id: string; name: string }[],
  uuid: () => string,
): Content {
  const next = structuredClone(content),
    current = next.groups.find((g) => g.id === group.id);
  if (!current) next.groups.push(structuredClone(group));
  const g = next.groups.find((g) => g.id === group.id)!;
  const ids = members.map((m) => m.id).sort();
  for (const e of [...next.entries])
    if (e.groupIds.includes(g.id) && e.itemId && !ids.includes(e.itemId)) {
      e.groupIds = e.groupIds.filter((k) => k !== g.id);
      if (!e.direct && !e.groupIds.length) {
        next.entries = next.entries.filter((x) => x.id !== e.id);
      }
    }
  for (const item of members) {
    if (
      g.excluded.includes(item.id) ||
      next.entries.some(
        (e) => e.itemId === item.id && e.groupIds.includes(g.id),
      )
    )
      continue;
    const existing = next.entries.filter((e) => e.itemId === item.id);
    if (existing.length) {
      existing[0].groupIds.push(g.id);
      continue;
    }
    next.entries.push({
      id: uuid(),
      itemId: item.id,
      name: item.name,
      quantity: "",
      unit: "",
      note: "",
      checked: false,
      direct: false,
      groupIds: [g.id],
    });
  }
  g.members = ids;
  g.expected = ids;
  return next;
}

export function removeGroup(content: Content, key: string): Content {
  const entries = content.entries.map((e) => ({
    ...e,
    groupIds: e.groupIds.filter((k) => k !== key),
  }));
  return {
    ...content,
    groups: content.groups.filter((g) => g.id !== key),
    entries: entries.filter((e) => e.direct || e.groupIds.length),
  };
}
// Children of one parent in display order: entries keep array order and
// each section follows its anchor entry; new entries therefore land last.
export function children(content: Content, parent: string | null): Node[] {
  const nodes: Node[] = content.entries
    .filter((e) => (e.sectionId ?? null) === parent)
    .map((entry) => ({ entry }));
  for (const section of (content.sections ?? []).filter(
    (s) => s.parentSectionId === parent,
  )) {
    const anchor = nodes.findIndex(
      (n) => "entry" in n && n.entry.id === section.afterEntryId,
    );
    let at =
      section.afterEntryId === null
        ? 0
        : anchor < 0
          ? nodes.length
          : anchor + 1;
    // Sections sharing an anchor keep array order.
    while (at < nodes.length && "section" in nodes[at]) at++;
    nodes.splice(at, 0, { section });
  }
  return nodes;
}
type Tree = Map<string | null, Node[]>;
function tree(content: Content): Tree {
  const map: Tree = new Map([[null, children(content, null)]]);
  for (const s of content.sections ?? [])
    map.set(s.id, children(content, s.id));
  return map;
}
// Rebuilds entries/sections arrays and anchors from a tree.
function flatten(content: Content, map: Tree): Content {
  const entries: Entry[] = [],
    sections: Section[] = [];
  const walk = (parent: string | null) => {
    const nodes = map.get(parent) ?? [];
    nodes.forEach((n, i) => {
      if ("entry" in n) return entries.push({ ...n.entry, sectionId: parent });
      const prev = nodes
        .slice(0, i)
        .findLast((m): m is { entry: Entry } => "entry" in m);
      sections.push({
        ...n.section,
        parentSectionId: parent,
        afterEntryId: prev?.entry.id ?? null,
      });
      walk(n.section.id);
    });
  };
  walk(null);
  return { ...content, entries, sections };
}
export const nodeId = (n: Node) => ("entry" in n ? n.entry.id : n.section.id);
/** Moves an entry or section next to (or, with `into`, inside) a target row. */
export function moveNode(
  content: Content,
  id: string,
  targetId: string,
  place: "before" | "after" | "into",
): Content {
  if (id === targetId) return content;
  // A section cannot move into or next to anything inside its own subtree.
  const sections = new Map((content.sections ?? []).map((s) => [s.id, s]));
  let up: string | null | undefined =
    sections.get(targetId)?.parentSectionId ??
    content.entries.find((e) => e.id === targetId)?.sectionId;
  if (place === "into") up = targetId;
  for (; up; up = sections.get(up)?.parentSectionId)
    if (up === id) return content;
  const map = tree(content);
  let node: Node | undefined;
  for (const list of map.values()) {
    const i = list.findIndex((n) => nodeId(n) === id);
    if (i >= 0) node = list.splice(i, 1)[0];
  }
  if (!node) return content;
  if (place === "into") {
    if (!map.has(targetId)) return content;
    map.get(targetId)!.unshift(node);
  } else {
    const list = [...map.values()].find((l) =>
      l.some((n) => nodeId(n) === targetId),
    );
    if (!list) return content;
    const i = list.findIndex((n) => nodeId(n) === targetId);
    list.splice(place === "after" ? i + 1 : i, 0, node);
  }
  return flatten(content, map);
}
// Deleting a section promotes its contents into its place.
export function removeSection(content: Content, key: string): Content {
  const map = tree(content);
  for (const list of map.values()) {
    const i = list.findIndex((n) => "section" in n && n.section.id === key);
    if (i >= 0) list.splice(i, 1, ...(map.get(key) ?? []));
  }
  map.delete(key);
  return flatten(content, map);
}
export function duplicateItems(content: Content) {
  return [
    ...new Set(content.entries.map((e) => e.itemId).filter(Boolean)),
  ].flatMap((itemId) => {
    const entries = content.entries.filter((e) => e.itemId === itemId);
    return entries.length > 1 ? [{ itemId: itemId!, entries }] : [];
  });
}
export function mergeContent(
  content: Content,
  targets: Record<string, string> = {},
): Content {
  const next = structuredClone(content);
  for (const duplicate of duplicateItems(next)) {
    const target = duplicate.entries.find(
      (e) => e.id === targets[duplicate.itemId],
    );
    const first = target ?? duplicate.entries[0];
    const conflict = duplicate.entries.some((e) =>
      ["quantity", "unit", "note", "checked", "sectionId"].some(
        (k) => (e as any)[k] !== (first as any)[k],
      ),
    );
    if (conflict && !target)
      throw Object.assign(
        invalid("Choose values to retain for duplicate Item"),
        { statusCode: 409, details: duplicateItems(next) },
      );
    first.direct = duplicate.entries.some((e) => e.direct);
    first.groupIds = [...new Set(duplicate.entries.flatMap((e) => e.groupIds))];
    const gone = new Set(
      duplicate.entries.filter((e) => e !== first).map((e) => e.id),
    );
    // Sections anchored to a merged-away entry keep their place.
    for (const section of next.sections ?? []) {
      if (!gone.has(section.afterEntryId ?? "")) continue;
      const before = children(next, section.parentSectionId)
        .filter((n): n is { entry: Entry } => "entry" in n)
        .map((n) => n.entry.id);
      section.afterEntryId =
        before
          .slice(0, before.indexOf(section.afterEntryId!))
          .findLast((k) => !gone.has(k)) ?? null;
    }
    next.entries = next.entries.filter((e) => !gone.has(e.id));
  }
  for (const group of [...next.groups]) {
    if (!group.categoryId) continue;
    const first = next.groups.find((g) => g.categoryId === group.categoryId)!;
    if (first.id === group.id) continue;
    first.members = [...new Set([...first.members, ...group.members])];
    first.excluded = first.excluded.filter((k) => group.excluded.includes(k));
    for (const e of next.entries)
      e.groupIds = [
        ...new Set(e.groupIds.map((k) => (k === group.id ? first.id : k))),
      ];
    next.groups = next.groups.filter((g) => g.id !== group.id);
  }
  return next;
}

export function validateSections(content: Content) {
  const sections = content.sections ?? [],
    ids = new Map(sections.map((s) => [s.id, s]));
  if (ids.size !== sections.length) throw invalid("Duplicate section ID");
  for (const section of sections) {
    if (!section.name.trim()) throw invalid("Section needs a name");
    let node: Section | undefined = section;
    const visited = new Set<string>();
    while (node) {
      if (visited.has(node.id)) throw invalid("Section cycle");
      visited.add(node.id);
      if (visited.size > 2) throw invalid("Sections allow at most two levels");
      if (!node.parentSectionId) break;
      node = ids.get(node.parentSectionId);
      if (!node) throw invalid("Section parent must belong to this document");
    }
  }
  for (const e of content.entries)
    if (e.sectionId && !ids.has(e.sectionId))
      throw invalid("Entry section must belong to this document");
}
