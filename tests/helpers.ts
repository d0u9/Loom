import { Store, id, hash } from "../server/db.js";
import { app } from "../server/app.js";
export async function setup(path = ":memory:") {
  const store = new Store(path);
  const token = id();
  store.run("INSERT INTO tokens VALUES(?,?,?)", id(), "test", hash(token));
  const server = await app(store);
  return {
    store,
    server,
    call: async (method: any, path: string, payload?: any) =>
      server.inject({
        method,
        url: "/api/v1" + path,
        headers: { authorization: "Bearer " + token },
        payload,
      }),
    close: async () => {
      await server.close();
      store.close();
    },
  };
}
export function entry(item: any = null): import("../shared/groups.js").Entry {
  return {
    id: id(),
    itemId: item?.id || null,
    name: item?.name || "temporary",
    quantity: "2",
    unit: "pcs",
    note: "keep",
    checked: false,
  };
}
