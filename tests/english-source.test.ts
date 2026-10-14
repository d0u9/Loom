import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

test("program source keeps localized text in separate resources", () => {
  function inspect(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (/\.(ts|tsx|js|mjs|cjs|css|html)$/.test(file))
        assert.doesNotMatch(
          readFileSync(file, "utf8"),
          /\p{Script=Han}/u,
          file,
        );
    }
  }
  for (const directory of [
    "server",
    "shared",
    "web",
    "tests",
    "e2e",
    "scripts",
  ])
    inspect(directory);
});
