import { z } from "zod";

export const NodeVersionSchema = z.enum(["20", "22"]);
export type NodeVersion = z.infer<typeof NodeVersionSchema>;

export const AuditLlmOverrideSchema = z.object({
  providerName: z.string().trim().min(1).optional(),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
});
export type AuditLlmOverride = z.infer<typeof AuditLlmOverrideSchema>;

export const AuditSandboxOptionsSchema = z.object({
  nodeVersions: z.array(NodeVersionSchema).min(1).default(["20", "22"]),
  cliBehaviorEnabled: z.boolean().default(true),
  aiScenariosEnabled: z.boolean().default(false),
});
export type AuditSandboxOptions = z.infer<typeof AuditSandboxOptionsSchema>;

export const AuditRunOptionsSchema = z.object({
  llm: AuditLlmOverrideSchema.optional(),
  sandbox: AuditSandboxOptionsSchema.default({
    nodeVersions: ["20", "22"],
    cliBehaviorEnabled: true,
    aiScenariosEnabled: false,
  }),
});
export type AuditRunOptions = z.infer<typeof AuditRunOptionsSchema>;

export interface SanitizedAuditRunOptions {
  llm?: {
    providerName?: string;
    baseUrl?: string;
    model?: string;
  };
  sandbox: AuditSandboxOptions;
}

export function normalizeAuditRunOptions(input?: Partial<AuditRunOptions>): AuditRunOptions {
  const parsed = AuditRunOptionsSchema.parse(input ?? {});
  const dedupedNodeVersions = [...new Set(parsed.sandbox.nodeVersions)];
  return {
    ...parsed,
    sandbox: {
      ...parsed.sandbox,
      nodeVersions: dedupedNodeVersions,
    },
  };
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
  };
}
