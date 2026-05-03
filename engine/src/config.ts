import "dotenv/config";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { readSavedSettings, SettingsLlmBackendSchema, SettingsSecurityModeSchema } from "./settings-store.js";

const ConfigSchema = z.object({
  llmEnabled: z.boolean().default(false),
  llmBackend: SettingsLlmBackendSchema.default("openai_compatible"),
  llmBaseUrl: z.string().url().optional(),
  llmApiKey: z.string().optional(),
  llmTimeoutSeconds: z.coerce.number().positive().default(60),

  apiHost: z.string().default("0.0.0.0"),
  apiPort: z.coerce.number().int().min(1).max(65535).default(8000),

  triageModel: z.string().default("claude-haiku-4-5-20251001"),
  triageRiskThreshold: z.coerce.number().int().min(0).max(10).default(3),

  investigationModel: z.string().default("claude-sonnet-4-6"),
  maxAgentTurns: z.coerce.number().int().min(1).max(200).default(30),
  investigationEnabled: z
    .string()
    .transform((v) => v.toLowerCase() !== "false")
    .default("true"),

  testGenModel: z.string().default("claude-sonnet-4-6"),
  testGenMode: z.enum(["openclaw", "direct"]).default("direct"),
  verifyTimeoutSec: z.coerce.number().int().min(10).max(300).default(60),

  sandboxImage: z.string().default("node:24-slim"),
  sandboxMemoryMb: z.coerce.number().int().min(64).max(4096).default(512),
  sandboxCpus: z.coerce.number().positive().max(4).default(1),
  sandboxNetwork: z.string().default("none"),
  maxDockerExecTimeoutSec: z.coerce.number().int().min(5).max(300).default(30),
  defaultNodeVersions: z.array(z.enum(["22", "24"])).min(1).default(["22", "24"]),
  defaultScanDepth: z.coerce.number().int().min(0).max(5).default(3),
  defaultSecurityMode: SettingsSecurityModeSchema.default("balanced"),
  cliBehaviorEnabled: z.boolean().default(true),
  aiScenariosEnabled: z.boolean().default(false),
  publishEnabled: z.boolean().default(true),

  runtimeRoot: z.string().default(path.join(os.tmpdir(), "safeforge-npm-runtime")),
  runtimeHostRoot: z.string().optional(),
  githubToken: z.string().optional(),
  nvdApiKey: z.string().optional(),
});

function loadConfig() {
  const env = process.env;
  const saved = readSavedSettings();
  const raw = {
    llmEnabled: env.SAFEFORGE_NPM_LLM_ENABLED,
    llmBackend: env.SAFEFORGE_NPM_LLM_BACKEND,
    llmBaseUrl: env.SAFEFORGE_NPM_LLM_BASE_URL,
    llmApiKey: env.SAFEFORGE_NPM_LLM_API_KEY,
    llmTimeoutSeconds: env.SAFEFORGE_NPM_LLM_TIMEOUT_SECONDS,
    apiHost: env.SAFEFORGE_NPM_API_HOST,
    apiPort: env.SAFEFORGE_NPM_API_PORT,
    triageModel: env.SAFEFORGE_NPM_TRIAGE_MODEL,
    triageRiskThreshold: env.SAFEFORGE_NPM_TRIAGE_RISK_THRESHOLD,
    investigationModel: env.SAFEFORGE_NPM_INVESTIGATION_MODEL,
    maxAgentTurns: env.SAFEFORGE_NPM_MAX_AGENT_TURNS,
    investigationEnabled: env.SAFEFORGE_NPM_INVESTIGATION_ENABLED,
    testGenModel: env.SAFEFORGE_NPM_TEST_GEN_MODEL,
    testGenMode: env.SAFEFORGE_NPM_TEST_GEN_MODE,
    verifyTimeoutSec: env.SAFEFORGE_NPM_VERIFY_TIMEOUT_SEC,
    sandboxImage: env.SAFEFORGE_NPM_SANDBOX_IMAGE,
    sandboxMemoryMb: env.SAFEFORGE_NPM_SANDBOX_MEMORY_MB,
    sandboxCpus: env.SAFEFORGE_NPM_SANDBOX_CPUS,
    sandboxNetwork: env.SAFEFORGE_NPM_SANDBOX_NETWORK,
    maxDockerExecTimeoutSec: env.SAFEFORGE_NPM_MAX_DOCKER_EXEC_TIMEOUT_SEC,
    defaultNodeVersions: env.SAFEFORGE_NPM_DEFAULT_NODE_VERSIONS?.split(",").map((value) => value.trim()).filter(Boolean),
    defaultScanDepth: env.SAFEFORGE_NPM_DEFAULT_SCAN_DEPTH,
    defaultSecurityMode: env.SAFEFORGE_NPM_DEFAULT_SECURITY_MODE,
    cliBehaviorEnabled: env.SAFEFORGE_NPM_CLI_BEHAVIOR_ENABLED,
    aiScenariosEnabled: env.SAFEFORGE_NPM_AI_SCENARIOS_ENABLED,
    publishEnabled: env.SAFEFORGE_NPM_PUBLISH_ENABLED,
    runtimeRoot: env.SAFEFORGE_NPM_RUNTIME_ROOT,
    runtimeHostRoot: env.SAFEFORGE_NPM_RUNTIME_HOST_ROOT,
    githubToken: env.SAFEFORGE_NPM_GITHUB_TOKEN,
    nvdApiKey: env.SAFEFORGE_NPM_NVD_API_KEY,
  };

  // Strip undefined keys so Zod defaults apply
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined),
  );

  const result = ConfigSchema.safeParse({
    ...saved,
    ...cleaned,
    llmEnabled: parseOptionalBoolean(cleaned.llmEnabled, saved.llmEnabled),
    cliBehaviorEnabled: parseOptionalBoolean(cleaned.cliBehaviorEnabled, saved.cliBehaviorEnabled),
    aiScenariosEnabled: parseOptionalBoolean(cleaned.aiScenariosEnabled, saved.aiScenariosEnabled),
    publishEnabled: parseOptionalBoolean(cleaned.publishEnabled, saved.publishEnabled),
  });
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${JSON.stringify(result.error.format(), null, 2)}`);
  }

  // Validate: openai_compatible requires base URL
  if (result.data.llmEnabled && result.data.llmBackend === "openai_compatible" && !result.data.llmBaseUrl) {
    throw new Error("SAFEFORGE_NPM_LLM_BASE_URL is required when SAFEFORGE_NPM_LLM_BACKEND=openai_compatible");
  }

  return result.data;
}

function parseOptionalBoolean(raw: unknown, fallback: boolean | undefined): boolean | undefined {
  if (typeof raw === "string") {
    return raw.toLowerCase() !== "false";
  }
  if (typeof raw === "boolean") {
    return raw;
  }
  return fallback;
}

export const config = loadConfig();

export function reloadConfig() {
  const next = loadConfig();
  Object.assign(config, next);
  return config;
}
export type Config = z.infer<typeof ConfigSchema>;

export const SKIP_DIRS = new Set(["node_modules", ".git", ".svn"]);

/** File types (from classify.ts) that the LLM analyzes in triage. */
export const SOURCE_FILE_TYPES = new Set(["js", "ts"]);
