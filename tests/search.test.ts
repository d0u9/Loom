import { test } from "node:test";
import assert from "node:assert/strict";
import localized from "../locales/zh.json" with { type: "json" };
import { matchesText } from "../web/router.js";

test("pinyin matching accepts spaces between syllables", () => {
  const name = localized["fixture.pinyin.sponge-gourd"];
  for (const query of ["sigua", "si gua", " SI  GUA ", "s g"])
    assert.equal(matchesText(name, query), true, query);
  assert.equal(matchesText(name, name), true);
  assert.equal(
    matchesText(localized["fixture.pinyin.watermelon"], "si gua"),
    false,
  );
  assert.equal(matchesText("Travel bag", "travel bag"), true);
});
