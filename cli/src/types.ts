export type NodeVersion = "22" | "24";
export type SecurityMode = "strict" | "balanced" | "research";
export type Verdict = "SAFE" | "REVIEW REQUIRED" | "HIGH RISK" | "BLOCK";

export interface ScanRequest {
  packageName: string;
  version?: string;
  publish: boolean;
  scanDepth: number;
  securityMode: SecurityMode;
  llm?: {
    providerName?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  sandbox: {
    nodeVersions: NodeVersion[];
    cliBehaviorEnabled: true;
    aiScenariosEnabled: false;
  };
}

export interface RegistryPrecheckResult {
  found: boolean;
  verdict: string | null;
  score: number | null;
  reportUri: string | null;
  sourceUri: string | null;
  publishedAt: string | null;
  versionMatched: boolean;
  ensName: string | null;
  capabilities: string[];
  registryEnabled?: boolean;
}

export interface PublishEventState {
  status: "skipped" | "published" | "failed";
  reportCid?: string;
  sourceCid?: string;
  ensName?: string | null;
  error?: string;
}

export interface CliStatus {
  status: "ok";
  engineReachable: boolean;
  dockerAvailable: boolean;
  dockerVersion: string | null;
  publishConfigured: boolean;
  registryReadConfigured: boolean;
  registryWriteConfigured: boolean;
  llmConfigured: boolean;
  llmBackend: string;
  llmBaseUrlConfigured: boolean;
  runtimeRoot: string;
}

export interface AuditReport {
  verdict: Verdict;
  finalScore: number;
  recommendedAction: string;
  scanDepthApplied?: number;
  securityModeApplied?: SecurityMode;
  capabilities: string[];
  proofs: Array<{
    capability: string | null;
    confidence: "SUSPECTED" | "LIKELY" | "CONFIRMED";
    confidenceScore?: number;
    problem: string;
    evidence: string;
    fileLine: string;
  }>;
  triage: {
    riskScore: number;
    riskSummary: string;
  } | null;
  advisories: Array<{
    id: string;
    packageName: string;
    packageVersion: string;
    title: string;
    summary: string;
    severity: string;
    sourceIds: string[];
  }>;
  findings: Array<{
    capability: string;
    confidence: "SUSPECTED" | "LIKELY" | "CONFIRMED";
    confidenceScore?: number;
    problem: string;
    evidence: string;
    fileLine: string;
  }>;
}

export interface JsonScanResult {
  packageName: string;
  version: string | null;
  registryPrecheck: RegistryPrecheckResult | null;
  reusedRegistryVerdict: boolean;
  verdict: string;
  score: number | null;
  advisories: AuditReport["advisories"];
  findings: AuditReport["findings"];
  capabilities: string[];
  publishResult: PublishEventState;
}

export interface AuditEventEnvelope {
  type: string;
  [key: string]: unknown;
}
