import type {
  AdvisoryRecord,
  AuditReport,
  CapabilityEnum,
  CliBehaviorReport,
  Finding,
  InventoryReport,
  Proof,
  SecurityModeEnum,
  TriageResult,
  VerdictEnum,
} from "./models.js";

interface ScoreInputs {
  securityMode: SecurityModeEnum;
  inventory: InventoryReport;
  advisories: AdvisoryRecord[];
  findings: Finding[];
  proofs: Proof[];
  triage: TriageResult | null;
  cliBehavior: CliBehaviorReport | null;
  llmEnabled: boolean;
  maxDependencyDepth: number;
}

interface ScoreResult {
  finalScore: number;
  verdict: VerdictEnum;
  recommendedAction: string;
}

const ADVISORY_WEIGHTS: Record<AdvisoryRecord["severity"], number> = {
  critical: 45,
  high: 28,
  moderate: 12,
  low: 4,
  info: 1,
  unknown: 6,
};

const FLAG_WEIGHTS: Record<string, number> = {
  "lifecycle-scripts": 4,
  "non-node-script": 10,
  "binary-detected": 7,
  "executable-outside-bin": 8,
  "unusual-extension": 4,
  "encoded-content": 12,
  "minified-install-script": 14,
  "hidden-dotfile": 2,
};

const OBSERVATION_WEIGHTS: Record<string, number> = {
  network: 30,
  env: 28,
  process: 26,
  filesystem: 24,
  eval: 12,
  timeout: 18,
  large_output: 6,
  install_error: 8,
};

export function scoreAudit(inputs: ScoreInputs): ScoreResult {
  if (inputs.inventory.dealbreaker) {
    return finalizeScore(96, inputs.securityMode);
  }

  let score = 0;

  score += advisoryScore(inputs.advisories);
  score += inventoryScore(inputs.inventory);
  score += runtimeScore(inputs.cliBehavior);
  score += proofScore(inputs.proofs);
  score += findingScore(inputs.findings);
  score += depthScore(inputs.maxDependencyDepth);

  if (inputs.llmEnabled && inputs.triage) {
    score += Math.round(inputs.triage.riskScore * (inputs.securityMode === "research" ? 3.5 : 2.5));
  }

  score = applyPolicyFloors(score, inputs);
  return finalizeScore(Math.min(100, score), inputs.securityMode);
}

function advisoryScore(advisories: AdvisoryRecord[]): number {
  return advisories.reduce((sum, advisory) => {
    const base = advisory.malware ? 55 : ADVISORY_WEIGHTS[advisory.severity];
    return sum + base;
  }, 0);
}

function inventoryScore(inventory: InventoryReport): number {
  return inventory.flags.reduce((sum, flag) => {
    const base = FLAG_WEIGHTS[flag.check] ?? 3;
    const severityBoost = flag.severity === "critical" ? 10 : flag.severity === "warn" ? 4 : 1;
    return sum + base + severityBoost;
  }, 0);
}

function runtimeScore(cliBehavior: CliBehaviorReport | null): number {
  if (!cliBehavior) return 0;
  return cliBehavior.results.reduce((sum, result) => {
    return sum + result.observations.reduce((inner, observation) => inner + (OBSERVATION_WEIGHTS[observation.kind] ?? 0), 0);
  }, 0);
}

function proofScore(proofs: Proof[]): number {
  return proofs.reduce((sum, proof) => {
    const confidenceBoost = proof.confidence === "CONFIRMED" ? 12 : proof.confidence === "LIKELY" ? 7 : 3;
    const kindBoost =
      proof.kind === "TEST_CONFIRMED" ? 14 :
      proof.kind === "AI_DYNAMIC" ? 10 :
      proof.kind === "STRUCTURAL" ? 8 :
      proof.kind === "TEST_UNCONFIRMED" ? 4 : 6;
    return sum + confidenceBoost + kindBoost;
  }, 0);
}

function findingScore(findings: Finding[]): number {
  return findings.reduce((sum, finding) => {
    const confidence = finding.confidence === "CONFIRMED" ? 7 : finding.confidence === "LIKELY" ? 4 : 2;
    return sum + confidence + Math.round((finding.confidenceScore ?? 5) / 3);
  }, 0);
}

function depthScore(maxDependencyDepth: number): number {
  return Math.min(12, Math.max(0, maxDependencyDepth - 1) * 3);
}

function hasSevereAdvisory(advisories: AdvisoryRecord[]): boolean {
  return advisories.some((advisory) => advisory.malware || advisory.severity === "critical" || advisory.severity === "high");
}

function hasCriticalRuntimeBehavior(cliBehavior: CliBehaviorReport | null): boolean {
  return Boolean(cliBehavior?.results.some((result) =>
    result.observations.some((observation) =>
      observation.kind === "network" ||
      observation.kind === "env" ||
      observation.kind === "process" ||
      observation.kind === "filesystem" ||
      observation.kind === "timeout",
    ),
  ));
}

function hasLifecycleHeavyInventory(inventory: InventoryReport): boolean {
  return inventory.flags.some((flag) => flag.check === "lifecycle-scripts" || flag.check === "non-node-script");
}

function applyPolicyFloors(score: number, inputs: ScoreInputs): number {
  const severeAdvisory = hasSevereAdvisory(inputs.advisories);
  const criticalRuntime = hasCriticalRuntimeBehavior(inputs.cliBehavior);
  const lifecycleHeavy = hasLifecycleHeavyInventory(inputs.inventory);

  if (inputs.securityMode === "strict") {
    if (severeAdvisory || criticalRuntime) return Math.max(score, 80);
    if (lifecycleHeavy) return Math.max(score, 52);
    return Math.min(100, score + 8);
  }

  if (inputs.securityMode === "research") {
    if (severeAdvisory || criticalRuntime) return Math.max(score, 76);
    return Math.min(100, score + 5);
  }

  if (criticalRuntime) return Math.max(score, 76);
  if (severeAdvisory) return Math.max(score, 58);
  return score;
}

function finalizeScore(rawScore: number, _mode: SecurityModeEnum): ScoreResult {
  const finalScore = Math.max(0, Math.min(100, Math.round(rawScore)));
  const verdict =
    finalScore >= 75 ? "BLOCK" :
    finalScore >= 50 ? "HIGH RISK" :
    finalScore >= 25 ? "REVIEW REQUIRED" :
    "SAFE";

  const recommendedAction =
    verdict === "BLOCK" ? "Block install and investigate before using this package." :
    verdict === "HIGH RISK" ? "Hold install and perform a manual security review with the collected evidence." :
    verdict === "REVIEW REQUIRED" ? "Review the flagged findings and advisories before proceeding." :
    "Proceed with installation using standard caution.";

  return { finalScore, verdict, recommendedAction };
}

export function isBlockingVerdict(verdict: VerdictEnum): boolean {
  return verdict === "HIGH RISK" || verdict === "BLOCK";
}

export function deriveCapabilityTags(findings: Finding[], proofs: Proof[], cliCapabilities: CapabilityEnum[]): CapabilityEnum[] {
  const tags = new Set<CapabilityEnum>(cliCapabilities);
  for (const proof of proofs) {
    if (proof.capability) tags.add(proof.capability);
  }
  for (const finding of findings) {
    const pieces = finding.capability.split(",").map((value) => value.trim()).filter(Boolean) as CapabilityEnum[];
    for (const piece of pieces) tags.add(piece);
  }
  return [...tags];
}
