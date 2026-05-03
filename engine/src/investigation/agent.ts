import { generateText, tool } from "ai";
import { z } from "zod";
import type { AuditLlmOverride } from "../audit-options.js";
import { config } from "../config.js";
import { generateObjectWithRetry, getModel, getObjectMode } from "../llm.js";
import {
  FamilyAnalysis,
  InvestigationOutput,
  PrioritizedEntrypoint,
  ReasoningStageSummary,
  SinkKindEnum,
  type BehaviorFamilyEnum,
  type InvestigationAgentOutput,
  type InvestigationInput,
  type TriageResult,
  type ToolCallRecord,
} from "../models.js";
import type { AuditLogger } from "../audit-log.js";
import {
  buildEntrypointPrompt,
  buildEvidenceExtractionPrompt,
  buildFamilyPrompt,
  buildThreatContextPrompt,
  ENTRYPOINT_PRIORITIZATION_SYSTEM_PROMPT,
  EVIDENCE_EXTRACTION_SYSTEM_PROMPT,
  THREAT_CONTEXT_SYSTEM_PROMPT,
  familySystemPrompt,
} from "./prompt.js";
import {
  chooseBehaviorFamilies,
  normalizeEvidenceGraph,
  normalizeFindings,
  summarizeEntrypoints,
  summarizeFamilies,
} from "./strategy.js";
import { listFilesImpl, readFileImpl, searchFilesImpl } from "./tools-read.js";
import { evalJsImpl, fastForwardTimersImpl, requireAndTraceImpl, runLifecycleHookImpl } from "./tools-execute.js";
import type { DockerSandboxController } from "../sandbox/controller.js";
import type { EmitFn } from "../events.js";

const ThreatContextSchema = z.object({
  intendedBehavior: z.string().default(""),
  mismatchAssessment: z.string().default(""),
  summary: z.string(),
  highlights: z.array(z.string()).default([]),
});

const EntrypointSelectionSchema = z.object({
  summary: z.string(),
  entrypoints: z.array(PrioritizedEntrypoint).default([]),
});

const FamilySummarySchema = z.object({
  summary: z.string(),
  observedSignals: z.array(z.string()).default([]),
  sinkKinds: z.array(SinkKindEnum).default([]),
});

function emitStageStarted(emit: EmitFn | undefined, stage: string, detail?: Record<string, unknown>) {
  emit?.("investigation_stage_started", {
    stage,
    ...(detail ?? {}),
  });
}

function emitStageCompleted(
  emit: EmitFn | undefined,
  stage: string,
  summary: string,
  detail?: Record<string, unknown>,
) {
  emit?.("investigation_stage_completed", {
    stage,
    summary,
    ...(detail ?? {}),
  });
}

function buildToolSet(
  packagePath: string,
  sandbox: DockerSandboxController,
  lifecycleHooks: Record<string, string>,
  family: BehaviorFamilyEnum,
  currentEntrypoints: PrioritizedEntrypoint[],
) {
  return {
    readFile: tool({
      description: "Read a file from the package. Path is relative to package root and output includes numbered lines.",
      parameters: z.object({ path: z.string() }),
      execute: async ({ path }) => readFileImpl(packagePath, path),
    }),
    listFiles: tool({
      description: "List all files in the package with sizes and extensions.",
      parameters: z.object({}),
      execute: async () => listFilesImpl(packagePath),
    }),
    searchFiles: tool({
      description: "Regex search across all text files in the package. Returns matches with machine-friendly file:line markers.",
      parameters: z.object({ pattern: z.string() }),
      execute: async ({ pattern }) => searchFilesImpl(packagePath, pattern),
    }),
    evalJs: tool({
      description:
        "Execute JavaScript in the sandbox for deobfuscation or payload decoding. Returns stdout/stderr with timeout handling.",
      parameters: z.object({ code: z.string() }),
      execute: async ({ code }) => evalJsImpl(sandbox, code),
    }),
    requireAndTrace: tool({
      description:
        "Load an entrypoint with instrumentation and return runtime traces. Prefer entrypoints from the prioritized list.",
      parameters: z.object({
        entrypoint: z.string(),
        entrypointId: z.string().optional(),
      }),
      execute: async ({ entrypoint, entrypointId }) =>
        requireAndTraceImpl(sandbox, entrypoint, {
          family,
          entrypointId: entrypointId ?? currentEntrypoints.find((candidate) => candidate.file === entrypoint)?.id,
        }),
    }),
    runLifecycleHook: tool({
      description:
        "Run a lifecycle hook (preinstall/install/postinstall/prepare) with instrumentation. Only use for defined hooks.",
      parameters: z.object({
        hookName: z.string(),
        entrypointId: z.string().optional(),
      }),
      execute: async ({ hookName, entrypointId }) =>
        runLifecycleHookImpl(sandbox, hookName, lifecycleHooks, {
          family,
          entrypointId: entrypointId ?? currentEntrypoints.find((candidate) => candidate.scriptName === hookName)?.id,
        }),
    }),
    fastForwardTimers: tool({
      description:
        "Load an entrypoint with fake timers and advance time. Use only when time-gated behavior is likely.",
      parameters: z.object({
        entrypoint: z.string(),
        advanceMs: z.number(),
        entrypointId: z.string().optional(),
      }),
      execute: async ({ entrypoint, advanceMs, entrypointId }) =>
        fastForwardTimersImpl(sandbox, entrypoint, advanceMs, {
          family,
          entrypointId: entrypointId ?? currentEntrypoints.find((candidate) => candidate.file === entrypoint)?.id,
        }),
    }),
  };
}

interface FamilyRunResult {
  family: BehaviorFamilyEnum;
  analysis: z.infer<typeof FamilyAnalysis>;
  toolCalls: ToolCallRecord[];
  text: string;
}

async function runFamilyInvestigation(input: {
  family: BehaviorFamilyEnum;
  packagePath: string;
  sandbox: DockerSandboxController;
  lifecycleHooks: Record<string, string>;
  investigationInput: InvestigationInput;
  selectedEntrypoints: PrioritizedEntrypoint[];
  threatSummary: string;
  entrypointSummary: string;
  llmRuntime?: AuditLlmOverride;
  emit?: EmitFn;
  log?: AuditLogger;
}): Promise<FamilyRunResult> {
  const model = getModel(config.investigationModel, input.llmRuntime);
  const tools = buildToolSet(
    input.packagePath,
    input.sandbox,
    input.lifecycleHooks,
    input.family,
    input.selectedEntrypoints,
  );
  const toolCallRecords: ToolCallRecord[] = [];
  const fullToolResults: { tool: string; args: unknown; result: string; reasoning: string }[] = [];
  let stepIndex = 0;

  emitStageStarted(input.emit, "call_chain_expansion", {
    family: input.family,
    entrypointIds: input.selectedEntrypoints.map((entrypoint) => entrypoint.id),
  });

  const prompt = buildFamilyPrompt({
    family: input.family,
    entrypoints: input.selectedEntrypoints,
    threatSummary: input.threatSummary,
    entrypointSummary: input.entrypointSummary,
    priorFindingSummaries: input.investigationInput.staticProofSummaries,
    staticCaps: input.investigationInput.staticCaps,
    readmeExcerpt: input.investigationInput.readmeExcerpt,
  });

  input.log?.writeLog(`investigation-family-${input.family}-prompt.md`, `# System\n\n${familySystemPrompt(input.family)}\n\n# Prompt\n\n${prompt}`);

  const result = await generateText({
    model,
    system: familySystemPrompt(input.family),
    prompt,
    tools,
    maxSteps: Math.max(4, Math.ceil(config.maxAgentTurns / 2)),
    onStepFinish({ toolCalls, toolResults, text }) {
      stepIndex += 1;
      for (const toolCall of toolCalls) {
        input.emit?.("agent_tool_call", {
          tool: toolCall.toolName,
          args: toolCall.args as Record<string, unknown>,
          step: stepIndex,
          family: input.family,
        });

        const toolResult = toolResults.find((candidate: { toolCallId: string }) => candidate.toolCallId === toolCall.toolCallId);
        const resultString = toolResult ? String(toolResult.result) : "(no result)";
        const preview = resultString.slice(0, 500);
        const injectionDetected = resultString.includes("[REDACTED: potential prompt injection");

        input.emit?.("agent_tool_result", {
          tool: toolCall.toolName,
          resultPreview: preview,
          step: stepIndex,
          injectionDetected,
          family: input.family,
        });

        toolCallRecords.push({
          tool: toolCall.toolName,
          args: toolCall.args as Record<string, unknown>,
          resultPreview: preview,
          timestamp: new Date().toISOString(),
          injectionDetected,
        });

        fullToolResults.push({
          tool: toolCall.toolName,
          args: toolCall.args,
          result: resultString,
          reasoning: text || "",
        });
      }

      if (text) {
        input.emit?.("agent_reasoning", {
          text: text.slice(0, 2000),
          step: stepIndex,
          family: input.family,
        });
      }

      input.emit?.("agent_thinking", { step: stepIndex + 1, family: input.family });
    },
  });

  input.log?.writeLog(`investigation-family-${input.family}-steps.json`, fullToolResults);
  input.log?.writeLog(`investigation-family-${input.family}-response.md`, result.text);

  const analysisPrompt = [
    `Family: ${input.family}`,
    `Threat summary:\n${input.threatSummary}`,
    `Entrypoint summary:\n${input.entrypointSummary}`,
    `Agent result:\n${result.text}`,
    toolCallRecords.length
      ? `Tool calls:\n${toolCallRecords.map((call) => `- ${call.tool}(${JSON.stringify(call.args)}) -> ${call.resultPreview}`).join("\n")}`
      : "Tool calls: none",
    "Summarize only the evidence relevant to this behavior family, including sinks reached and observed signals.",
  ].join("\n\n");

  const analysisObject = await generateObjectWithRetry({
    model,
    mode: getObjectMode(input.llmRuntime),
    schema: FamilySummarySchema,
    system: familySystemPrompt(input.family),
    prompt: analysisPrompt,
  });

  const analysis = FamilyAnalysis.parse({
    family: input.family,
    selected: true,
    rationale: input.selectedEntrypoints.map((entrypoint) => `${entrypoint.label}: ${entrypoint.reason}`).join("; "),
    summary: analysisObject.object.summary,
    entrypointIds: input.selectedEntrypoints.map((entrypoint) => entrypoint.id),
    sinkKinds: analysisObject.object.sinkKinds,
    observedSignals: analysisObject.object.observedSignals,
  });

  emitStageCompleted(input.emit, "call_chain_expansion", analysis.summary, {
    family: input.family,
    entrypointIds: analysis.entrypointIds,
  });

  return {
    family: input.family,
    analysis,
    toolCalls: toolCallRecords,
    text: result.text,
  };
}

export async function runInvestigationAgent(
  input: InvestigationInput,
  sandbox: DockerSandboxController,
  lifecycleHooks: Record<string, string>,
  triage: TriageResult,
  llmRuntime?: AuditLlmOverride,
  emit?: EmitFn,
  log?: AuditLogger,
): Promise<InvestigationAgentOutput> {
  const model = getModel(config.investigationModel, llmRuntime);

  emit?.("agent_thinking", { step: 0 });

  emitStageStarted(emit, "threat_context");
  const threatContext = await generateObjectWithRetry({
    model,
    mode: getObjectMode(llmRuntime),
    schema: ThreatContextSchema,
    system: THREAT_CONTEXT_SYSTEM_PROMPT,
    prompt: buildThreatContextPrompt(input),
  });
  const threatSummary = ReasoningStageSummary.parse({
    stage: "threat_context",
    summary: threatContext.object.summary,
    highlights: [
      threatContext.object.intendedBehavior,
      threatContext.object.mismatchAssessment,
      ...threatContext.object.highlights,
    ].filter(Boolean),
  });
  emitStageCompleted(emit, "threat_context", threatSummary.summary);
  log?.writeLog("investigation-threat-context.json", threatContext.object);

  emitStageStarted(emit, "entrypoint_prioritization");
  const entrypointSelection = await generateObjectWithRetry({
    model,
    mode: getObjectMode(llmRuntime),
    schema: EntrypointSelectionSchema,
    system: ENTRYPOINT_PRIORITIZATION_SYSTEM_PROMPT,
    prompt: buildEntrypointPrompt(input, threatSummary.summary),
  });
  const prioritizedEntrypoints = entrypointSelection.object.entrypoints
    .sort((left: z.infer<typeof PrioritizedEntrypoint>, right: z.infer<typeof PrioritizedEntrypoint>) => right.priority - left.priority)
    .slice(0, 8);
  const entrypointSummary = ReasoningStageSummary.parse({
    stage: "entrypoint_prioritization",
    summary: entrypointSelection.object.summary,
    highlights: prioritizedEntrypoints.slice(0, 5).map((entrypoint: z.infer<typeof PrioritizedEntrypoint>) => `${entrypoint.type}: ${entrypoint.label} (${entrypoint.reason})`),
  });
  emitStageCompleted(emit, "entrypoint_prioritization", entrypointSummary.summary, {
    entrypointCount: prioritizedEntrypoints.length,
  });
  log?.writeLog("investigation-entrypoints.json", {
    summary: entrypointSelection.object.summary,
    entrypoints: prioritizedEntrypoints,
  });

  const selectedFamilies = chooseBehaviorFamilies({
    investigationInput: input,
    triage,
    entrypoints: prioritizedEntrypoints,
  }).slice(0, 4);

  const familyRuns: FamilyRunResult[] = [];
  for (const family of selectedFamilies) {
    const selectedEntrypoints = prioritizedEntrypoints.filter((entrypoint: z.infer<typeof PrioritizedEntrypoint>) => {
      if (family === "lifecycle_abuse") return entrypoint.type === "lifecycle";
      if (family === "credential_theft") return /env|token|secret|wallet|credential/i.test(entrypoint.reason + entrypoint.label);
      if (family === "network_exfiltration") return /network|http|dns|telemetry|endpoint/i.test(entrypoint.reason + entrypoint.label) || entrypoint.type === "cli";
      if (family === "shell_execution") return /child_process|spawn|exec|fork|shell/i.test(entrypoint.reason + entrypoint.label);
      if (family === "persistence_downloader") return /download|binary|persist|prepare|install/i.test(entrypoint.reason + entrypoint.label);
      if (family === "obfuscation_staged_payloads") return /obfus|eval|encoded|loader/i.test(entrypoint.reason + entrypoint.label);
      if (family === "npm_token_abuse") return /npm|token|registry|auth/i.test(entrypoint.reason + entrypoint.label);
      if (family === "cicd_secret_harvesting") return /ci|workflow|runner|github|gitlab/i.test(entrypoint.reason + entrypoint.label);
      return true;
    });

    familyRuns.push(await runFamilyInvestigation({
      family,
      packagePath: input.packagePath,
      sandbox,
      lifecycleHooks,
      investigationInput: input,
      selectedEntrypoints: selectedEntrypoints.length > 0 ? selectedEntrypoints : prioritizedEntrypoints.slice(0, 3),
      threatSummary: threatSummary.summary,
      entrypointSummary: summarizeEntrypoints(prioritizedEntrypoints),
      llmRuntime,
      emit,
      log,
    }));
  }

  emitStageStarted(emit, "evidence_extraction");
  const extractionPrompt = buildEvidenceExtractionPrompt({
    threatContext: threatSummary.summary,
    entrypointSummary: summarizeEntrypoints(prioritizedEntrypoints),
    familyRuns: familyRuns.map((run) => ({
      family: run.family,
      summary: run.analysis.summary,
      entrypointIds: run.analysis.entrypointIds,
      toolCalls: run.toolCalls.map((call) => ({
        tool: call.tool,
        args: call.args,
        resultPreview: call.resultPreview,
      })),
    })),
    staticProofSummaries: input.staticProofSummaries,
    findingsSoFar: summarizeFamilies(familyRuns.map((run) => run.analysis)),
  });
  log?.writeLog("investigation-extraction-prompt.md", extractionPrompt);

  const extraction = await generateObjectWithRetry({
    model,
    mode: getObjectMode(llmRuntime),
    schema: InvestigationOutput,
    system: EVIDENCE_EXTRACTION_SYSTEM_PROMPT,
    prompt: extractionPrompt,
  });

  const normalizedFindings = normalizeFindings(extraction.object.findings);
  const normalizedGraph = normalizeEvidenceGraph({
    entrypoints: extraction.object.evidenceGraph.entrypoints.length > 0
      ? extraction.object.evidenceGraph.entrypoints
      : prioritizedEntrypoints,
    nodes: extraction.object.evidenceGraph.nodes,
    edges: extraction.object.evidenceGraph.edges,
  });

  const output = InvestigationOutput.parse({
    ...extraction.object,
    stageSummaries: [
      threatSummary,
      entrypointSummary,
      ReasoningStageSummary.parse({
        stage: "call_chain_expansion",
        summary: familyRuns.length > 0
          ? familyRuns.map((run) => run.analysis.summary).join(" ")
          : "No behavior-family expansion was required.",
        highlights: familyRuns.map((run) => `${run.family}: ${run.analysis.summary}`),
      }),
      ReasoningStageSummary.parse({
        stage: "evidence_extraction",
        summary: extraction.object.summary || "Evidence-backed findings extracted.",
        highlights: normalizedFindings.map((finding) => `${finding.confidence} ${finding.problem}`),
      }),
    ],
    prioritizedEntrypoints,
    familyAnalyses: familyRuns.map((run) => run.analysis),
    evidenceGraph: normalizedGraph,
    findings: normalizedFindings,
  });

  emitStageCompleted(emit, "evidence_extraction", output.summary || "Evidence extraction complete.", {
    findingCount: output.findings.length,
  });
  log?.writeLog("investigation-output.json", output);

  return {
    ...output,
    toolCalls: familyRuns.flatMap((run) => run.toolCalls),
    agentText: familyRuns.map((run) => `## ${run.family}\n${run.text}`).join("\n\n"),
  };
}
