import { z } from "zod";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const VerdictEnum = z.enum(["SAFE", "REVIEW REQUIRED", "HIGH RISK", "BLOCK"]);
export type VerdictEnum = z.infer<typeof VerdictEnum>;

export const SecurityModeEnum = z.enum(["strict", "balanced", "research"]);
export type SecurityModeEnum = z.infer<typeof SecurityModeEnum>;

export const CapabilityEnum = z.enum([
  // Network / exfiltration
  "NETWORK",
  "DNS_EXFIL",
  "DOM_INJECT",
  // Filesystem / OS
  "FILESYSTEM",
  "BINARY_DOWNLOAD",
  "PROCESS_SPAWN",
  // Credential & environment theft
  "ENV_VARS",
  "CREDENTIAL_THEFT",
  // Code execution tricks
  "EVAL",
  "OBFUSCATION",
  "ENCRYPTED_PAYLOAD",
  // Availability
  "DOS_LOOP",
  // Anti-analysis
  "ANTI_AI_PROMPT",
  "GEO_GATING",
  // Lifecycle abuse
  "LIFECYCLE_HOOK",
  // Supply-chain propagation
  "WORM_PROPAGATION",
  "CLIPBOARD_HIJACK",
  "TELEMETRY_RAT",
  "BUILD_PLUGIN_EXFIL",
  "NPM_TOKEN_ABUSE",
]);
export type CapabilityEnum = z.infer<typeof CapabilityEnum>;

export const Confidence = z.enum(["SUSPECTED", "LIKELY", "CONFIRMED"]);
export type Confidence = z.infer<typeof Confidence>;

export const InvestigationStageEnum = z.enum([
  "threat_context",
  "entrypoint_prioritization",
  "call_chain_expansion",
  "evidence_extraction",
]);
export type InvestigationStageEnum = z.infer<typeof InvestigationStageEnum>;

export const BehaviorFamilyEnum = z.enum([
  "lifecycle_abuse",
  "credential_theft",
  "network_exfiltration",
  "shell_execution",
  "persistence_downloader",
  "obfuscation_staged_payloads",
  "npm_token_abuse",
  "cicd_secret_harvesting",
]);
export type BehaviorFamilyEnum = z.infer<typeof BehaviorFamilyEnum>;

export const EntrypointTypeEnum = z.enum([
  "lifecycle",
  "cli",
  "main",
  "exports",
  "script_reference",
]);
export type EntrypointTypeEnum = z.infer<typeof EntrypointTypeEnum>;

export const EvidenceProofTypeEnum = z.enum(["static", "observed", "verified"]);
export type EvidenceProofTypeEnum = z.infer<typeof EvidenceProofTypeEnum>;

export const EvidenceNodeKindEnum = z.enum([
  "entrypoint",
  "intermediate",
  "sink",
  "decoded_payload",
  "trace_event",
]);
export type EvidenceNodeKindEnum = z.infer<typeof EvidenceNodeKindEnum>;

export const EvidenceEdgeKindEnum = z.enum([
  "imports",
  "calls",
  "reads_env",
  "reads_config",
  "spawns_process",
  "writes_fs",
  "makes_network_request",
  "evaluates_code",
  "decodes_payload",
  "triggers_runtime_event",
]);
export type EvidenceEdgeKindEnum = z.infer<typeof EvidenceEdgeKindEnum>;

export const SinkKindEnum = z.enum([
  "child_process",
  "filesystem",
  "network",
  "dns",
  "eval",
  "dynamic_require",
  "obfuscated_loader",
  "env_access",
  "config_access",
  "unknown",
]);
export type SinkKindEnum = z.infer<typeof SinkKindEnum>;

export const ProofKind = z.enum([
  "STRUCTURAL",
  "AI_STATIC",
  "AI_DYNAMIC",
  "TEST_CONFIRMED",
  "TEST_UNCONFIRMED",
]);
export type ProofKind = z.infer<typeof ProofKind>;

export const AttackPathway = z.enum([
  "DEP_INJECT_ENCRYPTED",
  "LIFECYCLE_BINARY_DROP",
  "MAINTAINER_SABOTAGE",
  "GEO_GATED_WIPER",
  "WORM_PROPAGATION",
  "ACCOUNT_TAKEOVER_CRYPTO",
  "CDN_DOM_DRAINER",
  "MULTI_STAGE_DNS",
  "TELEMETRY_RAT",
  "BUILD_PLUGIN_EXFIL",
]);
export type AttackPathway = z.infer<typeof AttackPathway>;

// ---------------------------------------------------------------------------
// Phase 1a: Triage
// ---------------------------------------------------------------------------

export const FocusArea = z.object({
  file: z.string(),
  lines: z.string().nullable().default(null),
  reason: z.string(),
});
export type FocusArea = z.infer<typeof FocusArea>;

export const TriageResult = z.object({
  riskScore: z.number().int().min(0).max(10),
  riskSummary: z.string(),
  focusAreas: z.array(FocusArea).default([]),
});
export type TriageResult = z.infer<typeof TriageResult>;

export const FileVerdict = z.object({
  file: z.string(),
  capabilities: z.array(z.string()).default([]),
  suspiciousPatterns: z.array(z.string()).default([]),
  suspiciousLines: z.string().nullable().default(null),
  summary: z.string(),
  riskContribution: z.number().int().min(0).max(10),
});
export type FileVerdict = z.infer<typeof FileVerdict>;

// ---------------------------------------------------------------------------
// Phase 1b: Investigation
// ---------------------------------------------------------------------------

export const ReasoningStageSummary = z.object({
  stage: InvestigationStageEnum,
  summary: z.string(),
  highlights: z.array(z.string()).default([]),
});
export type ReasoningStageSummary = z.infer<typeof ReasoningStageSummary>;

export const PrioritizedEntrypoint = z.object({
  id: z.string(),
  type: EntrypointTypeEnum,
  label: z.string(),
  file: z.string().default(""),
  trigger: z.string().default(""),
  reason: z.string(),
  priority: z.number().int().min(1).max(10).default(5),
  scriptName: z.string().nullable().default(null),
  commandName: z.string().nullable().default(null),
});
export type PrioritizedEntrypoint = z.infer<typeof PrioritizedEntrypoint>;

export const FamilyAnalysis = z.object({
  family: BehaviorFamilyEnum,
  selected: z.boolean().default(true),
  rationale: z.string().default(""),
  summary: z.string().default(""),
  entrypointIds: z.array(z.string()).default([]),
  sinkKinds: z.array(SinkKindEnum).default([]),
  observedSignals: z.array(z.string()).default([]),
});
export type FamilyAnalysis = z.infer<typeof FamilyAnalysis>;

export const EvidenceGraphNode = z.object({
  id: z.string(),
  kind: EvidenceNodeKindEnum,
  label: z.string(),
  fileLine: z.string().default(""),
  detail: z.string().default(""),
  entrypointId: z.string().nullable().default(null),
  sinkKind: SinkKindEnum.nullable().default(null),
});
export type EvidenceGraphNode = z.infer<typeof EvidenceGraphNode>;

export const EvidenceGraphEdge = z.object({
  from: z.string(),
  to: z.string(),
  relation: EvidenceEdgeKindEnum,
  detail: z.string().default(""),
  confidenceScore: z.number().min(0).max(10).default(5),
});
export type EvidenceGraphEdge = z.infer<typeof EvidenceGraphEdge>;

export const EvidenceGraph = z.object({
  entrypoints: z.array(PrioritizedEntrypoint).default([]),
  nodes: z.array(EvidenceGraphNode).default([]),
  edges: z.array(EvidenceGraphEdge).default([]),
});
export type EvidenceGraph = z.infer<typeof EvidenceGraph>;

export const Finding = z.object({
  capability: z.string().describe("CapabilityEnum value, e.g. 'NETWORK'"),
  confidence: Confidence,
  confidenceScore: z.number().min(0).max(10).default(5),
  fileLine: z.string().describe("e.g. 'lib/index.js:42-67'"),
  problem: z.string().describe("Human-readable description of the threat"),
  evidence: z.string().describe("Concrete data or observation"),
  reproductionStrategy: z.string().default("").describe("How to prove this in a reproducible test"),
  entrypointId: z.string().nullable().default(null),
  sinkKind: SinkKindEnum.nullable().default(null),
  proofType: EvidenceProofTypeEnum.default("static"),
  evidenceNodeIds: z.array(z.string()).default([]),
});
export type Finding = z.infer<typeof Finding>;

export const InvestigationInput = z.object({
  packagePath: z.string(),
  packageName: z.string().default(""),
  version: z.string().default(""),
  description: z.string().default(""),
  readmeExcerpt: z.string().default(""),
  flags: z.array(z.string()).default([]),
  staticCaps: z.array(z.string()).default([]),
  staticProofSummaries: z.array(z.string()).default([]),
  inventoryScripts: z.record(z.string()).default({}),
  cliCommands: z.array(z.object({
    name: z.string(),
    entry: z.string(),
  })).default([]),
  mainEntrypoint: z.string().nullable().default(null),
  exportEntrypoints: z.array(z.string()).default([]),
  scriptReferencedFiles: z.array(z.string()).default([]),
});
export type InvestigationInput = z.infer<typeof InvestigationInput>;

export const InvestigationOutput = z.object({
  stageSummaries: z.array(ReasoningStageSummary).default([]),
  prioritizedEntrypoints: z.array(PrioritizedEntrypoint).default([]),
  familyAnalyses: z.array(FamilyAnalysis).default([]),
  evidenceGraph: EvidenceGraph.default({
    entrypoints: [],
    nodes: [],
    edges: [],
  }),
  findings: z.array(Finding).default([]),
  summary: z.string().default(""),
});

export type InvestigationOutput = z.infer<typeof InvestigationOutput>;

export const ToolCallRecord = z.object({
  tool: z.string(),
  args: z.record(z.unknown()),
  resultPreview: z.string().default(""),
  timestamp: z.string().default(() => new Date().toISOString()),
  injectionDetected: z.boolean().default(false),
});
export type ToolCallRecord = z.infer<typeof ToolCallRecord>;

/** Extended output from the agent runner — includes tool call trace for observability. */
export const InvestigationAgentOutput = InvestigationOutput.extend({
  toolCalls: z.array(ToolCallRecord).default([]),
  agentText: z.string().default(""),
});
export type InvestigationAgentOutput = z.infer<typeof InvestigationAgentOutput>;

// ---------------------------------------------------------------------------
// Instrumentation sub-models
// ---------------------------------------------------------------------------

export const NetworkCall = z.object({
  method: z.string(),
  url: z.string(),
  bodyPreview: z.string().default(""),
});
export type NetworkCall = z.infer<typeof NetworkCall>;

export const FsOperation = z.object({
  op: z.string(),
  path: z.string(),
  preview: z.string().default(""),
});
export type FsOperation = z.infer<typeof FsOperation>;

export const ProcessSpawn = z.object({
  cmd: z.string(),
  args: z.array(z.string()).default([]),
});
export type ProcessSpawn = z.infer<typeof ProcessSpawn>;

export const EvalCall = z.object({
  code: z.string(),
});
export type EvalCall = z.infer<typeof EvalCall>;

export const CryptoOp = z.object({
  method: z.string(),
  algo: z.string(),
});
export type CryptoOp = z.infer<typeof CryptoOp>;

export const TimerRecord = z.object({
  type: z.string(),
  ms: z.number(),
  source: z.string().default(""),
});
export type TimerRecord = z.infer<typeof TimerRecord>;

export const InstrumentationLog = z.object({
  modulesLoaded: z.array(z.string()).default([]),
  networkCalls: z.array(NetworkCall).default([]),
  fsOperations: z.array(FsOperation).default([]),
  envAccess: z.array(z.string()).default([]),
  processSpawns: z.array(ProcessSpawn).default([]),
  evalCalls: z.array(EvalCall).default([]),
  cryptoOps: z.array(CryptoOp).default([]),
  timers: z.array(TimerRecord).default([]),
});
export type InstrumentationLog = z.infer<typeof InstrumentationLog>;

// ---------------------------------------------------------------------------
// CLI behavior sandbox
// ---------------------------------------------------------------------------

export const CliBehaviorObservationKind = z.enum([
  "network",
  "env",
  "process",
  "filesystem",
  "eval",
  "timeout",
  "large_output",
  "install_error",
]);
export type CliBehaviorObservationKind = z.infer<typeof CliBehaviorObservationKind>;

export const CliBehaviorObservation = z.object({
  kind: CliBehaviorObservationKind,
  detail: z.string(),
});
export type CliBehaviorObservation = z.infer<typeof CliBehaviorObservation>;

export const CliCommandDescriptor = z.object({
  name: z.string(),
  entry: z.string(),
});
export type CliCommandDescriptor = z.infer<typeof CliCommandDescriptor>;

export const CliCommandResult = z.object({
  command: z.string(),
  entry: z.string(),
  nodeVersion: z.string(),
  scenario: z.string(),
  args: z.array(z.string()).default([]),
  exitCode: z.number().nullable().default(null),
  durationMs: z.number(),
  stdoutPreview: z.string().default(""),
  stderrPreview: z.string().default(""),
  timedOut: z.boolean().default(false),
  risk: z.enum(["low", "high", "infra_error", "skipped"]),
  observations: z.array(CliBehaviorObservation).default([]),
  trace: InstrumentationLog.default({
    modulesLoaded: [],
    networkCalls: [],
    fsOperations: [],
    envAccess: [],
    processSpawns: [],
    evalCalls: [],
    cryptoOps: [],
    timers: [],
  }),
});
export type CliCommandResult = z.infer<typeof CliCommandResult>;

export const CliBehaviorReport = z.object({
  enabled: z.boolean().default(true),
  nodeVersions: z.array(z.string()).default([]),
  commandsDiscovered: z.array(CliCommandDescriptor).default([]),
  results: z.array(CliCommandResult).default([]),
  highRiskCount: z.number().int().min(0).default(0),
  skippedReason: z.string().nullable().default(null),
});
export type CliBehaviorReport = z.infer<typeof CliBehaviorReport>;

// ---------------------------------------------------------------------------
// Proof & Report
// ---------------------------------------------------------------------------

export const Proof = z.object({
  capability: CapabilityEnum.nullable().default(null),
  attackPathway: z.string().default(""),
  confidence: Confidence.default("SUSPECTED"),
  confidenceScore: z.number().min(0).max(10).default(5),

  fileLine: z.string(),
  problem: z.string(),
  evidence: z.string(),
  entrypointId: z.string().nullable().default(null),
  sinkKind: SinkKindEnum.nullable().default(null),
  proofType: EvidenceProofTypeEnum.default("static"),
  evidenceNodeIds: z.array(z.string()).default([]),

  kind: ProofKind.default("STRUCTURAL"),
  contentHash: z.string().nullable().default(null),

  reproducible: z.boolean().default(false),
  reproductionCmd: z.string().nullable().default(null),

  testFile: z.string().nullable().default(null),
  testHash: z.string().nullable().default(null),
  testCode: z.string().nullable().default(null),
  verifyError: z.string().nullable().default(null),

  reasoningHash: z.string().nullable().default(null),
  teeAttestationId: z.string().nullable().default(null),
});
export type Proof = z.infer<typeof Proof>;

export const PhaseLog = z.object({
  phase: z.string(),
  durationMs: z.number(),
  input: z.record(z.unknown()).default({}),
  output: z.record(z.unknown()).default({}),
});
export type PhaseLog = z.infer<typeof PhaseLog>;

export const DependencyType = z.enum([
  "root",
  "prod",
  "optional",
  "peer",
  "dev",
  "transitive",
]);
export type DependencyType = z.infer<typeof DependencyType>;

export const DependencyGraphNode = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  depth: z.number().int().min(0),
  dependencyType: DependencyType,
  path: z.string(),
  parents: z.array(z.string()).default([]),
  direct: z.boolean().default(false),
});
export type DependencyGraphNode = z.infer<typeof DependencyGraphNode>;

export const DependencyGraphReport = z.object({
  packageName: z.string(),
  packageVersion: z.string().nullable().default(null),
  nodeCount: z.number().int().min(0).default(0),
  directCount: z.number().int().min(0).default(0),
  maxDepth: z.number().int().min(0).default(0),
  maxObservedDepth: z.number().int().min(0).default(0),
  scanDepthApplied: z.number().int().min(0).max(5).default(3),
  truncated: z.boolean().default(false),
  truncatedNodeCount: z.number().int().min(0).default(0),
  nodes: z.array(DependencyGraphNode).default([]),
});
export type DependencyGraphReport = z.infer<typeof DependencyGraphReport>;

export const AdvisorySeverity = z.enum([
  "critical",
  "high",
  "moderate",
  "low",
  "info",
  "unknown",
]);
export type AdvisorySeverity = z.infer<typeof AdvisorySeverity>;

export const AdvisoryReference = z.object({
  source: z.string(),
  url: z.string(),
});
export type AdvisoryReference = z.infer<typeof AdvisoryReference>;

export const AdvisoryRecord = z.object({
  id: z.string(),
  packageName: z.string(),
  packageVersion: z.string(),
  title: z.string(),
  summary: z.string(),
  severity: AdvisorySeverity,
  sourceIds: z.array(z.string()).default([]),
  aliases: z.array(z.string()).default([]),
  fixedVersion: z.string().nullable().default(null),
  affectedVersion: z.string().nullable().default(null),
  matchedNodes: z.array(z.string()).default([]),
  dependencyPaths: z.array(z.array(z.string())).default([]),
  references: z.array(AdvisoryReference).default([]),
  malware: z.boolean().default(false),
});
export type AdvisoryRecord = z.infer<typeof AdvisoryRecord>;

export const AdvisorySummary = z.object({
  total: z.number().int().min(0).default(0),
  critical: z.number().int().min(0).default(0),
  high: z.number().int().min(0).default(0),
  moderate: z.number().int().min(0).default(0),
  low: z.number().int().min(0).default(0),
  info: z.number().int().min(0).default(0),
  unknown: z.number().int().min(0).default(0),
  dangerousCount: z.number().int().min(0).default(0),
});
export type AdvisorySummary = z.infer<typeof AdvisorySummary>;

export const ScanWarning = z.object({
  code: z.string(),
  message: z.string(),
});
export type ScanWarning = z.infer<typeof ScanWarning>;

export const AuditReport = z.object({
  verdict: VerdictEnum,
  finalScore: z.number().int().min(0).max(100).default(0),
  recommendedAction: z.string().default("Proceed with caution."),
  scanDepthApplied: z.number().int().min(0).max(5).default(3),
  securityModeApplied: SecurityModeEnum.default("balanced"),
  capabilities: z.array(CapabilityEnum).default([]),
  proofs: z.array(Proof).default([]),
  triage: TriageResult.nullable().default(null),
  dependencyGraph: DependencyGraphReport.nullable().default(null),
  advisories: z.array(AdvisoryRecord).default([]),
  advisorySummary: AdvisorySummary.nullable().default(null),
  scanWarnings: z.array(ScanWarning).default([]),
  cliBehavior: CliBehaviorReport.nullable().default(null),
  findings: z.array(Finding).default([]),
  prioritizedEntrypoints: z.array(PrioritizedEntrypoint).default([]),
  reasoningStageSummaries: z.array(ReasoningStageSummary).default([]),
  familyAnalyses: z.array(FamilyAnalysis).default([]),
  evidenceGraph: EvidenceGraph.default({
    entrypoints: [],
    nodes: [],
    edges: [],
  }),
  trace: z.array(PhaseLog).default([]),
});
export type AuditReport = z.infer<typeof AuditReport>;

export const ResolvedPackage = z.object({
  path: z.string(),
  needsCleanup: z.boolean().default(false),
  tmpdir: z.string().nullable().default(null),
});
export type ResolvedPackage = z.infer<typeof ResolvedPackage>;

// ---------------------------------------------------------------------------
// Inventory (Phase 0)
// ---------------------------------------------------------------------------

export const Severity = z.enum(["info", "warn", "critical"]);
export type Severity = z.infer<typeof Severity>;

export const InventoryFlag = z.object({
  severity: Severity,
  check: z.string(),
  detail: z.string(),
  file: z.string().nullable().default(null),
});
export type InventoryFlag = z.infer<typeof InventoryFlag>;

export const DealBreaker = z.object({
  check: z.string(),
  detail: z.string(),
});
export type DealBreaker = z.infer<typeof DealBreaker>;

export const FileRecord = z.object({
  path: z.string(),
  fileType: z.string(),
  sizeBytes: z.number(),
  permissions: z.string(),
  isBinary: z.boolean(),
  binaryType: z.string().nullable().default(null),
});
export type FileRecord = z.infer<typeof FileRecord>;

export const EntryPoints = z.object({
  install: z.array(z.string()),
  runtime: z.array(z.string()),
  bin: z.array(z.string()),
});
export type EntryPoints = z.infer<typeof EntryPoints>;

export const PackageMetadata = z.object({
  name: z.string().nullable().default(null),
  version: z.string().nullable().default(null),
  description: z.string().nullable().default(null),
  license: z.string().nullable().default(null),
  homepage: z.string().nullable().default(null),
  repository: z.unknown().default(null),
});
export type PackageMetadata = z.infer<typeof PackageMetadata>;

export const InventoryReport = z.object({
  metadata: PackageMetadata,
  scripts: z.record(z.string()),
  entryPoints: EntryPoints,
  dependencies: z.record(z.record(z.string())),
  files: z.array(FileRecord),
  flags: z.array(InventoryFlag),
  dealbreaker: DealBreaker.nullable().default(null),
});
export type InventoryReport = z.infer<typeof InventoryReport>;
