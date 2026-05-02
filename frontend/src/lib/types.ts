// Mirror of engine event types and data structures
export type NodeVersion = "22" | "24";
export type SecurityMode = "strict" | "balanced" | "research";
export type Verdict = "SAFE" | "REVIEW REQUIRED" | "HIGH RISK" | "BLOCK";

export interface FileRecord {
  path: string;
  fileType: string;
  sizeBytes: number;
  permissions: string;
  isBinary: boolean;
  binaryType: string | null;
}

export interface FileVerdict {
  file: string;
  capabilities: string[];
  suspiciousPatterns: string[];
  suspiciousLines: string | null;
  summary: string;
  riskContribution: number;
}

export interface FocusArea {
  file: string;
  lines: string | null;
  reason: string;
}

export interface Finding {
  capability: string;
  confidence: "SUSPECTED" | "LIKELY" | "CONFIRMED";
  confidenceScore: number;
  fileLine: string;
  problem: string;
  evidence: string;
  reproductionStrategy: string;
}

export interface Proof {
  capability: string | null;
  attackPathway: string;
  confidence: "SUSPECTED" | "LIKELY" | "CONFIRMED";
  confidenceScore: number;
  fileLine: string;
  problem: string;
  evidence: string;
  kind: "STRUCTURAL" | "AI_STATIC" | "AI_DYNAMIC" | "TEST_CONFIRMED" | "TEST_UNCONFIRMED";
  reproducible: boolean;
  reproductionCmd: string | null;
  testFile: string | null;
  testHash: string | null;
  testCode: string | null;
  verifyError: string | null;
  reasoningHash: string | null;
}

export interface CliBehaviorObservation {
  kind: "network" | "env" | "process" | "filesystem" | "eval" | "timeout" | "large_output" | "install_error";
  detail: string;
}

export interface InstrumentationLog {
  modulesLoaded: string[];
  networkCalls: Array<{ method: string; url: string; bodyPreview: string }>;
  fsOperations: Array<{ op: string; path: string; preview: string }>;
  envAccess: string[];
  processSpawns: Array<{ cmd: string; args: string[] }>;
  evalCalls: Array<{ code: string }>;
  cryptoOps: Array<{ method: string; algo: string }>;
  timers: Array<{ type: string; ms: number; source: string }>;
}

export interface CliCommandDescriptor {
  name: string;
  entry: string;
}

export interface CliCommandResult {
  command: string;
  entry: string;
  nodeVersion: string;
  scenario: string;
  args: string[];
  exitCode: number | null;
  durationMs: number;
  stdoutPreview: string;
  stderrPreview: string;
  timedOut: boolean;
  risk: "low" | "high" | "infra_error" | "skipped";
  observations: CliBehaviorObservation[];
  trace: InstrumentationLog;
}

export interface CliBehaviorReport {
  enabled: boolean;
  nodeVersions: string[];
  commandsDiscovered: CliCommandDescriptor[];
  results: CliCommandResult[];
  highRiskCount: number;
  skippedReason: string | null;
}

export interface DependencyGraphNode {
  id: string;
  name: string;
  version: string;
  depth: number;
  dependencyType: "root" | "prod" | "optional" | "peer" | "dev" | "transitive";
  path: string;
  parents: string[];
  direct: boolean;
}

export interface DependencyGraphReport {
  packageName: string;
  packageVersion: string | null;
  nodeCount: number;
  directCount: number;
  maxDepth: number;
  maxObservedDepth: number;
  scanDepthApplied: number;
  truncated: boolean;
  truncatedNodeCount: number;
  nodes: DependencyGraphNode[];
}

export interface AdvisoryReference {
  source: string;
  url: string;
}

export interface AdvisoryRecord {
  id: string;
  packageName: string;
  packageVersion: string;
  title: string;
  summary: string;
  severity: "critical" | "high" | "moderate" | "low" | "info" | "unknown";
  sourceIds: string[];
  aliases: string[];
  fixedVersion: string | null;
  affectedVersion: string | null;
  matchedNodes: string[];
  dependencyPaths: string[][];
  references: AdvisoryReference[];
  malware: boolean;
}

export interface AdvisorySummary {
  total: number;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  info: number;
  unknown: number;
  dangerousCount: number;
}

export interface ScanWarning {
  code: string;
  message: string;
}

export interface AuditLlmOverride {
  providerName?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

export interface AuditSandboxOptions {
  nodeVersions: NodeVersion[];
  cliBehaviorEnabled: boolean;
  aiScenariosEnabled: boolean;
}

export interface AuditStartOptions {
  llm?: AuditLlmOverride;
  sandbox?: AuditSandboxOptions;
  publish?: boolean;
  scanDepth?: number;
  securityMode?: SecurityMode;
}

export interface AppSettings {
  llmEnabled: boolean;
  llmBackend: "anthropic" | "openai_compatible";
  llmBaseUrl: string;
  llmApiKey?: string;
  triageModel: string;
  investigationModel: string;
  testGenModel: string;
  githubToken?: string;
  nvdApiKey?: string;
  defaultNodeVersions: NodeVersion[];
  defaultScanDepth: number;
  defaultSecurityMode: SecurityMode;
  cliBehaviorEnabled: boolean;
  aiScenariosEnabled: boolean;
  publishEnabled: boolean;
  sandboxImage: string;
  sandboxMemoryMb: number;
  sandboxCpus: number;
  sandboxNetwork: string;
  maxDockerExecTimeoutSec: number;
  runtimeRoot?: string;
  runtimeHostRoot?: string;
}

export interface SettingsResponse {
  settings: AppSettings;
  configPath: string;
}

export type FileStatus = "pending" | "analyzing" | "safe" | "suspicious" | "dangerous";

export type PhaseStatus = "pending" | "active" | "done";

export interface PhaseInfo {
  name: string;
  durationMs?: number;
  status: PhaseStatus;
}

export interface AgentStep {
  type: "tool_call" | "tool_result" | "reasoning";
  tool?: string;
  args?: Record<string, unknown>;
  resultPreview?: string;
  text?: string;
  step: number;
  timestamp: string;
  injectionDetected?: boolean;
}

export interface PipelineLogEntry {
  kind: "phase" | "info" | "file-scan" | "file-flag" | "scripts";
  text: string;
  file?: string;
  risk?: number;
  timestamp: string;
  scripts?: Record<string, string>;
}

export interface InventoryMeta {
  scripts: Record<string, string>;
  dependencies: Record<string, Record<string, string>>;
  entryPoints: { install: string[]; runtime: string[]; bin: string[] };
  metadata: { name: string | null; version: string | null; description: string | null; license: string | null };
}

export interface AuditReport {
  verdict: Verdict;
  finalScore: number;
  recommendedAction: string;
  scanDepthApplied: number;
  securityModeApplied: SecurityMode;
  capabilities: string[];
  proofs: Proof[];
  triage: {
    riskScore: number;
    riskSummary: string;
    focusAreas: FocusArea[];
  } | null;
  dependencyGraph: DependencyGraphReport | null;
  advisories: AdvisoryRecord[];
  advisorySummary: AdvisorySummary | null;
  scanWarnings: ScanWarning[];
  cliBehavior: CliBehaviorReport | null;
  findings: Finding[];
}

// SSE event payloads — discriminated union for type safety
interface BaseEvent {
  auditId: string;
  timestamp: string;
}

export interface AuditStartedEvent extends BaseEvent {
  type: "audit_started";
}

export interface PhaseStartedEvent extends BaseEvent {
  type: "phase_started";
  phase: string;
}

export interface PhaseCompletedEvent extends BaseEvent {
  type: "phase_completed";
  phase: string;
  durationMs: number;
}

export interface FileListEvent extends BaseEvent {
  type: "file_list";
  files: FileRecord[];
}

export interface FileAnalyzingEvent extends BaseEvent {
  type: "file_analyzing";
  file: string;
}

export interface FileVerdictEvent extends BaseEvent {
  type: "file_verdict";
  verdict: FileVerdict;
}

export interface TriageCompleteEvent extends BaseEvent {
  type: "triage_complete";
  riskScore: number;
  riskSummary: string;
  focusAreas: FocusArea[];
}

export interface AgentToolCallEvent extends BaseEvent {
  type: "agent_tool_call";
  tool: string;
  args: Record<string, unknown>;
  step: number;
}

export interface AgentToolResultEvent extends BaseEvent {
  type: "agent_tool_result";
  tool: string;
  resultPreview: string;
  step: number;
  injectionDetected: boolean;
}

export interface AgentReasoningEvent extends BaseEvent {
  type: "agent_reasoning";
  text: string;
  step: number;
}

export interface FindingDiscoveredEvent extends BaseEvent {
  type: "finding_discovered";
  finding: Finding;
}

export interface VerdictReachedEvent extends BaseEvent {
  type: "verdict_reached";
  verdict: Verdict;
  capabilities: string[];
  proofCount: number;
}

export interface AgentThinkingEvent extends BaseEvent {
  type: "agent_thinking";
  step: number;
}

export interface TriageProgressEvent extends BaseEvent {
  type: "triage_progress";
  current: number;
  total: number;
  file: string;
}

export interface InventoryMetaEvent extends BaseEvent {
  type: "inventory_meta";
  scripts: Record<string, string>;
  dependencies: Record<string, Record<string, string>>;
  entryPoints: { install: string[]; runtime: string[]; bin: string[] };
  metadata: { name: string | null; version: string | null; description: string | null; license: string | null };
}

export interface AuditErrorEvent extends BaseEvent {
  type: "audit_error";
  error?: string;
}

export interface VerifyStartedEvent extends BaseEvent {
  type: "verify_started";
  totalTests: number;
}

export interface VerifyTestResultEvent extends BaseEvent {
  type: "verify_test_result";
  proofIndex: number;
  testFile: string;
  status: "confirmed" | "unconfirmed" | "infra_error";
  error?: string;
}

export interface CliBehaviorStartedEvent extends BaseEvent {
  type: "cli_behavior_started";
  commands: CliCommandDescriptor[];
  nodeVersions: string[];
}

export interface CliCommandResultEvent extends BaseEvent {
  type: "cli_command_result";
  result: CliCommandResult;
}

export interface DependencyGraphReadyEvent extends BaseEvent {
  type: "dependency_graph_ready";
  graph: DependencyGraphReport;
}

export interface AdvisoryScanStartedEvent extends BaseEvent {
  type: "advisory_scan_started";
  nodeCount: number;
}

export interface AdvisoryMatchEvent extends BaseEvent {
  type: "advisory_match";
  advisory: AdvisoryRecord;
}

export interface AdvisorySummaryEvent extends BaseEvent {
  type: "advisory_summary";
  summary: AdvisorySummary;
  warnings: ScanWarning[];
}

export interface PublishCompleteEvent extends BaseEvent {
  type: "publish_complete";
  reportCid: string;
  sourceCid: string;
  ensName: string | null;
}

export interface PublishFailedEvent extends BaseEvent {
  type: "publish_failed";
  error: string;
}

export interface AuditCompleteEvent extends BaseEvent {
  type: "audit_complete";
  published: boolean;
}

export type SSEEvent =
  | AuditStartedEvent
  | PhaseStartedEvent
  | PhaseCompletedEvent
  | FileListEvent
  | FileAnalyzingEvent
  | FileVerdictEvent
  | TriageCompleteEvent
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentReasoningEvent
  | FindingDiscoveredEvent
  | VerdictReachedEvent
  | AgentThinkingEvent
  | TriageProgressEvent
  | InventoryMetaEvent
  | AuditErrorEvent
  | VerifyStartedEvent
  | VerifyTestResultEvent
  | CliBehaviorStartedEvent
  | CliCommandResultEvent
  | DependencyGraphReadyEvent
  | AdvisoryScanStartedEvent
  | AdvisoryMatchEvent
  | AdvisorySummaryEvent
  | PublishCompleteEvent
  | PublishFailedEvent
  | AuditCompleteEvent;

export const PHASE_ORDER = ["resolve", "inventory", "dependency-graph", "advisory-scan", "cli-behavior", "triage", "investigation", "test-gen", "verify"] as const;

export const AUDIT_PATH_RE = /^\/audit\/([0-9a-f-]{36})$/;

export const PHASE_LABELS: Record<string, string> = {
  resolve: "Resolving package",
  inventory: "Scanning package structure",
  "dependency-graph": "Building dependency graph",
  "advisory-scan": "Checking advisories",
  "cli-behavior": "Running CLI behavior sandbox",
  triage: "Analyzing source files",
  investigation: "Starting deep investigation",
  "test-gen": "Generating exploit tests",
  verify: "Running verification",
};

/** Labels shown for quiet (non-agent) phases in the activity feed */
export const PHASE_WAIT_LABELS: Record<string, string> = {
  resolve: "Downloading and unpacking...",
  inventory: "Building file inventory...",
  "dependency-graph": "Resolving dependency tree...",
  "advisory-scan": "Matching known advisories...",
  "cli-behavior": "Running CLI behavior checks...",
  triage: "Analyzing source files...",
  investigation: "Agent is investigating...",
  "test-gen": "Generating exploit tests...",
  verify: "Running verification in sandbox...",
};

export function parseLineRanges(spec: string | null): Array<[number, number]> {
  if (!spec) return [];
  return spec.split(",").map((range) => {
    const parts = range.trim().split("-").map(Number);
    if (parts.length === 1) return [parts[0], parts[0]] as [number, number];
    return [parts[0], parts[1]] as [number, number];
  });
}
