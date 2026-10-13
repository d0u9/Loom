import test from "node:test";
import assert from "node:assert/strict";
import { setup } from "./helpers.js";
import { id } from "../server/db.js";
test("category order persists independently, validates membership and retries safely", async () => {
  const h = await setup();
  try {
    const parent = (await h.call("POST", "/categories", { name: "P" })).json();
    const child = (await h.call("POST", "/categories", { name: "C" })).json();
    const ids = [];
    for (const c of [parent, child])
      ids.push(
        (
          await h.call("POST", "/items", {
            name: "I",
            categoryIds: [c.id],
            requestId: id(),
          })
        ).json().id,
      );
    const path = `/categories/${parent.id}/order`;
    const before = (await h.call("GET", path)).json();
    const request = {
      itemIds: [...before.itemIds].reverse(),
      version: before.version,
      requestId: id(),
    };
    assert.equal((await h.call("PUT", path, request)).statusCode, 200);
    assert.deepEqual(
      (await h.call("GET", path)).json().itemIds,
      request.itemIds,
    );
    assert.equal((await h.call("PUT", path, request)).json().version, 2);
    assert.equal(
      (await h.call("PUT", path, { ...request, requestId: id() })).statusCode,
      409,
    );
    assert.equal(
      (await h.call("PUT", path, { itemIds: [], version: 2, requestId: id() }))
        .statusCode,
      409,
    );
    assert.equal(
      (
        await h.call("PUT", path, {
          itemIds: [ids[0], ids[0]],
          version: 2,
          requestId: id(),
        })
      ).statusCode,
      400,
    );
    assert.deepEqual(before.itemIds, [ids[0]]);
    assert.deepEqual(
      (await h.call("GET", `/categories/${child.id}/members`)).json().itemIds,
      [ids[1]],
    );
    assert.equal(h.store.all("SELECT * FROM item_categories").length, 2);
  } finally {
    await h.close();
  }
});
