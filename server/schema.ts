const text = { type: "string" },
  nullable = (s: any) => ({ anyOf: [s, { type: "null" }] }),
  list = (s: any) => ({ type: "array", items: s });
export type Route = (
  method: string,
  path: string,
  body: any,
  handler: any,
) => unknown;
export const uuid = { type: "string", format: "uuid" },
  short = { type: "string", minLength: 1, maxLength: 200 },
  version = { type: "integer", minimum: 1 };
export const object = (
  properties: any,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });
export const errorSchema = object({ message: text, details: {} }, ["message"]);
const item = object(
  {
    id: uuid,
    name: text,
    note: text,
    version: { type: "integer" },
    categoryIds: list(uuid),
  },
  ["id", "name", "version"],
);
const category = object({
  id: uuid,
  name: text,
  parentId: nullable(uuid),
  version: { type: "integer" },
});
const entry = object({
  id: uuid,
  itemId: nullable(uuid),
  name: text,
  quantity: text,
  unit: text,
  note: text,
  checked: { type: "boolean" },
  direct: { type: "boolean" },
  groupIds: list(uuid),
});
const group = object(
  {
    id: uuid,
    categoryId: nullable(uuid),
    originalCategoryId: uuid,
    name: text,
    members: list(uuid),
    excluded: list(uuid),
    expected: list(uuid),
  },
  ["id", "categoryId", "originalCategoryId", "name", "members", "excluded"],
);
export const documentSchema = object(
  {
    id: uuid,
    kind: { type: "string", enum: ["template", "checklist"] },
    name: text,
    version: { type: "integer" },
    status: { type: "string", enum: ["active", "archived"] },
    source: nullable({ type: "object", additionalProperties: true }),
    entries: list(entry),
    groups: list(group),
    schemaVersion: { type: "integer" },
    revision: { type: "integer" },
    archivedAt: text,
  },
  ["id", "kind", "name", "version", "status", "entries", "groups"],
);
const summary = object(
  {
    id: uuid,
    kind: text,
    name: text,
    version: { type: "integer" },
    status: text,
    source: nullable({ type: "object", additionalProperties: true }),
  },
  ["id", "kind", "name", "version", "status"],
);
export function responseSchema(url: string, method: string) {
  const path = url.replace("/api/v1", "");
  if (path === "/openapi.json")
    return { type: "object", additionalProperties: true };
  if (path === "/login" || path === "/session")
    return object({ csrf: nullable(text) });
  if (method === "DELETE" || path === "/logout")
    return object({ ok: { type: "boolean" } });
  if (path === "/tokens")
    return method === "GET"
      ? list(object({ id: uuid, name: text }))
      : object({ id: uuid, token: text });
  if (path === "/items") return method === "GET" ? list(item) : item;
  if (path.startsWith("/items/")) return item;
  if (path.endsWith("/members")) return object({ itemIds: list(uuid) });
  if (path === "/categories")
    return method === "GET" ? list(category) : category;
  if (path.startsWith("/categories/")) return category;
  if (path === "/documents" && method === "GET") return list(summary);
  if (path.endsWith("/revisions"))
    return list(object({ revision: { type: "integer" } }));
  if (path.endsWith("/checked"))
    return object({ checked: { type: "boolean" } });
  if (path.endsWith("/history-preview"))
    return object({
      items: list(object({ id: uuid, name: text })),
      categories: list(object({ id: uuid, name: text })),
      name: text,
      version: { type: "integer" },
    });
  if (path.endsWith("/category-preview"))
    return object({
      group,
      expected: list(uuid),
      added: list(item),
      removed: list(entry),
      duplicates: list(item),
    });
  if (path.endsWith("/category-compose"))
    return object({ entries: list(entry), groups: list(group) });
  return documentSchema;
}
