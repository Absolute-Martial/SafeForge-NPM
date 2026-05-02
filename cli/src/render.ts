import type { AuditEventEnvelope, AuditReport, PublishEventState, RegistryPrecheckResult } from "./types.js";

export class TerminalRenderer {
  private readonly usePlain = !process.stdout.isTTY;

  line(text: string) {
    process.stdout.write(`${text}\n`);
  }

  renderRegistryCheckStart() {
    this.line("checking on-chain audit registry...");
  }

  renderRegistryReuse(precheck: RegistryPrecheckResult) {
    const score = precheck.score ?? "?";
    this.line(`> existing audit found. reusing published verdict for ${precheck.ensName ?? "requested version"}.`);
    this.line(`> published verdict: ${(precheck.verdict ?? "unknown").toUpperCase()} (${score}/100)`);
  }

  renderRegistryMiss() {
    this.line("> no existing audit found. requesting new audit.");
  }

  renderRegistrySkip(reason: string) {
    this.line(`> ${reason}`);
  }

  renderEvent(event: AuditEventEnvelope) {
    const line = describeEvent(event, this.usePlain);
    if (line) {
      this.line(line);
    }
  }

  renderFinal(report: AuditReport, publishState: PublishEventState, options: {
    registryPrecheck: RegistryPrecheckResult | null;
    reusedRegistryVerdict: boolean;
  }) {
    const score = report.finalScore ?? report.triage?.riskScore ?? 0;
    const summary = summarizeReport(report);
    const tags = deriveTags(report);

    this.line(report.verdict);
    this.line(`Score: ${score}/100`);
    this.line(summary);
    if (report.recommendedAction) {
      this.line(report.recommendedAction);
    }
    if (tags.length > 0) {
      this.line(tags.join("\n"));
    }

    if (publishState.status === "published") {
      this.line("> verdict published to IPFS + ENS");
    } else if (publishState.status === "failed") {
      this.line(`> publish warning: ${publishState.error ?? "unknown publish failure"}`);
    } else if (options.reusedRegistryVerdict && options.registryPrecheck?.reportUri) {
      this.line(`> reused published report: ${options.registryPrecheck.reportUri}`);
    }

    if (report.verdict === "BLOCK" || report.verdict === "HIGH RISK") {
      this.line("> INSTALL BLOCKED. Package is too risky for this policy.");
    } else if (report.verdict === "REVIEW REQUIRED") {
      this.line("> REVIEW REQUIRED. Inspect the report before installing.");
    } else {
      this.line("> install allowed. no blocking behavior was confirmed in this scan.");
    }
  }
}

export function describeEvent(event: AuditEventEnvelope, _plain: boolean): string | null {
  switch (event.type) {
    case "audit_started":
      return "> analyzing source code & dependencies...";
    case "phase_started":
      return phaseLine(String(event.phase ?? ""));
    case "dependency_graph_ready": {
      const graph = event.graph as { nodeCount?: number; maxDepth?: number } | undefined;
      return `> dependency graph ready: ${graph?.nodeCount ?? 0} packages across depth ${graph?.maxDepth ?? 0}`;
    }
    case "advisory_match": {
      const advisory = event.advisory as { severity?: string; sourceIds?: string[]; packageName?: string; packageVersion?: string } | undefined;
      return `> ADVISORY: ${(advisory?.severity ?? "unknown").toUpperCase()} ${(advisory?.sourceIds?.[0] ?? "unknown-id")} on ${advisory?.packageName ?? "package"}@${advisory?.packageVersion ?? "unknown"}`;
    }
    case "advisory_summary": {
      const summary = event.summary as { critical?: number; high?: number; moderate?: number; dangerousCount?: number } | undefined;
      return `> advisory summary: ${summary?.critical ?? 0} critical, ${summary?.high ?? 0} high, ${summary?.moderate ?? 0} moderate (${summary?.dangerousCount ?? 0} dangerous)`;
    }
    case "triage_complete":
      return `> risk score: ${String(event.riskScore ?? "?")}/10${event.riskSummary ? ` — ${String(event.riskSummary)}` : ""}`;
    case "finding_discovered": {
      const finding = event.finding as { confidence?: string; problem?: string } | undefined;
      const label = finding?.confidence === "CONFIRMED" ? "CONFIRMED" : finding?.confidence === "LIKELY" ? "LIKELY" : "SUSPICIOUS";
      return `> ${label}: ${finding?.problem ?? "suspicious behavior identified"}`;
    }
    case "cli_behavior_started": {
      const nodeVersions = (event.nodeVersions as string[] | undefined) ?? [];
      const commands = (event.commands as Array<{ name?: string }> | undefined) ?? [];
      return `> running sandbox CLI behavior checks for ${commands.length} command(s) on Node ${nodeVersions.join(", ")}`;
    }
    case "cli_command_result": {
      const result = event.result as {
        risk?: string;
        command?: string;
        nodeVersion?: string;
        observations?: Array<{ detail?: string }>;
      } | undefined;
      if (result?.risk === "low") {
        return null;
      }
      const detail = result?.observations?.[0]?.detail ?? `${result?.command ?? "command"} on Node ${result?.nodeVersion ?? "?"}`;
      const label = result?.risk === "high" ? "CONFIRMED" : result?.risk === "infra_error" ? "WARNING" : "SKIPPED";
      return `> ${label}: sandbox ${detail}`;
    }
    case "publish_complete":
      return "> verdict published to IPFS + ENS";
    case "publish_failed":
      return `> publish warning: ${String(event.error ?? "unknown publish failure")}`;
    default:
      return null;
  }
}

function phaseLine(phase: string): string | null {
  switch (phase) {
    case "resolve":
      return "> resolving package and source tarball...";
    case "inventory":
      return "> inspecting manifest, files, and scripts...";
    case "dependency-graph":
      return "> building recursive dependency graph...";
    case "advisory-scan":
      return "> checking active advisories and CVEs...";
    case "cli-behavior":
      return "> preparing isolated CLI behavior sandbox...";
    case "triage":
      return "> scoring suspicious paths...";
    case "investigate":
      return "> expanding risky call chains with LLM reasoning...";
    case "test-gen":
      return "> generating verification probes...";
    case "verify":
      return "> verifying suspicious behavior in sandbox...";
    default:
      return null;
  }
}

function summarizeReport(report: AuditReport): string {
  const confirmedProof = report.proofs.find((proof) => proof.confidence === "CONFIRMED");
  if (confirmedProof) {
    return confirmedProof.problem;
  }

  const confirmedFinding = report.findings.find((finding) => finding.confidence === "CONFIRMED" || finding.confidence === "LIKELY");
  if (confirmedFinding) {
    return confirmedFinding.problem;
  }

  if (report.advisories[0]) {
    return report.advisories[0].summary || report.advisories[0].title;
  }

  if (report.triage?.riskSummary) {
    return report.triage.riskSummary;
  }

  return report.verdict === "SAFE"
    ? "No dangerous proof was confirmed in the current scan."
    : "Risky behavior or matched advisories were identified in the current scan.";
}

function deriveTags(report: AuditReport): string[] {
  const raw = report.capabilities.length > 0
    ? report.capabilities
    : report.findings.map((finding) => finding.capability);

  return [...new Set(raw)]
    .filter(Boolean)
    .map((value) => value.toLowerCase().replace(/_/g, "-"));
}
