import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";

export const SettingsLlmBackendSchema = z.enum(["anthropic", "openai_compatible"]);
export const SettingsNodeVersionSchema = z.enum(["22", "24"]);
export const SettingsSecurityModeSchema = z.enum(["strict", "balanced", "research"]);

export const StoredSettingsSchema = z.object({
  llmEnabled: z.boolean().default(false),
  llmBackend: SettingsLlmBackendSchema.default("openai_compatible"),
  llmBaseUrl: z.string().url().default("https://api.openai.com/v1"),
  llmApiKey: z.string().optional(),
  triageModel: z.string().default("gpt-4.1-mini"),
  investigationModel: z.string().default("gpt-4.1"),
  testGenModel: z.string().default("gpt-4.1"),
  githubToken: z.string().optional(),
  nvdApiKey: z.string().optional(),
  defaultNodeVersions: z.array(SettingsNodeVersionSchema).min(1).default(["22", "24"]),
  defaultScanDepth: z.coerce.number().int().min(0).max(5).default(3),
  defaultSecurityMode: SettingsSecurityModeSchema.default("balanced"),
  cliBehaviorEnabled: z.boolean().default(true),
  aiScenariosEnabled: z.boolean().default(false),
  publishEnabled: z.boolean().default(true),
  sandboxImage: z.string().default("node:24-slim"),
  sandboxMemoryMb: z.coerce.number().int().min(64).max(4096).default(512),
  sandboxCpus: z.coerce.number().positive().max(4).default(1),
  sandboxNetwork: z.string().default("none"),
  maxDockerExecTimeoutSec: z.coerce.number().int().min(5).max(300).default(30),
  runtimeRoot: z.string().optional(),
  runtimeHostRoot: z.string().optional(),
});

export type StoredSettings = z.infer<typeof StoredSettingsSchema>;

const SETTINGS_FILE_PATH = path.resolve(import.meta.dirname, "../../settings.local.json");

export function getSettingsFilePath(): string {
  return SETTINGS_FILE_PATH;
}

export function readSavedSettings(): Partial<StoredSettings> {
  if (!fs.existsSync(SETTINGS_FILE_PATH)) {
    return {};
  }

  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE_PATH, "utf-8")) as unknown;
    return StoredSettingsSchema.partial().parse(raw);
  } catch (error) {
    console.warn(`[settings] failed to parse ${SETTINGS_FILE_PATH}: ${error instanceof Error ? error.message : "unknown error"}`);
    return {};
  }
}

export function readResolvedSettings(): StoredSettings {
  return StoredSettingsSchema.parse({
    ...StoredSettingsSchema.parse({}),
    ...readSavedSettings(),
  });
}

export function writeSavedSettings(input: Partial<StoredSettings>): StoredSettings {
  const normalizedInput = {
    ...input,
    llmApiKey: normalizeOptionalString(input.llmApiKey),
    githubToken: normalizeOptionalString(input.githubToken),
    nvdApiKey: normalizeOptionalString(input.nvdApiKey),
    runtimeRoot: normalizeOptionalString(input.runtimeRoot),
    runtimeHostRoot: normalizeOptionalString(input.runtimeHostRoot),
    llmBaseUrl: normalizeBaseUrl(input.llmBaseUrl),
  };
  const merged = StoredSettingsSchema.parse({
    ...readResolvedSettings(),
    ...normalizedInput,
    defaultNodeVersions: normalizedInput.defaultNodeVersions ? [...new Set(normalizedInput.defaultNodeVersions)] : undefined,
  });

  fs.writeFileSync(SETTINGS_FILE_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
  return merged;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBaseUrl(value: string | undefined): string | undefined {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
