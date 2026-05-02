import type {
  BehaviorFamilyEnum,
  Confidence,
  EvidenceGraph,
  EvidenceProofTypeEnum,
  FamilyAnalysis,
  Finding,
  InvestigationInput,
  PrioritizedEntrypoint,
  SinkKindEnum,
  TriageResult,
} from "../models.js";

export const FAMILY_DESCRIPTIONS: Record<BehaviorFamilyEnum, {
  label: string;
  sinks: string[];
  indicators: string[];
}> = {
  lifecycle_abuse: {
    label: "Lifecycle abuse",
    sinks: ["child_process", "filesystem", "network"],
    indicators: ["preinstall", "install", "postinstall", "prepare", "script-referenced loaders"],
  },
  credential_theft: {
    label: "Credential theft",
    sinks: ["env_access", "network", "filesystem"],
    indicators: ["SSH keys", "AWS creds", "wallet mnemonics", "browser profile paths"],
  },
  network_exfiltration: {
    label: "Network exfiltration",
    sinks: ["network", "dns"],
    indicators: ["http/https", "net", "dns", "telemetry POSTs", "encoded endpoints"],
  },
  shell_execution: {
    label: "Shell execution",
    sinks: ["child_process"],
    indicators: ["child_process", "spawn", "exec", "fork", "download-and-run"],
  },
  persistence_downloader: {
    label: "Persistence / downloader behavior",
    sinks: ["filesystem", "network", "child_process"],
    indicators: ["autostart", "binary drop", "cron", "scheduled tasks", "downloaders"],
  },
  obfuscation_staged_payloads: {
    label: "Obfuscation / staged payloads",
    sinks: ["obfuscated_loader", "eval", "dynamic_require"],
    indicators: ["base64", "hex", "xor", "string joins", "staged loaders"],
  },
  npm_token_abuse: {
    label: "npm token abuse",
    sinks: ["env_access", "network", "config_access"],
    indicators: ["NPM_TOKEN", ".npmrc", "npm config", "registry auth"],
  },
  cicd_secret_harvesting: {
    label: "CI/CD secret harvesting",
    sinks: ["env_access", "filesystem", "network"],
    indicators: ["GITHUB_TOKEN", "CI", ".git-credentials", "runner metadata", "workflow secrets"],
  },
};

export function buildThreatContextPrompt(input: InvestigationInput): string {
  return [
    `Package: ${input.packageName || "unknown"}@${input.version || "?"}`,
    `Description: ${input.description || "N/A"}`,
    input.readmeExcerpt ? `README excerpt:\n${input.readmeExcerpt}` : "README excerpt: none",
    input.flags.length ? `Inventory flags:\n- ${input.flags.join("\n- ")}` : "Inventory flags: none",
    input.staticCaps.length ? `Detected capabilities: ${input.staticCaps.join(", ")}` : "Detected capabilities: none",
    "Task: infer intended package behavior, compare it to the risky capabilities, and identify any intent mismatch.",
  ].join("\n\n");
}

export function buildEntrypointPrompt(input: InvestigationInput, threatSummary: string): string {
  const cliEntries = input.cliCommands.length
    ? input.cliCommands.map((command) => `- ${command.name}: ${command.entry}`).join("\n")
    : "none";
  const scriptRefs = input.scriptReferencedFiles.length
    ? input.scriptReferencedFiles.map((file) => `- ${file}`).join("\n")
    : "none";

  return [
    `Threat context summary:\n${threatSummary}`,
    input.inventoryScripts && Object.keys(input.inventoryScripts).length
      ? `Scripts:\n${JSON.stringify(input.inventoryScripts, null, 2)}`
      : "Scripts: {}",
    `CLI entrypoints:\n${cliEntries}`,
    `Main entrypoint: ${input.mainEntrypoint ?? "none"}`,
    input.exportEntrypoints.length
      ? `Exports:\n- ${input.exportEntrypoints.join("\n- ")}`
      : "Exports: none",
    `Script-referenced files:\n${scriptRefs}`,
    "Task: rank the exact entrypoints most likely to lead to dangerous sinks. Prioritize lifecycle hooks, CLI entrypoints, main/exports, and files referenced by scripts.",
  ].join("\n\n");
}

export function buildFamilyPrompt(input: {
  family: BehaviorFamilyEnum;
  entrypoints: PrioritizedEntrypoint[];
  threatSummary: string;
  entrypointSummary: string;
  priorFindingSummaries: string[];
  staticCaps: string[];
  readmeExcerpt: string;
}): string {
  const family = FAMILY_DESCRIPTIONS[input.family];
  return [
    `Behavior family: ${family.label}`,
    `Target sinks: ${family.sinks.join(", ")}`,
    `Indicators: ${family.indicators.join(", ")}`,
    `Threat context:\n${input.threatSummary}`,
    `Entrypoint summary:\n${input.entrypointSummary}`,
    input.staticCaps.length ? `Static capabilities: ${input.staticCaps.join(", ")}` : "Static capabilities: none",
    input.priorFindingSummaries.length
      ? `Prior suspicious locations:\n- ${input.priorFindingSummaries.join("\n- ")}`
      : "Prior suspicious locations: none",
    input.readmeExcerpt ? `README excerpt:\n${input.readmeExcerpt}` : "README excerpt: none",
    input.entrypoints.length
      ? `Entrypoints to investigate:\n${input.entrypoints.map((entrypoint) => `- [${entrypoint.id}] ${entrypoint.type} ${entrypoint.label} -> ${entrypoint.file || entrypoint.trigger || "n/a"} (${entrypoint.reason})`).join("\n")}`
      : "Entrypoints to investigate: none",
    [
      "Task:",
      "1. Investigate only this behavior family.",
      "2. Expand from the selected entrypoints into the target sinks.",
      "3. Use tools to read code, search patterns, decode payloads, and capture trace evidence.",
      "4. Do not invent runtime behavior. If you did not observe it, say so.",
    ].join("\n"),
  ].join("\n\n");
}

export function buildEvidenceExtractionPrompt(input: {
  threatContext: string;
  entrypointSummary: string;
  familyRuns: Array<{
    family: BehaviorFamilyEnum;
    summary: string;
    entrypointIds: string[];
    toolCalls: Array<{ tool: string; args: unknown; resultPreview: string }>;
  }>;
  staticProofSummaries: string[];
  findingsSoFar: string[];
}): string {
  const familyBlocks = input.familyRuns.map((run) => [
    `Family: ${run.family}`,
    `Entrypoints: ${run.entrypointIds.join(", ") || "none"}`,
    `Summary:\n${run.summary}`,
    run.toolCalls.length
      ? `Tool evidence:\n${run.toolCalls.map((call) => `- ${call.tool}(${JSON.stringify(call.args)}) -> ${call.resultPreview}`).join("\n")}`
      : "Tool evidence: none",
  ].join("\n")).join("\n\n");

  return [
    `Threat context:\n${input.threatContext}`,
    `Entrypoint prioritization:\n${input.entrypointSummary}`,
    input.staticProofSummaries.length
      ? `Static evidence:\n- ${input.staticProofSummaries.join("\n- ")}`
      : "Static evidence: none",
    input.findingsSoFar.length
      ? `Interim findings:\n- ${input.findingsSoFar.join("\n- ")}`
      : "Interim findings: none",
    familyBlocks ? `Family analyses:\n${familyBlocks}` : "Family analyses: none",
    [
      "Return only evidence-backed findings.",
      "Every finding must reference entrypoints and evidence nodes.",
      "Use proofType=static unless runtime trace evidence exists.",
      "Use proofType=observed only when runtime instrumentation observed the behavior.",
      "Use proofType=verified only when a generated verification test confirmed it.",
      "Static-only findings must never exceed confidenceScore 8.",
      "Observed findings can reach 9, verified findings can reach 10.",
    ].join("\n"),
  ].join("\n\n");
}

export function chooseBehaviorFamilies(input: {
  investigationInput: InvestigationInput;
  triage: TriageResult;
  entrypoints: PrioritizedEntrypoint[];
}): BehaviorFamilyEnum[] {
  const selected = new Set<BehaviorFamilyEnum>();
  const text = [
    input.investigationInput.staticCaps.join(" "),
    input.investigationInput.flags.join(" "),
    input.investigationInput.staticProofSummaries.join(" "),
    input.entrypoints.map((entrypoint) => `${entrypoint.type} ${entrypoint.reason} ${entrypoint.label}`).join(" "),
  ].join(" ").toLowerCase();

  if (/(preinstall|postinstall|prepare|install|lifecycle)/.test(text)) selected.add("lifecycle_abuse");
  if (/(env|credential|secret|token|wallet|ssh|aws)/.test(text)) selected.add("credential_theft");
  if (/(http|https|dns|network|fetch|axios|request|exfil)/.test(text)) selected.add("network_exfiltration");
  if (/(child_process|spawn|exec|fork|shell)/.test(text)) selected.add("shell_execution");
  if (/(binary|download|persist|cron|autostart|drop)/.test(text)) selected.add("persistence_downloader");
  if (/(obfus|eval|function|dynamic require|base64|hex|xor|encrypted)/.test(text)) selected.add("obfuscation_staged_payloads");
  if (/(npm_token|npmrc|registry auth)/.test(text)) selected.add("npm_token_abuse");
  if (/(github_token|ci|workflow|runner|gitlab|circleci)/.test(text)) selected.add("cicd_secret_harvesting");

  if (input.triage.riskScore >= 7 && selected.size === 0) {
    selected.add("network_exfiltration");
    selected.add("shell_execution");
  }

  if (selected.size === 0) {
    selected.add("lifecycle_abuse");
  }

  return [...selected];
}

export function deriveConfidenceFromProofType(
  rawScore: number,
  proofType: EvidenceProofTypeEnum,
): { score: number; confidence: Confidence } {
  let score = Math.max(0, Math.min(10, Math.round(rawScore)));
  if (proofType === "static") {
    score = Math.min(score, 8);
  } else if (proofType === "observed") {
    score = Math.min(score, 9);
    score = Math.max(score, 7);
  } else if (proofType === "verified") {
    score = 10;
  }

  const confidence: Confidence =
    score >= 9 ? "CONFIRMED" :
    score >= 4 ? "LIKELY" :
    "SUSPECTED";

  return { score, confidence };
}

export function normalizeFindings(findings: Finding[]): Finding[] {
  return findings.map((finding) => {
    const { score, confidence } = deriveConfidenceFromProofType(
      finding.confidenceScore ?? 5,
      finding.proofType,
    );
    return {
      ...finding,
      confidenceScore: score,
      confidence,
    };
  });
}

export function normalizeEvidenceGraph(graph: EvidenceGraph): EvidenceGraph {
  const nodeMap = new Map<string, EvidenceGraph["nodes"][number]>();
  for (const node of graph.nodes) {
    const key = `${node.kind}|${node.fileLine}|${node.label}|${node.entrypointId ?? ""}|${node.sinkKind ?? ""}`;
    if (!nodeMap.has(key)) {
      nodeMap.set(key, {
        ...node,
        id: node.id || `node-${nodeMap.size + 1}`,
      });
    }
  }

  const nodes = [...nodeMap.values()];
  const validIds = new Set(nodes.map((node) => node.id));
  const edgeMap = new Map<string, EvidenceGraph["edges"][number]>();
  for (const edge of graph.edges) {
    if (!validIds.has(edge.from) || !validIds.has(edge.to)) continue;
    const key = `${edge.from}|${edge.to}|${edge.relation}|${edge.detail}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, edge);
    }
  }

  return {
    entrypoints: graph.entrypoints,
    nodes,
    edges: [...edgeMap.values()],
  };
}

export function summarizeEntrypoints(entrypoints: PrioritizedEntrypoint[]): string {
  if (entrypoints.length === 0) return "No explicit high-priority entrypoints were identified.";
  return entrypoints
    .map((entrypoint) => `[${entrypoint.id}] ${entrypoint.type} ${entrypoint.label} -> ${entrypoint.file || entrypoint.trigger || "n/a"} (${entrypoint.reason})`)
    .join("\n");
}

export function summarizeFamilies(families: FamilyAnalysis[]): string[] {
  return families.map((family) => `${family.family}: ${family.summary}`);
}

export function coerceSinkKind(value: string | null | undefined): SinkKindEnum | null {
  if (!value) return null;
  const normalized = value.toLowerCase().trim();
  switch (normalized) {
    case "child_process":
    case "filesystem":
    case "network":
    case "dns":
    case "eval":
    case "dynamic_require":
    case "obfuscated_loader":
    case "env_access":
    case "config_access":
    case "unknown":
      return normalized;
    default:
      return "unknown";
  }
}
