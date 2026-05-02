import type { AuditLlmOverride } from "../audit-options.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { config } from "../config.js";
import { CapabilityEnum, type FamilyAnalysis, type FileVerdict, type Finding, type InvestigationInput, type InventoryReport, type PrioritizedEntrypoint, type Proof, type ReasoningStageSummary, type ToolCallRecord, type TriageResult, type EvidenceGraph } from "../models.js";
import { DockerSandboxController } from "../sandbox/controller.js";
import { runInvestigationAgent } from "../investigation/agent.js";
import { LIFECYCLE_SCRIPTS, extractScriptFileRef } from "../inventory/parse-manifest.js";
import type { EmitFn } from "../events.js";
import type { AuditLogger } from "../audit-log.js";

export interface InvestigationResult {
  capabilities: CapabilityEnum[];
  proofs: Proof[];
  findings: Finding[];
  stageSummaries: ReasoningStageSummary[];
  prioritizedEntrypoints: PrioritizedEntrypoint[];
  familyAnalyses: FamilyAnalysis[];
  evidenceGraph: EvidenceGraph;
  toolCalls: ToolCallRecord[];
  agentText: string;
}

function readReadmeExcerpt(packagePath: string): string {
  const candidateNames = [
    "README.md",
    "README.mdx",
    "README.txt",
    "README",
    "readme.md",
  ];
  for (const candidate of candidateNames) {
    const filePath = path.join(packagePath, candidate);
    if (!fs.existsSync(filePath)) continue;
    try {
      return fs.readFileSync(filePath, "utf-8").slice(0, 4000);
    } catch {
      return "";
    }
  }
  return "";
}

export async function investigate(
  packagePath: string,
  inventory: InventoryReport,
  triage: TriageResult,
  fileVerdicts: FileVerdict[],
  llmRuntime?: AuditLlmOverride,
  emit?: EmitFn,
  log?: AuditLogger,
): Promise<InvestigationResult> {
  if (!config.investigationEnabled) {
    console.log("[investigate] skipped — investigation disabled");
    return {
      capabilities: [],
      proofs: [],
      findings: [],
      stageSummaries: [],
      prioritizedEntrypoints: [],
      familyAnalyses: [],
      evidenceGraph: { entrypoints: [], nodes: [], edges: [] },
      toolCalls: [],
      agentText: "",
    };
  }

  // Build investigation input
  const lifecycleHooks: Record<string, string> = {};
  for (const [key, value] of Object.entries(inventory.scripts)) {
    if (LIFECYCLE_SCRIPTS.has(key)) lifecycleHooks[key] = value;
  }

  // Collect capabilities and summaries from triage file verdicts
  const allCaps = new Set<string>();
  for (const fv of fileVerdicts) {
    for (const cap of fv.capabilities) allCaps.add(cap);
  }

  const cliCommands = inventory.entryPoints.bin.map((entry, index) => ({
    name: path.basename(entry).replace(/\.[cm]?js$/, "") || `bin-${index + 1}`,
    entry,
  }));

  const exportEntrypoints = [...new Set(inventory.entryPoints.runtime.filter((entry) => entry !== "index.js"))];
  const scriptReferencedFiles = [...new Set(
    Object.values(inventory.scripts)
      .map((script) => extractScriptFileRef(script))
      .filter((value): value is string => Boolean(value)),
  )];

  const input: InvestigationInput = {
    packagePath,
    packageName: inventory.metadata.name ?? "",
    version: inventory.metadata.version ?? "",
    description: inventory.metadata.description ?? "",
    readmeExcerpt: readReadmeExcerpt(packagePath),
    flags: inventory.flags.map((f) => `[${f.severity}] ${f.check}: ${f.detail}`),
    staticCaps: [...allCaps],
    staticProofSummaries: triage.focusAreas.map((fa) =>
      `${fa.file}${fa.lines ? `:${fa.lines}` : ""}: ${fa.reason}`
    ),
    inventoryScripts: inventory.scripts,
    cliCommands,
    mainEntrypoint: inventory.entryPoints.runtime[0] ?? null,
    exportEntrypoints,
    scriptReferencedFiles,
  };

  // Start sandbox
  const sandbox = new DockerSandboxController(
    config.sandboxImage,
    `${config.sandboxMemoryMb}m`,
    config.sandboxCpus,
    config.sandboxNetwork,
  );

  try {
    await sandbox.start(packagePath);

    const output = await runInvestigationAgent(input, sandbox, lifecycleHooks, triage, llmRuntime, emit, log);

    // Emit findings for frontend visualization
    for (const finding of output.findings) {
      emit?.("finding_discovered", { finding });
    }

    // Convert findings to proofs
    const capabilities = new Set<CapabilityEnum>();
    const proofs: Proof[] = [];

    for (const finding of output.findings) {
      const capParsed = CapabilityEnum.safeParse(finding.capability);
      const cap = capParsed.success ? capParsed.data : null;
      if (cap) capabilities.add(cap);

      proofs.push({
        capability: cap,
        attackPathway: "",
        confidence: finding.confidence,
        confidenceScore: finding.confidenceScore,
        fileLine: finding.fileLine,
        problem: finding.problem,
        evidence: finding.evidence.slice(0, 500),
        entrypointId: finding.entrypointId,
        sinkKind: finding.sinkKind,
        proofType: finding.proofType,
        evidenceNodeIds: finding.evidenceNodeIds,
        kind:
          finding.proofType === "verified" ? "TEST_CONFIRMED" :
          finding.proofType === "observed" ? "AI_DYNAMIC" :
          "AI_STATIC",
        contentHash: null,
        reproducible: finding.proofType !== "static",
        reproductionCmd: null,
        testFile: null,
        testHash: null,
        testCode: null,
        verifyError: null,
        reasoningHash: null,
        teeAttestationId: null,
      });
    }

    return {
      capabilities: [...capabilities],
      proofs,
      findings: output.findings,
      stageSummaries: output.stageSummaries,
      prioritizedEntrypoints: output.prioritizedEntrypoints,
      familyAnalyses: output.familyAnalyses,
      evidenceGraph: output.evidenceGraph,
      toolCalls: output.toolCalls,
      agentText: output.agentText,
    };
  } finally {
    await sandbox.stop();
  }
}
