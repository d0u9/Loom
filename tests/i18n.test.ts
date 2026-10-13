import localized from "../locales/zh.json" with { type: "json" };
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { t, setLanguage, message } from "../web/i18n.js";
import { english } from "../web/translations.js";
import { resourceLabels, errorLabel, errorText } from "../web/labels.js";

test("all fixed framework translations have English entries and labels follow language changes", () => {
  for (const name of readdirSync("web").filter((f) => /\.tsx?$/.test(f))) {
    const source = ts.createSourceFile(
      name,
      readFileSync("web/" + name, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      name.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(source) === "t" &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        const key = node.arguments[0].text.trim();
        assert(english[key], `${name}: missing translation ${key}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  try {
    setLanguage("en");
    assert.equal(resourceLabels.Item, "Item");
    assert.equal(t(localized[" Save "]), " Save ");
    assert.equal(
      errorLabel("Invalid credentials", 401),
      "Incorrect username or password.",
    );
    const validation = errorText(new Error(t(localized["Save changes before using history actions."])));
    assert.equal(t(validation), "Save changes before using history actions.");
    const savedError = message(
      localized["Content changed. Refresh and retry."],
      localized["; retry is available. Reload if there is a conflict."],
      { literal: " User Name" },
    );
    assert.match(t(savedError), /Content changed/);
    setLanguage("zh");
    assert.equal(t(validation), localized["Save changes before using history actions."]);
    assert.equal(
      t(savedError),
      localized["fixture.fc5e56da097c"],
    );
    assert.equal(resourceLabels.Item, localized["Item"]);
    assert.equal(t(localized["Save"]), localized["Save"]);
  } finally {
    setLanguage("zh");
  }
});
