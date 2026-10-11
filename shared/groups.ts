export type Entry = {
  id: string;
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
export type Content = { entries: Entry[]; groups: Group[] };
export function removeEntry(content: Content, key: string): Content {
  const target = content.entries.find((e) => e.id === key)!;
  const entries = content.entries.filter((e) => e.id !== key);
  return {
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
  choices: Record<string, { mode: string; targetId?: string }>,
  removeIds: string[],
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
        if (removeIds.includes(e.id))
          next.entries = next.entries.filter((x) => x.id !== e.id);
        else e.direct = true;
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
      const choice = choices[item.id];
      if (!choice || !["merge", "keep"].includes(choice.mode))
        throw invalid("Choose Merge or Keep both for " + item.name);
      if (choice.mode === "merge") {
        const target = existing.find((e) => e.id === choice.targetId);
        if (!target) throw invalid("Choose a valid merge target");
        target.groupIds.push(g.id);
        continue;
      }
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
