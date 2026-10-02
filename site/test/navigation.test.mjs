import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../src/styles/site.css", import.meta.url), "utf8");

test("the top filter rail always wraps instead of scrolling or fading buttons", () => {
  const rail = /\.rail \{([^}]*)\}/.exec(styles)?.[1];
  assert.ok(rail, "the filter rail has no base style");
  assert.match(rail, /flex-wrap:\s*wrap/);
  assert.match(rail, /overflow-x:\s*visible/);
  assert.doesNotMatch(rail, /mask-image/);
});
