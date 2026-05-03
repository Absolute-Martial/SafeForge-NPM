import test from "node:test";
import assert from "node:assert/strict";

import { withPatchedEnv } from "../helpers/env.ts";

const llmModuleUrl = new URL("../../src/llm.ts", import.meta.url).href;

async function loadFreshLlmModule() {
  return await import(`${llmModuleUrl}?t=${Date.now()}-${Math.random()}`);
}

test("getObjectMode switches to json for per-scan provider overrides", async () => {
  const mod = await withPatchedEnv(
    {
      SAFEFORGE_NPM_LLM_BACKEND: "anthropic",
    },
    async () => await loadFreshLlmModule(),
  );

  assert.equal(mod.getObjectMode(), "tool");
  assert.equal(mod.getObjectMode({ providerName: "openai", baseUrl: "https://api.openai.com/v1" }), "json");
});

test("getModel accepts explicit per-scan OpenAI-compatible runtime config", async () => {
  const mod = await loadFreshLlmModule();

  const model = mod.getModel("test-model", {
    providerName: "custom",
    model: "runtime-model",
    baseUrl: "https://example.test/v1",
    apiKey: "runtime-key",
  });

  assert.ok(model);
});
