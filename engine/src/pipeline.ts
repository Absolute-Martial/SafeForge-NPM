import { config, SOURCE_FILE_TYPES } from "./config.js";
import { Proof, type AuditReport, type PhaseLog } from "./models.js";
import { normalizeAuditRunOptions, type AuditRunOptions } from "./audit-options.js";
import { resolvePackage, cleanupPackage } from "./phases/resolve.js";
import { analyzeInventory } from "./phases/inventory.js";
import { buildDependencyGraph } from "./phases/dependency-graph.js";
import { scanAdvisories } from "./phases/advisory-scan.js";
import { runCliBehavior } from "./phases/cli-behavior.js";
import { runTriage } from "./phases/triage.js";
import { investigate } from "./phases/investigate.js";
import { generateTests } from "./phases/test-gen.js";
import { verifyProofs } from "./phases/verify.js";
import { startAuditLog, type AuditLogger } from "./audit-log.js";
import type { EmitFn } from "./events.js";
import { setSessionPackagePath } from "./events.js";
import { isLlmEnabled } from "./llm.js";
import { deriveCapabilityTags, scoreAudit } from "./scoring.js";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function timedPhase<T>(
  name: string,
  fn: () => Promise<T>,
  timeoutMs: number,
  inputSummary: Record<string, unknown>,
  outputSummary: (result: T) => Record<string, unknown>,
  emit?: EmitFn,
): Promise<{ result: T; log: PhaseLog }> {
  emit?.("phase_started", { phase: name });
  const start = Date.now();
  const result = await withTimeout(fn(), timeoutMs, name);
  const durationMs = Date.now() - start;
  const log: PhaseLog = {
    phase: name,
    durationMs,
    input: inputSummary,
    output: outputSummary(result),
  };
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${name}] completed in ${durationMs}ms`);
  console.log(`${"─".repeat(60)}`);
  console.log(`[${name}] INPUT:`);
  console.log(JSON.stringify(log.input, null, 2));
  console.log(`[${name}] OUTPUT:`);
  console.log(JSON.stringify(log.output, null, 2));
  console.log(`${"=".repeat(60)}\n`);
  emit?.("phase_completed", { phase: name, durationMs });
  return { result, log };
}

export interface AuditResult {
  report: AuditReport;
  packagePath: string;
  cleanup: () => void;
}

function buildAuditReport(input: {
  securityMode: AuditRunOptions["securityMode"];
  scanDepth: number;
  inventory: Awaited<ReturnType<typeof analyzeInventory>>;
  dependencyGraph: NonNullable<AuditReport["dependencyGraph"]>;
  advisories: AuditReport["advisories"];
  advisorySummary: AuditReport["advisorySummary"];
  scanWarnings: AuditReport["scanWarnings"];
  cliBehavior: AuditReport["cliBehavior"];
  triage: AuditReport["triage"];
  findings: AuditReport["findings"];
  proofs: AuditReport["proofs"];
  prioritizedEntrypoints: AuditReport["prioritizedEntrypoints"];
  reasoningStageSummaries: AuditReport["reasoningStageSummaries"];
  familyAnalyses: AuditReport["familyAnalyses"];
  evidenceGraph: AuditReport["evidenceGraph"];
  cliBehaviorCapabilities: AuditReport["capabilities"];
  trace: AuditReport["trace"];
  llmEnabled: boolean;
}): AuditReport {
  const capabilities = deriveCapabilityTags(input.findings, input.proofs, input.cliBehaviorCapabilities);
  const score = scoreAudit({
    securityMode: input.securityMode,
    inventory: input.inventory,
    advisories: input.advisories,
    findings: input.findings,
    proofs: input.proofs,
    triage: input.triage,
    cliBehavior: input.cliBehavior,
    llmEnabled: input.llmEnabled,
    maxDependencyDepth: input.dependencyGraph.maxObservedDepth,
  });

  return {
    verdict: score.verdict,
    finalScore: score.finalScore,
    recommendedAction: score.recommendedAction,
    scanDepthApplied: input.scanDepth,
    securityModeApplied: input.securityMode,
    capabilities,
    proofs: input.proofs,
    triage: input.triage,
    dependencyGraph: input.dependencyGraph,
    advisories: input.advisories,
    advisorySummary: input.advisorySummary,
    scanWarnings: input.scanWarnings,
    cliBehavior: input.cliBehavior,
    findings: input.findings,
    prioritizedEntrypoints: input.prioritizedEntrypoints,
    reasoningStageSummaries: input.reasoningStageSummaries,
    familyAnalyses: input.familyAnalyses,
    evidenceGraph: input.evidenceGraph,
    trace: input.trace,
  };
}

function advisoryProofs(advisories: NonNullable<AuditReport["advisories"]>): Proof[] {
  return advisories
    .filter((advisory) => advisory.malware || advisory.severity === "critical" || advisory.severity === "high")
    .map((advisory) =>
      Proof.parse({
        capability: null,
        attackPathway: "KNOWN_VULNERABILITY",
        confidence: "CONFIRMED",
        confidenceScore: 10,
        fileLine: advisory.dependencyPaths[0]?.join(" > ") ?? `${advisory.packageName}@${advisory.packageVersion}`,
        problem: `${advisory.packageName}@${advisory.packageVersion} matched a ${advisory.severity} advisory`,
        evidence: uniqueAdvisoryEvidence(advisory),
        kind: "STRUCTURAL",
        reproducible: true,
      }),
    );
}

function uniqueAdvisoryEvidence(advisory: NonNullable<AuditReport["advisories"]>[number]): string {
  const ids = advisory.sourceIds.join(", ");
  const fix = advisory.fixedVersion ? ` Fixed in ${advisory.fixedVersion}.` : "";
  return `${ids}: ${advisory.summary}${fix}`.slice(0, 500);
}

export async function runAudit(
  packageName: string,
  version?: string,
  options?: AuditRunOptions,
  emit?: EmitFn,
  auditId?: string,
): Promise<AuditResult> {
  console.log(`[pipeline] starting audit for ${packageName}${version ? `@${version}` : ""}`);
  const log = startAuditLog(packageName);
  const trace: PhaseLog[] = [];
  const normalizedOptions = normalizeAuditRunOptions(options);
  const llmEnabled = isLlmEnabled(normalizedOptions.llm);

  emit?.("audit_started", { packageName });

  // Phase 0a: Resolve package
  const { result: resolved, log: resolveLog } = await timedPhase(
    "resolve",
    () => resolvePackage(packageName, version),
    2 * 60_000,
    { packageName, version: version ?? "latest" },
    (r) => ({ path: r.path, needsCleanup: r.needsCleanup }),
    emit,
  );
  trace.push(resolveLog);
  log.writeLog("resolve.json", resolved);

  // Store package path on session so file-serving endpoint works
  if (auditId) setSessionPackagePath(auditId, resolved.path);

  try {
    // Phase 0b: Inventory
    const { result: inventory, log: inventoryLog } = await timedPhase(
      "inventory",
      () => analyzeInventory(resolved.path),
      30_000,
      { packagePath: resolved.path },
      (inv) => ({
        fileCount: inv.files.length,
        sourceFiles: inv.files.filter((f) => SOURCE_FILE_TYPES.has(f.fileType)).length,
        flagCount: inv.flags.length,
        flags: inv.flags.map((f) => `[${f.severity}] ${f.check}: ${f.detail}`),
        hasDealbreaker: !!inv.dealbreaker,
        scripts: inv.scripts,
        metadata: inv.metadata,
        entryPoints: inv.entryPoints,
      }),
      emit,
    );
    trace.push(inventoryLog);
    log.writeLog("inventory.json", inventory);

    // Emit file list for frontend visualization
    emit?.("file_list", { files: inventory.files });

    // Emit inventory metadata (scripts, deps, entry points) for frontend
    emit?.("inventory_meta", {
      scripts: inventory.scripts,
      dependencies: inventory.dependencies,
      entryPoints: inventory.entryPoints,
      metadata: inventory.metadata,
    });

    const { result: dependencyGraphResult, log: dependencyGraphLog } = await timedPhase(
      "dependency-graph",
      () => buildDependencyGraph(resolved.path, normalizedOptions.scanDepth),
      2 * 60_000,
      { packagePath: resolved.path, scanDepth: normalizedOptions.scanDepth },
      (result) => ({
        nodeCount: result.report.nodeCount,
        directCount: result.report.directCount,
        maxDepth: result.report.maxDepth,
        maxObservedDepth: result.report.maxObservedDepth,
        truncated: result.report.truncated,
        warningCount: result.warnings.length,
      }),
      emit,
    );
    trace.push(dependencyGraphLog);
    log.writeLog("dependency-graph.json", dependencyGraphResult);
    const dependencyGraph = dependencyGraphResult.report;
    let scanWarnings = [...dependencyGraphResult.warnings];
    emit?.("dependency_graph_ready", {
      graph: dependencyGraph,
    });

    emit?.("advisory_scan_started", { nodeCount: dependencyGraph.nodeCount });
    const { result: advisoryResult, log: advisoryLog } = await timedPhase(
      "advisory-scan",
      async () => {
        try {
          return await scanAdvisories(dependencyGraph);
        } catch (error) {
          return {
            advisories: [],
            summary: {
              total: 0,
              critical: 0,
              high: 0,
              moderate: 0,
              low: 0,
              info: 0,
              unknown: 0,
              dangerousCount: 0,
            },
            warnings: [
              {
                code: "ADVISORY_SCAN_FAILED",
                message: error instanceof Error ? error.message : "Advisory scan failed",
              },
            ],
          };
        }
      },
      2 * 60_000,
      { nodeCount: dependencyGraph.nodeCount },
      (result) => ({
        advisoryCount: result.advisories.length,
        dangerousCount: result.summary.dangerousCount,
        warningCount: result.warnings.length,
      }),
      emit,
    );
    trace.push(advisoryLog);
    log.writeLog("advisories.json", advisoryResult);
    scanWarnings = [...scanWarnings, ...advisoryResult.warnings];
    for (const advisory of advisoryResult.advisories) {
      emit?.("advisory_match", { advisory });
    }
    emit?.("advisory_summary", {
      summary: advisoryResult.summary,
      warnings: advisoryResult.warnings,
    });

    const matchedAdvisories = advisoryResult.advisories;
    const advisorySummary = advisoryResult.summary;
    const matchedAdvisoryProofs = advisoryProofs(matchedAdvisories);

    // Scale phase timeouts by file count: base timeout for ≤20 files,
    // +50% per 20 extra files, clamped at 4× base.
    const sourceFileCount = inventory.files.filter(
      (f) => SOURCE_FILE_TYPES.has(f.fileType) && !f.isBinary,
    ).length;
    const timeoutScale = Math.min(
      4,
      1 + Math.max(0, sourceFileCount - 20) * 0.025,
    );
    console.log(
      `[pipeline] ${sourceFileCount} source files → timeout scale ${timeoutScale.toFixed(2)}×`,
    );

    let cliBehavior: AuditReport["cliBehavior"] = null;
    let cliBehaviorFindings: NonNullable<Awaited<ReturnType<typeof runCliBehavior>>["findings"]> = [];
    let cliBehaviorProofs: NonNullable<Awaited<ReturnType<typeof runCliBehavior>>["proofs"]> = [];
    let cliBehaviorCapabilities: NonNullable<Awaited<ReturnType<typeof runCliBehavior>>["capabilities"]> = [];

    if (normalizedOptions.sandbox.cliBehaviorEnabled) {
      const { result: cliBehaviorResult, log: cliBehaviorLog } = await timedPhase(
        "cli-behavior",
        () =>
          runCliBehavior(
            resolved.path,
            normalizedOptions.sandbox,
            emit,
          ),
        6 * 60_000,
        {
          packagePath: resolved.path,
          nodeVersions: normalizedOptions.sandbox.nodeVersions,
        },
        (result) => ({
          commandsDiscovered: result.report?.commandsDiscovered.length ?? 0,
          resultCount: result.report?.results.length ?? 0,
          highRiskCount: result.report?.highRiskCount ?? 0,
          skippedReason: result.report?.skippedReason ?? null,
        }),
        emit,
      );
      trace.push(cliBehaviorLog);
      cliBehavior = cliBehaviorResult.report;
      cliBehaviorFindings = cliBehaviorResult.findings;
      cliBehaviorProofs = cliBehaviorResult.proofs;
      cliBehaviorCapabilities = cliBehaviorResult.capabilities;
      log.writeLog("cli-behavior.json", cliBehaviorResult.report);

      for (const finding of cliBehaviorFindings) {
        emit?.("finding_discovered", { finding });
      }
    }

    // Dealbreaker -> immediate BLOCK
    if (inventory.dealbreaker) {
      const report = buildAuditReport({
        securityMode: normalizedOptions.securityMode,
        scanDepth: normalizedOptions.scanDepth,
        inventory,
        dependencyGraph,
        advisories: matchedAdvisories,
        advisorySummary,
        scanWarnings,
        findings: [],
        cliBehavior,
        cliBehaviorCapabilities: [],
        llmEnabled,
        triage: null,
        prioritizedEntrypoints: [],
        reasoningStageSummaries: [],
        familyAnalyses: [],
        evidenceGraph: { entrypoints: [], nodes: [], edges: [] },
        proofs: [Proof.parse({
          confidence: "CONFIRMED",
          confidenceScore: 10,
          fileLine: "",
          problem: inventory.dealbreaker.detail,
          evidence: `Dealbreaker: ${inventory.dealbreaker.check}`,
          kind: "STRUCTURAL",
          reproducible: true,
        })],
        trace,
      });
      emit?.("verdict_reached", { verdict: report.verdict, capabilities: [], proofCount: report.proofs.length });
      return { report, packagePath: resolved.path, cleanup: () => cleanupPackage(resolved) };
    }

    if (!llmEnabled) {
      const finalProofs = [...matchedAdvisoryProofs, ...cliBehaviorProofs];
      const deterministicTriage = {
        riskScore: matchedAdvisoryProofs.length > 0 || cliBehaviorProofs.length > 0 ? 8 : 0,
        riskSummary: "LLM reasoning disabled. Returning database and deterministic scan results only.",
        focusAreas: [],
      };
      const report = buildAuditReport({
        securityMode: normalizedOptions.securityMode,
        scanDepth: normalizedOptions.scanDepth,
        inventory,
        dependencyGraph,
        advisories: matchedAdvisories,
        advisorySummary,
        scanWarnings: [
          ...scanWarnings,
          {
            code: "LLM_DISABLED",
            message: "LLM reasoning is disabled. Deep triage, investigation, test generation, and verification were skipped.",
          },
        ],
        findings: cliBehaviorFindings,
        cliBehavior,
        cliBehaviorCapabilities,
        llmEnabled,
        triage: deterministicTriage,
        proofs: finalProofs,
        prioritizedEntrypoints: [],
        reasoningStageSummaries: [],
        familyAnalyses: [],
        evidenceGraph: { entrypoints: [], nodes: [], edges: [] },
        trace,
      });
      emit?.("triage_complete", {
        riskScore: deterministicTriage.riskScore,
        riskSummary: deterministicTriage.riskSummary,
        focusAreas: [],
      });
      emit?.("verdict_reached", {
        verdict: report.verdict,
        capabilities: report.capabilities,
        proofCount: report.proofs.length,
      });
      return { report, packagePath: resolved.path, cleanup: () => cleanupPackage(resolved) };
    }

    // Phase 1a: Triage
    const { result: triageOutput, log: triageLog } = await timedPhase(
      "triage",
      () => runTriage(resolved.path, inventory, normalizedOptions.llm, emit),
      2 * 60_000 * timeoutScale,
      {
        sourceFiles: inventory.files
          .filter((f) => SOURCE_FILE_TYPES.has(f.fileType) && !f.isBinary)
          .map((f) => ({ path: f.path, sizeBytes: f.sizeBytes })),
        flagCount: inventory.flags.length,
        packageName: inventory.metadata.name,
        llm: normalizedOptions.llm
          ? {
              providerName: normalizedOptions.llm.providerName,
              baseUrl: normalizedOptions.llm.baseUrl,
              model: normalizedOptions.llm.model,
            }
          : undefined,
      },
      (t) => ({
        riskScore: t.result.riskScore,
        riskSummary: t.result.riskSummary,
        focusAreas: t.result.focusAreas,
        fileVerdicts: t.fileVerdicts,
      }),
      emit,
    );
    trace.push(triageLog);
    log.writeLog("triage.json", triageOutput);
    const triage = triageOutput.result;

    // Emit triage complete for frontend
    emit?.("triage_complete", {
      riskScore: triage.riskScore,
      riskSummary: triage.riskSummary,
      focusAreas: triage.focusAreas,
    });

    if (cliBehaviorProofs.length > 0 && normalizedOptions.securityMode !== "research") {
      console.log(`[pipeline] observed ${cliBehaviorProofs.length} high-risk sandbox proofs — returning verdict without deep investigation`);
      const report = buildAuditReport({
        securityMode: normalizedOptions.securityMode,
        scanDepth: normalizedOptions.scanDepth,
        inventory,
        dependencyGraph,
        advisories: matchedAdvisories,
        advisorySummary,
        scanWarnings: [
          ...scanWarnings,
          {
            code: "SANDBOX_PROOF_SHORT_CIRCUIT",
            message: "High-risk sandbox behavior was observed. Strict/Balanced mode skipped deeper LLM investigation and returned the runtime-backed verdict immediately.",
          },
        ],
        findings: cliBehaviorFindings,
        cliBehavior,
        cliBehaviorCapabilities,
        llmEnabled,
        triage,
        proofs: [...matchedAdvisoryProofs, ...cliBehaviorProofs],
        prioritizedEntrypoints: [],
        reasoningStageSummaries: [],
        familyAnalyses: [],
        evidenceGraph: { entrypoints: [], nodes: [], edges: [] },
        trace,
      });
      emit?.("verdict_reached", {
        verdict: report.verdict,
        capabilities: report.capabilities,
        proofCount: report.proofs.length,
      });
      return { report, packagePath: resolved.path, cleanup: () => cleanupPackage(resolved) };
    }

    if (triage.riskScore < config.triageRiskThreshold && cliBehaviorProofs.length === 0) {
      console.log(`[pipeline] low risk (${triage.riskScore}) — returning SAFE`);
      const report = buildAuditReport({
        securityMode: normalizedOptions.securityMode,
        scanDepth: normalizedOptions.scanDepth,
        inventory,
        dependencyGraph,
        advisories: matchedAdvisories,
        advisorySummary,
        scanWarnings,
        findings: cliBehaviorFindings,
        cliBehavior,
        cliBehaviorCapabilities,
        llmEnabled,
        triage,
        proofs: matchedAdvisoryProofs,
        prioritizedEntrypoints: [],
        reasoningStageSummaries: [],
        familyAnalyses: [],
        evidenceGraph: { entrypoints: [], nodes: [], edges: [] },
        trace,
      });
      emit?.("verdict_reached", {
        verdict: report.verdict,
        capabilities: report.capabilities,
        proofCount: report.proofs.length,
      });
      return { report, packagePath: resolved.path, cleanup: () => cleanupPackage(resolved) };
    }

    // Phase 1b: Investigation
    const { result: investigationResult, log: investigateLog } = await timedPhase(
      "investigation",
      () => investigate(resolved.path, inventory, triage, triageOutput.fileVerdicts, normalizedOptions.llm, emit, log),
      5 * 60_000 * timeoutScale,
      {
        riskScore: triage.riskScore,
        focusAreas: triage.focusAreas,
        packagePath: resolved.path,
      },
      (inv) => ({
        capabilityCount: inv.capabilities.length,
        capabilities: inv.capabilities,
        findingCount: inv.findings.length,
        findings: inv.findings.map((f) => ({
          capability: f.capability,
          confidence: f.confidence,
          fileLine: f.fileLine,
          problem: f.problem,
        })),
        proofCount: inv.proofs.length,
        stageSummaries: inv.stageSummaries,
        prioritizedEntrypoints: inv.prioritizedEntrypoints,
        familyAnalyses: inv.familyAnalyses,
        evidenceGraph: inv.evidenceGraph,
        toolCalls: inv.toolCalls.map((tc) => ({
          tool: tc.tool,
          args: tc.args,
          resultPreview: tc.resultPreview,
          timestamp: tc.timestamp,
          injectionDetected: tc.injectionDetected,
        })),
        agentText: inv.agentText.slice(0, 2000),
      }),
      emit,
    );
    trace.push(investigateLog);
    log.writeLog("investigation.json", investigationResult);

    // Phase 1c: Test generation
    const { result: proofs, log: testGenLog } = await timedPhase(
      "test-gen",
      () => generateTests(investigationResult, resolved.path, normalizedOptions.llm),
      5 * 60_000 * timeoutScale,
      { proofCount: investigationResult.proofs.length, findingCount: investigationResult.findings.length },
      (p) => ({
        proofCount: p.length,
        withTests: p.filter((x) => x.testFile).length,
      }),
      emit,
    );
    trace.push(testGenLog);

    // Phase 2: Proof verification (with retry loop — up to 3 attempts per failed test)
    const { result: verifiedProofs, log: verifyLog } = await timedPhase(
      "verify",
      () => verifyProofs(proofs, resolved.path, normalizedOptions.llm, emit, investigationResult.findings),
      8 * 60_000 * timeoutScale,
      { proofCount: proofs.length, withTests: proofs.filter((x) => x.testFile).length },
      (p) => ({
        verifiedCount: p.length,
        confirmed: p.filter((x) => x.kind === "TEST_CONFIRMED").length,
        unconfirmed: p.filter((x) => x.kind === "TEST_UNCONFIRMED").length,
      }),
      emit,
    );
    trace.push(verifyLog);

    const finalProofs = [...matchedAdvisoryProofs, ...cliBehaviorProofs, ...verifiedProofs];
    const finalFindings = [...cliBehaviorFindings, ...investigationResult.findings];
    const report = buildAuditReport({
      securityMode: normalizedOptions.securityMode,
      scanDepth: normalizedOptions.scanDepth,
      inventory,
      dependencyGraph,
      advisories: matchedAdvisories,
      advisorySummary,
      scanWarnings,
      findings: finalFindings,
      cliBehavior,
      cliBehaviorCapabilities: [...new Set([...cliBehaviorCapabilities, ...investigationResult.capabilities])],
      llmEnabled,
      triage,
      proofs: finalProofs,
      prioritizedEntrypoints: investigationResult.prioritizedEntrypoints,
      reasoningStageSummaries: investigationResult.stageSummaries,
      familyAnalyses: investigationResult.familyAnalyses,
      evidenceGraph: investigationResult.evidenceGraph,
      trace,
    });
    console.log(`[pipeline] verdict: ${report.verdict} (${report.finalScore}/100, ${finalProofs.length} proofs)`);
    log.writeLog("report.json", report);
    console.log(`[pipeline] full logs saved to ${log.runDir}`);

    emit?.("verdict_reached", {
      verdict: report.verdict,
      capabilities: report.capabilities,
      proofCount: report.proofs.length,
    });

    return { report, packagePath: resolved.path, cleanup: () => cleanupPackage(resolved) };
  } catch (err) {
    cleanupPackage(resolved);
    throw err;
  }
}
