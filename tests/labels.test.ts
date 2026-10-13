import localized from "../locales/zh.json" with { type: "json" };
import { t as translate } from "../web/i18n.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { resourceLabels, errorLabel, errorText } from "../web/labels.js";
import { api } from "../web/client.js";

test("framework resource labels and API errors use Chinese while preserving reference names", async (t) => {
  assert.equal(errorText(new Error(localized["fixture.c526146cf0d0"])), localized["fixture.c526146cf0d0"]);
  assert.match(
    translate(errorText(new TypeError("Failed to fetch"))),
    new RegExp(localized["fixture.8d7d39d122a6"], ""),
  );
  assert.deepEqual(Object.values(resourceLabels), [
    localized["Item"],
    localized["Category"],
    localized["Template"],
    localized["Checklist"],
  ]);
  assert.equal(errorLabel("Invalid credentials", 401), localized["Incorrect username or password."]);
  assert.match(errorLabel("Unknown English error", 500), new RegExp(localized["fixture.8d7d39d122a6"], ""));
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      {
        message: "Item is referenced",
        details: [{ kind: "Category", name: localized["fixture.6bb5d777aca5"] }],
      },
      { status: 409 },
    ),
  );
  await assert.rejects(
    () => api("/items/example", "DELETE", {}),
    (e: any) => {
      assert.equal(e.status, 409);
      assert.match(e.message, new RegExp(localized["fixture.ba336b73acc4"], ""));
      assert.match(e.message, new RegExp(localized["fixture.d0112f269f26"], ""));
      assert.doesNotMatch(e.message, /Item|Category/);
      return true;
    },
  );
});
