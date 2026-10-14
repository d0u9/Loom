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
const section = object(
  {
    id: uuid,
    name: text,
    parentSectionId: nullable(uuid),
    afterEntryId: nullable(uuid),
  },
  ["id", "name", "parentSectionId"],
);
export const errorSchema = object({ message: text, details: {} }, ["message"]);
const item = object(
  {
    id: uuid,
    name: text,
    note: text,
    itemGroup: nullable(text),
    version: { type: "integer" },
    categoryIds: list(uuid),
  },
  ["id", "name", "version"],
);
const category = object({
  id: uuid,
  name: text,
  version: { type: "integer" },
});
const entry = object(
  {
    id: uuid,
    itemId: nullable(uuid),
    sectionId: nullable(uuid),
    name: text,
    quantity: text,
    unit: text,
    note: text,
    checked: { type: "boolean" },
  },
  ["id", "itemId", "name", "quantity", "unit", "note", "checked"],
);
export const documentSchema = object(
  {
    id: uuid,
    kind: { type: "string", enum: ["template", "checklist"] },
    name: text,
    version: { type: "integer" },
    useDate: nullable(text),
    status: { type: "string", enum: ["active", "archived"] },
    source: nullable({ type: "object", additionalProperties: true }),
    sections: list(section),
    entries: list(entry),
    schemaVersion: { type: "integer" },
    archivedAt: text,
  },
  ["id", "kind", "name", "version", "status", "entries"],
);
const summary = object(
  {
    id: uuid,
    kind: text,
    name: text,
    version: { type: "integer" },
    status: text,
    useDate: nullable(text),
    source: nullable({ type: "object", additionalProperties: true }),
    total: { type: "integer" },
    done: { type: "integer" },
  },
  ["id", "kind", "name", "version", "status", "total", "done"],
);
export function responseSchema(url: string, method: string) {
  const path = url.replace("/api/v1", "");
  if (path === "/openapi.json")
    return { type: "object", additionalProperties: true };
  if (path === "/login" || path === "/session" || path === "/setup")
    return object(
      {
        csrf: nullable(text),
        authEnabled: { type: "boolean" },
        setupRequired: { type: "boolean" },
        username: text,
      },
      ["csrf"],
    );
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
  if (path.endsWith("/order"))
    return object({ itemIds: list(uuid), version: { type: "integer" } });
  if (path.endsWith("/checklists") && method === "POST") return documentSchema;
  if (path.startsWith("/categories/")) return category;
  if (path === "/documents" && method === "GET") return list(summary);
  if (path.endsWith("/checked"))
    return object({ checked: { type: "boolean" } });
  if (path.endsWith("/history-preview"))
    return object({
      items: list(object({ id: uuid, name: text })),
      name: text,
      version: { type: "integer" },
      duplicates: list(object({ itemId: uuid, entries: list(entry) })),
    });
  return documentSchema;
}
