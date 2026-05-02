import test from "node:test";
import assert from "node:assert/strict";

import { withPatchedEnv } from "../helpers/env.ts";

const configModuleUrl = new URL("../../src/config.ts", import.meta.url).href;

async function loadFreshConfigModule() {
  return await import(`${configModuleUrl}?t=${Date.now()}-${Math.random()}`);
}

test("config defaults to settings-first OpenAI-compatible values", async () => {
  const mod = await withPatchedEnv(
    {
      SAFEFORGE_NPM_LLM_ENABLED: undefined,
      SAFEFORGE_NPM_LLM_BACKEND: undefined,
      SAFEFORGE_NPM_LLM_BASE_URL: undefined,
      SAFEFORGE_NPM_LLM_API_KEY: undefined,
      SAFEFORGE_NPM_CLI_BEHAVIOR_ENABLED: undefined,
      SAFEFORGE_NPM_AI_SCENARIOS_ENABLED: undefined,
      SAFEFORGE_NPM_PUBLISH_ENABLED: undefined,
    },
    async () => await loadFreshConfigModule(),
  );

  assert.equal(mod.config.llmEnabled, false);
  assert.equal(mod.config.llmBackend, "openai_compatible");
  assert.equal(mod.config.llmBaseUrl, undefined);
  assert.equal(mod.config.cliBehaviorEnabled, true);
  assert.equal(mod.config.publishEnabled, true);
  assert.deepEqual(mod.config.defaultNodeVersions, ["22", "24"]);
  assert.equal(mod.config.defaultScanDepth, 3);
  assert.equal(mod.config.defaultSecurityMode, "balanced");
});

test("config accepts explicit llm and sandbox toggle env vars", async () => {
  const mod = await withPatchedEnv(
    {
      SAFEFORGE_NPM_LLM_ENABLED: "true",
      SAFEFORGE_NPM_LLM_BACKEND: "openai_compatible",
      SAFEFORGE_NPM_LLM_BASE_URL: "https://api.openai.com/v1",
      SAFEFORGE_NPM_LLM_API_KEY: "sk-test",
      SAFEFORGE_NPM_CLI_BEHAVIOR_ENABLED: "false",
      SAFEFORGE_NPM_AI_SCENARIOS_ENABLED: "true",
      SAFEFORGE_NPM_PUBLISH_ENABLED: "false",
      SAFEFORGE_NPM_DEFAULT_NODE_VERSIONS: "24,22",
      SAFEFORGE_NPM_DEFAULT_SCAN_DEPTH: "5",
      SAFEFORGE_NPM_DEFAULT_SECURITY_MODE: "strict",
    },
    async () => await loadFreshConfigModule(),
  );

  assert.equal(mod.config.llmEnabled, true);
  assert.equal(mod.config.llmApiKey, "sk-test");
  assert.equal(mod.config.cliBehaviorEnabled, false);
  assert.equal(mod.config.aiScenariosEnabled, true);
  assert.equal(mod.config.publishEnabled, false);
  assert.deepEqual(mod.config.defaultNodeVersions, ["24", "22"]);
  assert.equal(mod.config.defaultScanDepth, 5);
  assert.equal(mod.config.defaultSecurityMode, "strict");
});

test("config validates openai-compatible backend only when llm is enabled", async () => {
  const disabled = await withPatchedEnv(
    {
      SAFEFORGE_NPM_LLM_ENABLED: "false",
      SAFEFORGE_NPM_LLM_BACKEND: "openai_compatible",
      SAFEFORGE_NPM_LLM_BASE_URL: undefined,
    },
    async () => await loadFreshConfigModule(),
  );

  assert.equal(disabled.config.llmEnabled, false);

  await assert.rejects(
    async () =>
      await withPatchedEnv(
        {
          SAFEFORGE_NPM_LLM_ENABLED: "true",
          SAFEFORGE_NPM_LLM_BACKEND: "openai_compatible",
          SAFEFORGE_NPM_LLM_BASE_URL: undefined,
        },
        async () => await loadFreshConfigModule(),
      ),
    /SAFEFORGE_NPM_LLM_BASE_URL is required when SAFEFORGE_NPM_LLM_BACKEND=openai_compatible/,
  );
});
