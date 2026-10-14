import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

test("tracked text and filenames use English outside bilingual resources", () => {
  const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const file of files) {
    assert.doesNotMatch(
      file,
      /[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/u,
      file,
    );
    if (file === "locales/zh.json") continue;
    let text: string;
    try {
      text = decoder.decode(readFileSync(file));
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      continue; // Binary assets have no source text to translate.
    }
    assert.doesNotMatch(
      text,
      /[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/u,
      file,
    );
  }
});
