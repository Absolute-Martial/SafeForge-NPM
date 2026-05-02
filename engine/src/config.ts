import "dotenv/config";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";

const LLMBackend = z.enum(["anthropic", "openai_compatible"]);

const ConfigSchema = z.object({
  llmBackend: LLMBackend.default("anthropic"),
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

  sandboxImage: z.string().default("node:22-slim"),
  sandboxMemoryMb: z.coerce.number().int().min(64).max(4096).default(512),
  sandboxCpus: z.coerce.number().positive().max(4).default(1),
  sandboxNetwork: z.string().default("none"),
  maxDockerExecTimeoutSec: z.coerce.number().int().min(5).max(300).default(30),

  runtimeRoot: z.string().default(path.join(os.tmpdir(), "safeforge-npm-runtime")),
  runtimeHostRoot: z.string().optional(),
  githubToken: z.string().optional(),
  nvdApiKey: z.string().optional(),
});

function loadConfig() {
  const env = process.env;
  const raw = {
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
    runtimeRoot: env.SAFEFORGE_NPM_RUNTIME_ROOT,
    runtimeHostRoot: env.SAFEFORGE_NPM_RUNTIME_HOST_ROOT,
    githubToken: env.SAFEFORGE_NPM_GITHUB_TOKEN,
    nvdApiKey: env.SAFEFORGE_NPM_NVD_API_KEY,
  };

  // Strip undefined keys so Zod defaults apply
  const cleaned = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined),
  );

  const result = ConfigSchema.safeParse(cleaned);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${JSON.stringify(result.error.format(), null, 2)}`);
  }

  // Validate: openai_compatible requires base URL
  if (result.data.llmBackend === "openai_compatible" && !result.data.llmBaseUrl) {
    throw new Error("SAFEFORGE_NPM_LLM_BASE_URL is required when SAFEFORGE_NPM_LLM_BACKEND=openai_compatible");
  }

  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof ConfigSchema>;

export const SKIP_DIRS = new Set(["node_modules", ".git", ".svn"]);

/** File types (from classify.ts) that the LLM analyzes in triage. */
export const SOURCE_FILE_TYPES = new Set(["js", "ts"]);
