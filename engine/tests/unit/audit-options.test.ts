import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAuditRunOptions, sanitizeAuditRunOptions } from "../../src/audit-options.ts";

test("normalizeAuditRunOptions applies defaults and deduplicates node versions", () => {
  const options = normalizeAuditRunOptions({
    sandbox: {
      nodeVersions: ["20", "22", "20"],
      cliBehaviorEnabled: true,
      aiScenariosEnabled: false,
    },
  });

  assert.deepEqual(options.sandbox.nodeVersions, ["20", "22"]);
  assert.equal(options.sandbox.cliBehaviorEnabled, true);
  assert.equal(options.sandbox.aiScenariosEnabled, false);
});

test("sanitizeAuditRunOptions removes ephemeral api keys", () => {
  const sanitized = sanitizeAuditRunOptions({
    llm: {
      providerName: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test-secret",
      model: "gpt-4.1-mini",
    },
    sandbox: {
      nodeVersions: ["20", "22"],
      cliBehaviorEnabled: true,
      aiScenariosEnabled: false,
    },
  });

  assert.deepEqual(sanitized.llm, {
    providerName: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
  });
  assert.ok(!("apiKey" in (sanitized.llm ?? {})));
});
