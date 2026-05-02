import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAuditRunOptions, sanitizeAuditRunOptions } from "../../src/audit-options.ts";

test("normalizeAuditRunOptions applies defaults and deduplicates node versions", () => {
  const options = normalizeAuditRunOptions({
    sandbox: {
      nodeVersions: ["22", "24", "22"],
      cliBehaviorEnabled: true,
      aiScenariosEnabled: false,
    },
  });

  assert.deepEqual(options.sandbox.nodeVersions, ["22", "24"]);
  assert.equal(options.sandbox.cliBehaviorEnabled, true);
  assert.equal(options.sandbox.aiScenariosEnabled, false);
  assert.equal(options.scanDepth, 3);
  assert.equal(options.securityMode, "balanced");
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
      nodeVersions: ["22", "24"],
      cliBehaviorEnabled: true,
      aiScenariosEnabled: false,
    },
    scanDepth: 5,
    securityMode: "strict",
  });

  assert.deepEqual(sanitized.llm, {
    providerName: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
  });
  assert.ok(!("apiKey" in (sanitized.llm ?? {})));
  assert.equal(sanitized.scanDepth, 5);
  assert.equal(sanitized.securityMode, "strict");
});

test("research mode requires llm configuration", () => {
  assert.throws(
    () =>
      normalizeAuditRunOptions({
        securityMode: "research",
        sandbox: {
          nodeVersions: ["22"],
          cliBehaviorEnabled: true,
          aiScenariosEnabled: false,
        },
      }),
    /Research mode requires LLM configuration/,
  );
});
