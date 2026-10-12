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
};
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
export function removeSection(content: Content, key: string): Content {
  const parent =
    content.sections?.find((s) => s.id === key)?.parentSectionId ?? null;
  return {
    ...content,
    sections: (content.sections ?? [])
      .filter((s) => s.id !== key)
      .map((s) =>
        s.parentSectionId === key ? { ...s, parentSectionId: parent } : s,
      ),
    entries: content.entries.map((e) =>
      e.sectionId === key ? { ...e, sectionId: parent } : e,
    ),
  };
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
    next.entries = next.entries.filter(
      (e) => e.itemId !== duplicate.itemId || e.id === first.id,
    );
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
      if (visited.size > 3)
        throw invalid("Sections allow at most three levels");
      if (!node.parentSectionId) break;
      node = ids.get(node.parentSectionId);
      if (!node) throw invalid("Section parent must belong to this document");
    }
  }
  for (const e of content.entries)
    if (e.sectionId && !ids.has(e.sectionId))
      throw invalid("Entry section must belong to this document");
}
