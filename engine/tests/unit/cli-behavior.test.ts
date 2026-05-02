import test from "node:test";
import assert from "node:assert/strict";

import { deriveCliObservations, extractCliCommands } from "../../src/phases/cli-behavior.ts";

test("extractCliCommands detects string bin using package name", () => {
  const commands = extractCliCommands({
    name: "eslint",
    bin: "./bin/eslint.js",
  });

  assert.deepEqual(commands, [{ name: "eslint", entry: "./bin/eslint.js" }]);
});

test("extractCliCommands detects object bin entries", () => {
  const commands = extractCliCommands({
    bin: {
      foo: "./bin/foo.js",
      bar: "./bin/bar.js",
    },
  });

  assert.deepEqual(commands, [
    { name: "foo", entry: "./bin/foo.js" },
    { name: "bar", entry: "./bin/bar.js" },
  ]);
});

test("extractCliCommands returns empty array when bin is missing", () => {
  assert.deepEqual(extractCliCommands({ name: "left-pad" }), []);
});

test("deriveCliObservations flags network, env, process, filesystem, eval, timeout, and large output", () => {
  const observations = deriveCliObservations({
    trace: {
      modulesLoaded: [],
      networkCalls: [{ method: "GET", url: "https://example.com", bodyPreview: "" }],
      fsOperations: [{ op: "writeFileSync", path: "/etc/passwd", preview: "" }],
      envAccess: ["NPM_TOKEN", "PATH"],
      processSpawns: [{ cmd: "sh", args: ["-c", "echo hi"] }],
      evalCalls: [{ code: "Function('return 1')" }],
      cryptoOps: [],
      timers: [],
    },
    stdoutPreview: "[truncated at 65536 bytes]",
    stderrPreview: "",
    timedOut: true,
  });

  assert.deepEqual(
    observations.map((observation) => observation.kind),
    ["network", "env", "process", "filesystem", "eval", "timeout", "large_output"],
  );
});
