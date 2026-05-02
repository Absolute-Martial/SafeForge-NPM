import test from "node:test";
import assert from "node:assert/strict";

import { parsePackageSpec } from "../../src/package-spec.ts";

test("parsePackageSpec handles unscoped packages with versions", () => {
  assert.deepEqual(parsePackageSpec("event-stream@3.3.6"), {
    name: "event-stream",
    version: "3.3.6",
  });
});

test("parsePackageSpec handles scoped packages with versions", () => {
  assert.deepEqual(parsePackageSpec("@scope/tool@2.4.6"), {
    name: "@scope/tool",
    version: "2.4.6",
  });
});

test("parsePackageSpec handles latest tags without versions", () => {
  assert.deepEqual(parsePackageSpec("left-pad"), {
    name: "left-pad",
  });
});
