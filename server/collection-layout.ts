import { Store, requireThat } from "./db.js";
import { object, short, uuid, version, type Route } from "./schema.js";

export function registerCollectionLayout(
  route: Route,
  store: Store,
  kind: "category" | "template",
) {
  const field = kind === "category" ? "categories" : "templates";
  const table = kind === "category" ? "categories" : "documents";
  const filter = kind === "template" ? " WHERE kind='template'" : "";
  const path = `/${kind}-layout`;
  const read = () => ({
    ...store.get(`SELECT version,rootPosition FROM ${kind}_layout WHERE id=1`),
    sections: store.all(
      `SELECT id,name FROM ${kind}_sections ORDER BY position,id`,
    ),
    [field]: store.all(
      `SELECT c.id,p.sectionId FROM ${table} c LEFT JOIN ${kind}_positions p ON p.${kind}Id=c.id${filter} ORDER BY COALESCE(p.position,2147483647),c.name,c.id`,
    ),
  });
  route("GET", path, null, read);
  route(
    "PUT",
    path,
    object(
      {
        version,
        rootPosition: { type: "integer", minimum: 0 },
        requestId: uuid,
        sections: { type: "array", items: object({ id: uuid, name: short }) },
        [field]: {
          type: "array",
          items: object({
            id: uuid,
            sectionId: { anyOf: [uuid, { type: "null" }] },
          }),
        },
      },
      ["version", "requestId", "sections", field],
    ),
    (req: any) =>
      store.once(`${kind}-layout`, req.body, () => {
        const body = req.body;
        const rootPosition = body.rootPosition ?? 0;
        store.version(
          store.get(`SELECT version FROM ${kind}_layout WHERE id=1`),
          body.version,
        );
        const sectionIds = new Set(body.sections.map((s: any) => s.id));
        const recordIds = new Set(body[field].map((c: any) => c.id));
        const current = store.all(`SELECT id FROM ${table}${filter}`);
        requireThat(
          rootPosition <= body.sections.length,
          "Invalid section position",
        );
        requireThat(
          sectionIds.size === body.sections.length,
          "Duplicate section",
        );
        requireThat(
          body.sections.every((s: any) => s.name.trim()),
          "Section name is required",
        );
        requireThat(
          recordIds.size === body[field].length &&
            current.length === recordIds.size &&
            current.every((c) => recordIds.has(c.id)),
          "Collection changed",
          409,
        );
        requireThat(
          body[field].every(
            (c: any) => c.sectionId === null || sectionIds.has(c.sectionId),
          ),
          "Invalid section",
        );
        body.sections.forEach((s: any, position: number) =>
          store.run(
            `INSERT INTO ${kind}_sections(id,name,position) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,position=excluded.position`,
            s.id,
            s.name.trim(),
            position,
          ),
        );
        body[field].forEach((c: any, position: number) =>
          store.run(
            `INSERT INTO ${kind}_positions(${kind}Id,sectionId,position) VALUES(?,?,?) ON CONFLICT(${kind}Id) DO UPDATE SET sectionId=excluded.sectionId,position=excluded.position`,
            c.id,
            c.sectionId,
            position,
          ),
        );
        store.run(
          `DELETE FROM ${kind}_sections WHERE id NOT IN (SELECT value FROM json_each(?))`,
          JSON.stringify([...sectionIds]),
        );
        store.run(
          `UPDATE ${kind}_layout SET version=version+1,rootPosition=? WHERE id=1`,
          rootPosition,
        );
        return read();
      }),
  );
}
