import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject as _generateObject } from "ai";
import type { AuditLlmOverride } from "./audit-options.js";
import { config } from "./config.js";

function hasRuntimeOverride(runtime?: AuditLlmOverride): boolean {
  return !!runtime && Object.keys(runtime).length > 0;
}

export function isLlmEnabled(runtime?: AuditLlmOverride): boolean {
  return hasRuntimeOverride(runtime) || config.llmEnabled;
}

export function getModel(modelName: string, runtime?: AuditLlmOverride) {
  const runtimeModelName = runtime?.model ?? modelName;

  if (hasRuntimeOverride(runtime)) {
    const baseURL = runtime?.baseUrl ?? config.llmBaseUrl;
    if (!baseURL) {
      throw new Error("An OpenAI-compatible base URL is required for per-scan provider overrides");
    }
    const openai = createOpenAI({
      baseURL,
      apiKey: runtime?.apiKey ?? config.llmApiKey ?? "",
    });
    return openai(runtimeModelName);
  }

  if (config.llmBackend === "anthropic") {
    return anthropic(runtimeModelName);
  }
  if (!config.llmBaseUrl) {
    throw new Error("SAFEFORGE_NPM_LLM_BASE_URL is required for openai_compatible backend");
  }
  const openai = createOpenAI({
    baseURL: config.llmBaseUrl,
    apiKey: config.llmApiKey ?? "",
  });
  return openai(runtimeModelName);
}

/** Returns the best generateObject mode for the current LLM backend.
 *  Qwen/OpenAI-compatible models fail with "tool" mode — use "json" instead. */
export function getObjectMode(runtime?: AuditLlmOverride): "tool" | "json" {
  if (hasRuntimeOverride(runtime)) return "json";
  return config.llmBackend === "anthropic" ? "tool" : "json";
}

/**
 * Wrapper around generateObject that retries on "No object generated" errors.
 * This happens when the model doesn't produce a valid tool call.
 */
export async function generateObjectWithRetry(
  opts: any,
  maxRetries = 3,
): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await _generateObject(opts);
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("No object generated") && attempt < maxRetries) {
        console.warn(`[llm] generateObject failed (attempt ${attempt}/${maxRetries}): ${msg} — retrying...`);
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}
