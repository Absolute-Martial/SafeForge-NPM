import * as fs from "node:fs";
import * as path from "node:path";
import type { AuditLlmOverride } from "../audit-options.js";
import { config, SOURCE_FILE_TYPES } from "../config.js";
import { getModel, generateObjectWithRetry, getObjectMode } from "../llm.js";
import { FileVerdict, TriageResult, type InventoryReport } from "../models.js";
import { z } from "zod";
import type { EmitFn } from "../events.js";

const MAX_FILE_SIZE = 500_000; // 500KB — files larger than this skip LLM
const MAX_LLM_TRIAGE_FILES = 32;
const TRIAGE_CONCURRENCY = 2;
const MAX_LLM_FAILURES_BEFORE_FALLBACK = 1;
const TRIAGE_LLM_TIMEOUT_MS = 5_000;

interface LlmTriageState {
  disabled: boolean;
  failures: number;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const MAP_SYSTEM = `You are a security analyst examining a single file from an npm package.
Your job: report what this code DOES, not whether it's malicious.
Line numbers are provided — reference them in your output.

Report:
- capabilities: Node.js APIs and capabilities used. Use these labels where applicable: NETWORK, FILESYSTEM, ENV_VARS, PROCESS_SPAWN, EVAL, CRYPTO, DNS, DOM_MANIPULATION, BINARY_DOWNLOAD, OBFUSCATION, LIFECYCLE_HOOK, CLIPBOARD, TELEMETRY. Add other labels as needed.
- suspiciousPatterns: anything unusual — obfuscation, encoded strings, dynamic require, eval chains, string concatenation building URLs or shell commands, anti-debugging, hidden code after whitespace, minified code with suspicious logic. Include line numbers (e.g. "L42-67: obfuscated string building a URL").
- suspiciousLines: line range(s) containing the most suspicious code, e.g. "12-45" or "12-30,55-80". Null if nothing suspicious.
- summary: one sentence describing what the file does.
- riskContribution: 0 (boring utility code) to 10 (clearly dangerous behavior). Most legitimate code scores 0-2.`;

function numberLines(contents: string): string {
  return contents
    .split("\n")
    .map((line, i) => `${i + 1}: ${line}`)
    .join("\n");
}

function buildMapPrompt(
  fileName: string,
  contents: string,
  fileFlags: string[],
): string {
  let prompt = `## File: ${fileName}\n\n\`\`\`\n${numberLines(contents)}\n\`\`\``;
  if (fileFlags.length > 0) {
    prompt += `\n\n## Structural flags for this file\n${fileFlags.join("\n")}`;
  }
  return prompt;
}

const REDUCE_SYSTEM = `You are a security triage expert producing a final risk assessment for an npm package.

You receive:
- Package metadata (what it CLAIMS to be)
- Per-file analysis results (what it ACTUALLY does)
- Structural flags from automated scanning

Your job:
1. CAPABILITY MISMATCH: Flag capabilities that don't match the package's stated purpose. A color-formatting library shouldn't need NETWORK. A parser shouldn't touch ENV_VARS. A utility library shouldn't spawn processes.
2. RISK SCORE: 0 = clearly benign, 10 = clearly malicious. Scores 3+ trigger expensive deep investigation. Most legitimate packages score 0-2. Be paranoid — false positives are acceptable, false negatives are not.
3. FOCUS AREAS: Which specific files should deep investigation examine first and why. ALWAYS include the line range (e.g. "12-45") from the per-file analysis — investigation needs exact lines to examine.

If any file was flagged as too large for analysis, treat that as suspicious and factor it into the score.`;

function buildReducePrompt(
  inventory: InventoryReport,
  fileVerdicts: FileVerdict[],
): string {
  const meta = inventory.metadata;
  const sections: string[] = [];

  sections.push(`## Package metadata
- name: ${meta.name ?? "unknown"}
- version: ${meta.version ?? "unknown"}
- description: ${meta.description ?? "(none)"}
- license: ${meta.license ?? "unknown"}
- homepage: ${meta.homepage ?? "(none)"}`);

  if (Object.keys(inventory.scripts).length > 0) {
    sections.push(
      `## Lifecycle scripts\n${Object.entries(inventory.scripts)
        .map(([k, v]) => `- ${k}: \`${v}\``)
        .join("\n")}`,
    );
  }

  const allCaps = new Set(fileVerdicts.flatMap((v) => v.capabilities));
  sections.push(`## Aggregated capabilities across all files\n${[...allCaps].join(", ") || "(none)"}`);

  sections.push(
    `## Per-file analysis results\n${fileVerdicts
      .map(
        (v) =>
          `### ${v.file} (risk: ${v.riskContribution}/10)\n` +
          `Summary: ${v.summary}\n` +
          `Capabilities: ${v.capabilities.join(", ") || "none"}\n` +
          `Suspicious lines: ${v.suspiciousLines ?? "none"}\n` +
          `Suspicious patterns: ${v.suspiciousPatterns.join("; ") || "none"}`,
      )
      .join("\n\n")}`,
  );

  if (inventory.flags.length > 0) {
    sections.push(
      `## Structural flags from automated scanning\n${inventory.flags
        .map((f) => `- [${f.severity}] ${f.check}: ${f.detail}`)
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// MAP: per-file analysis
// ---------------------------------------------------------------------------

async function analyzeFile(
  packagePath: string,
  filePath: string,
  fileFlags: string[],
  llmRuntime?: AuditLlmOverride,
  emit?: EmitFn,
  llmState?: LlmTriageState,
): Promise<FileVerdict> {
  const absPath = path.join(packagePath, filePath);
  let contents: string;
  try {
    contents = fs.readFileSync(absPath, "utf-8");
  } catch {
    return {
      file: filePath,
      capabilities: [],
      suspiciousPatterns: ["file-unreadable"],
      suspiciousLines: null,
      summary: "Could not read file",
      riskContribution: 3,
    };
  }

  // Too-large files: synthetic verdict, no LLM call
  if (contents.length > MAX_FILE_SIZE) {
    return {
      file: filePath,
      capabilities: [],
      suspiciousPatterns: ["file-too-large-for-context"],
      suspiciousLines: null,
      summary: `File is ${Math.round(contents.length / 1024)}KB — too large for triage analysis`,
      riskContribution: 7,
    };
  }

  // Empty/trivial files: skip LLM
  if (contents.trim().length === 0) {
    return {
      file: filePath,
      capabilities: [],
      suspiciousPatterns: [],
      suspiciousLines: null,
      summary: "Empty file",
      riskContribution: 0,
    };
  }

  if (llmState?.disabled) {
    return {
      file: filePath,
      capabilities: [],
      suspiciousPatterns: fileFlags.length > 0 ? ["llm-triage-skipped"] : [],
      suspiciousLines: null,
      summary: fileFlags.length > 0
        ? `LLM triage skipped after provider failures; structural flags: ${fileFlags.join("; ")}`
        : "LLM triage skipped after provider failures",
      riskContribution: fileFlags.length > 0 ? 3 : 0,
    };
  }

  emit?.("file_analyzing", { file: filePath });

  const model = getModel(config.triageModel, llmRuntime);
  try {
    const result = await generateObjectWithRetry({
      model,
      mode: getObjectMode(llmRuntime),
      schema: FileVerdict,
      system: MAP_SYSTEM,
      prompt: buildMapPrompt(filePath, contents, fileFlags),
      abortSignal: AbortSignal.timeout(TRIAGE_LLM_TIMEOUT_MS),
    }, 1);

    const verdict = { ...result.object, file: filePath };
    console.log(`[triage:map] ${filePath} → risk=${verdict.riskContribution}/10 caps=[${verdict.capabilities.join(", ")}] suspicious=[${verdict.suspiciousPatterns.join("; ")}]`);
    emit?.("file_verdict", { verdict });
    return verdict;
  } catch (err: any) {
    console.error(`[triage:map] LLM failed for ${filePath}: ${err?.message}`);
    if (llmState) {
      llmState.failures += 1;
      if (llmState.failures >= MAX_LLM_FAILURES_BEFORE_FALLBACK) {
        llmState.disabled = true;
        console.warn("[triage] LLM provider appears unavailable; falling back to deterministic triage for remaining files");
      }
    }
    const fallback = {
      file: filePath,
      capabilities: [],
      suspiciousPatterns: fileFlags.length > 0 ? ["llm-analysis-failed"] : [],
      suspiciousLines: null,
      summary: fileFlags.length > 0
        ? `LLM analysis failed; structural flags remain: ${fileFlags.join("; ")}`
        : "LLM analysis failed; no structural flags on this file",
      riskContribution: fileFlags.length > 0 ? 3 : 0,
    };
    emit?.("file_verdict", { verdict: fallback });
    return fallback;
  }
}

function prioritizeSourceFiles(
  sourceFiles: InventoryReport["files"],
  inventory: InventoryReport,
  flagsByFile: Map<string, string[]>,
): InventoryReport["files"] {
  const entrypointFiles = new Set([
    ...inventory.entryPoints.install,
    ...inventory.entryPoints.runtime,
    ...inventory.entryPoints.bin,
    ...Object.values(inventory.scripts)
      .flatMap((script) => script.match(/[./\w-]+\.(?:mjs|cjs|js|ts)/g) ?? []),
  ]);

  return [...sourceFiles]
    .map((file) => {
      let rank = 0;
      if (flagsByFile.has(file.path)) rank += 100;
      if (entrypointFiles.has(file.path)) rank += 80;
      if (/install|postinstall|preinstall|prepare|setup|loader|index|main|cli|bin/i.test(file.path)) rank += 25;
      if (file.sizeBytes > MAX_FILE_SIZE) rank += 20;
      if (/min\.js$|bundle|dist|payload|encoded/i.test(file.path)) rank += 15;
      return { file, rank };
    })
    .sort((a, b) => b.rank - a.rank || a.file.path.localeCompare(b.file.path))
    .map((entry) => entry.file);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

// ---------------------------------------------------------------------------
// REDUCE: synthesis + capability mismatch
// ---------------------------------------------------------------------------

async function synthesizeTriageResult(
  inventory: InventoryReport,
  fileVerdicts: FileVerdict[],
  llmRuntime?: AuditLlmOverride,
  forceDeterministic = false,
): Promise<TriageResult> {
  if (forceDeterministic) {
    const maxRisk = Math.max(0, ...fileVerdicts.map((v) => v.riskContribution));
    return {
      riskScore: maxRisk,
      riskSummary: maxRisk >= 5
        ? "Suspicious patterns detected by deterministic fallback after LLM provider failures"
        : "LLM provider unavailable. Deterministic triage completed with no significant static risks.",
      focusAreas: fileVerdicts
        .filter((v) => v.riskContribution >= 5)
        .slice(0, 5)
        .map((v) => ({ file: v.file, lines: null, reason: v.summary })),
    };
  }

  const model = getModel(config.triageModel, llmRuntime);
  try {
    const result = await generateObjectWithRetry({
      model,
      mode: getObjectMode(llmRuntime),
      schema: TriageResult,
      system: REDUCE_SYSTEM,
      prompt: buildReducePrompt(inventory, fileVerdicts),
      abortSignal: AbortSignal.timeout(TRIAGE_LLM_TIMEOUT_MS),
    }, 1);
    return result.object;
  } catch (err: any) {
    console.error(`[triage:reduce] LLM synthesis failed: ${err?.message}`);
    const maxRisk = Math.max(0, ...fileVerdicts.map((v) => v.riskContribution));
    return {
      riskScore: maxRisk,
      riskSummary: maxRisk >= 5 ? "Suspicious patterns detected" : "No significant risks found",
      focusAreas: fileVerdicts
        .filter((v) => v.riskContribution >= 5)
        .slice(0, 5)
        .map((v) => ({ file: v.file, lines: null, reason: v.summary })),
    };
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface TriagePhaseOutput {
  result: TriageResult;
  fileVerdicts: FileVerdict[];
}

export async function runTriage(
  packagePath: string,
  inventory: InventoryReport,
  llmRuntime?: AuditLlmOverride,
  emit?: EmitFn,
): Promise<TriagePhaseOutput> {
  const sourceFiles = inventory.files.filter(
    (f) => SOURCE_FILE_TYPES.has(f.fileType) && !f.isBinary,
  );

  console.log(
    `[triage] MAP phase: ${sourceFiles.length} source files for ${inventory.metadata.name ?? "unknown"}`,
  );

  // Build per-file flag lookup
  const flagsByFile = new Map<string, string[]>();
  for (const flag of inventory.flags) {
    if (flag.file) {
      const existing = flagsByFile.get(flag.file) ?? [];
      existing.push(`[${flag.severity}] ${flag.check}: ${flag.detail}`);
      flagsByFile.set(flag.file, existing);
    }
  }

  const prioritizedFiles = prioritizeSourceFiles(sourceFiles, inventory, flagsByFile);
  const selectedForLlm = new Set(prioritizedFiles.slice(0, MAX_LLM_TRIAGE_FILES).map((file) => file.path));
  if (sourceFiles.length > MAX_LLM_TRIAGE_FILES) {
    console.log(
      `[triage] limiting LLM map to ${MAX_LLM_TRIAGE_FILES}/${sourceFiles.length} prioritized files for responsiveness`,
    );
  }

  const llmState: LlmTriageState = { disabled: false, failures: 0 };

  // MAP: analyze prioritized files with bounded concurrency and cheap fallbacks.
  const total = sourceFiles.length;
  let completed = 0;
  const fileVerdicts = await mapWithConcurrency(
    sourceFiles,
    TRIAGE_CONCURRENCY,
    async (f) => {
      try {
        const fileFlags = flagsByFile.get(f.path) ?? [];
        const shouldUseLlm = selectedForLlm.has(f.path);
        const verdict = shouldUseLlm
          ? await analyzeFile(packagePath, f.path, fileFlags, llmRuntime, emit, llmState)
          : {
            file: f.path,
            capabilities: [],
            suspiciousPatterns: fileFlags.length > 0 ? ["llm-triage-deferred"] : [],
            suspiciousLines: null,
            summary: fileFlags.length > 0
              ? `Deferred from LLM triage for responsiveness; structural flags: ${fileFlags.join("; ")}`
              : "Deferred from LLM triage for responsiveness; no structural flags",
            riskContribution: fileFlags.length > 0 ? 3 : 0,
          } satisfies FileVerdict;
        completed++;
        emit?.("triage_progress", { current: completed, total, file: f.path });
        return verdict;
      } catch (err) {
        completed++;
        console.error(`[triage:map] failed for ${f.path}: ${err instanceof Error ? err.message : err}`);
        return {
          file: f.path,
          capabilities: [],
          suspiciousPatterns: ["analysis-error"],
          suspiciousLines: null,
          summary: `Analysis failed: ${err instanceof Error ? err.message : "unknown error"}`,
          riskContribution: 5,
        } satisfies FileVerdict;
      }
    },
  );

  console.log(
    `[triage] REDUCE phase: synthesizing ${fileVerdicts.length} file verdicts`,
  );

  // REDUCE: synthesize into final triage result
  const triageResult = await synthesizeTriageResult(inventory, fileVerdicts, llmRuntime, llmState.disabled);

  console.log(
    `[triage] result: riskScore=${triageResult.riskScore}, focusAreas=${triageResult.focusAreas.length}`,
  );

  return { result: triageResult, fileVerdicts };
}
