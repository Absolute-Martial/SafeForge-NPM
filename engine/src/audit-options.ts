import { z } from "zod";
import { config } from "./config.js";
import { isLlmEnabled } from "./llm.js";

export const NodeVersionSchema = z.enum(["22", "24"]);
export type NodeVersion = z.infer<typeof NodeVersionSchema>;
export const SecurityModeSchema = z.enum(["strict", "balanced", "research"]);
export type SecurityMode = z.infer<typeof SecurityModeSchema>;

export const AuditLlmOverrideSchema = z.object({
  providerName: z.string().trim().min(1).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
});
export type AuditLlmOverride = z.infer<typeof AuditLlmOverrideSchema>;

export const AuditSandboxOptionsSchema = z.object({
  nodeVersions: z.array(NodeVersionSchema).min(1),
  cliBehaviorEnabled: z.boolean(),
  aiScenariosEnabled: z.boolean(),
});
export type AuditSandboxOptions = z.infer<typeof AuditSandboxOptionsSchema>;

export const AuditRunOptionsInputSchema = z.object({
  llm: AuditLlmOverrideSchema.optional(),
  sandbox: AuditSandboxOptionsSchema.optional(),
  publish: z.boolean().optional(),
  scanDepth: z.coerce.number().int().min(0).max(5).optional(),
  securityMode: SecurityModeSchema.optional(),
});

export interface AuditRunOptions {
  llm?: AuditLlmOverride;
  sandbox: AuditSandboxOptions;
  publish: boolean;
  scanDepth: number;
  securityMode: SecurityMode;
}

export interface SanitizedAuditRunOptions {
  llm?: {
    providerName?: string;
    baseUrl?: string;
    model?: string;
  };
  sandbox: AuditSandboxOptions;
  publish: boolean;
  scanDepth: number;
  securityMode: SecurityMode;
}

export function normalizeAuditRunOptions(input?: Partial<AuditRunOptions>): AuditRunOptions {
  const parsed = AuditRunOptionsInputSchema.parse(input ?? {});
  const sandbox = AuditSandboxOptionsSchema.parse({
    nodeVersions: parsed.sandbox?.nodeVersions ?? config.defaultNodeVersions,
    cliBehaviorEnabled: parsed.sandbox?.cliBehaviorEnabled ?? config.cliBehaviorEnabled,
    aiScenariosEnabled: parsed.sandbox?.aiScenariosEnabled ?? config.aiScenariosEnabled,
  });
  const dedupedNodeVersions = [...new Set(sandbox.nodeVersions)];
  const normalized: AuditRunOptions = {
    ...parsed,
    sandbox: {
      ...sandbox,
      nodeVersions: dedupedNodeVersions,
    },
    publish: parsed.publish ?? config.publishEnabled,
    scanDepth: parsed.scanDepth ?? config.defaultScanDepth,
    securityMode: parsed.securityMode ?? config.defaultSecurityMode,
  };

  if (normalized.securityMode === "research" && !isLlmEnabled(normalized.llm)) {
    throw new Error("Research mode requires LLM configuration. Enable LLM settings or choose Strict/Balanced mode.");
  }
  return normalized;
}

export function sanitizeAuditRunOptions(options?: AuditRunOptions): SanitizedAuditRunOptions {
  const normalized = normalizeAuditRunOptions(options);
  const llm = normalized.llm
    ? {
        providerName: normalized.llm.providerName,
        baseUrl: normalized.llm.baseUrl,
        model: normalized.llm.model,
      }
    : undefined;

  return {
    llm,
    sandbox: normalized.sandbox,
    publish: normalized.publish,
    scanDepth: normalized.scanDepth,
    securityMode: normalized.securityMode,
  };
}
