#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  buildJsonScanResult,
  buildScanRequest,
  parseCliArgs,
  sanitizeScanRequestForDisplay,
  shouldReuseRegistryVerdict,
} from "./args.js";
import {
  fetchAuditReport,
  fetchCliStatus,
  fetchPublishedReport,
  fetchRegistryPrecheck,
  startStreamingAudit,
  streamAuditEvents,
} from "./client.js";
import { getDefaultPackageManagerAdapter } from "./package-manager.js";
import { TerminalRenderer } from "./render.js";
import type { AuditReport, PublishEventState, Verdict } from "./types.js";

const renderer = new TerminalRenderer();

void main();

async function main() {
  try {
    const parsed = parseCliArgs(process.argv.slice(2));

    if (parsed.command === "help") {
      printHelp();
      process.exitCode = 0;
      return;
    }

    if (parsed.command === "doctor") {
      const exitCode = await runDoctor(parsed.flags.apiUrl, parsed.flags.json);
      process.exitCode = exitCode;
      return;
    }

    const exitCode = await runScan(parsed.flags);
    process.exitCode = exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function runScan(flags: ReturnType<typeof parseCliArgs> extends infer T
  ? T extends { command: "scan"; flags: infer F } ? F : never
  : never): Promise<number> {
  const status = await fetchCliStatus(flags.apiUrl).catch((error) => {
    throw new Error(`SafeForge engine is not reachable at ${flags.apiUrl}. Run 'safenpm doctor' for help.\n${error instanceof Error ? error.message : String(error)}`);
  });

  let registryPrecheck = null;
  if (flags.packageSpec.version && status.registryReadConfigured) {
    if (!flags.json) renderer.renderRegistryCheckStart();
    registryPrecheck = await fetchRegistryPrecheck(flags.apiUrl, flags.packageSpec.name, flags.packageSpec.version);
    if (!flags.json) {
      if (registryPrecheck.found && !flags.rescan) {
        renderer.renderRegistryReuse(registryPrecheck);
      } else if (registryPrecheck.found && flags.rescan) {
        renderer.renderRegistrySkip("existing audit found, but --rescan requested. running a fresh audit.");
      } else {
        renderer.renderRegistryMiss();
      }
    }
  } else if (!flags.json) {
    const reason = !flags.packageSpec.version
      ? "no exact version provided, skipping registry precheck."
      : "registry precheck unavailable in current engine config.";
    renderer.renderRegistrySkip(reason);
  }

  if (shouldReuseRegistryVerdict(registryPrecheck, flags.rescan)) {
    const publishedReport = registryPrecheck?.reportUri ? await fetchPublishedReport(registryPrecheck.reportUri) : null;
    const report = publishedReport ?? fallbackReportFromRegistry(flags.packageSpec.name, flags.packageSpec.version ?? null, registryPrecheck!);
    const publishResult: PublishEventState = { status: "skipped" };

    if (flags.json) {
      const jsonResult = buildJsonScanResult({
        packageName: flags.packageSpec.name,
        version: flags.packageSpec.version ?? null,
        registryPrecheck,
        reusedRegistryVerdict: true,
        report,
        publishResult,
      });
      process.stdout.write(`${JSON.stringify(jsonResult, null, 2)}\n`);
    } else {
      renderer.renderFinal(report, publishResult, {
        registryPrecheck,
        reusedRegistryVerdict: true,
      });
    }

    return exitCodeForVerdict(report.verdict);
  }

  const request = buildScanRequest(flags);
  const publishState: PublishEventState = {
    status: request.publish ? "skipped" : "skipped",
  };
  void sanitizeScanRequestForDisplay(request);

  const { auditId } = await startStreamingAudit(flags.apiUrl, request);
  await streamAuditEvents(flags.apiUrl, auditId, async (event) => {
    if (event.type === "publish_complete") {
      publishState.status = "published";
      publishState.reportCid = asOptionalString(event.reportCid) ?? undefined;
      publishState.sourceCid = asOptionalString(event.sourceCid) ?? undefined;
      publishState.ensName = asOptionalString(event.ensName);
    } else if (event.type === "publish_failed") {
      publishState.status = "failed";
      publishState.error = asOptionalString(event.error) ?? "unknown publish failure";
    } else if (event.type === "audit_complete" && request.publish && publishState.status === "skipped") {
      publishState.status = "skipped";
    } else if (event.type === "audit_error") {
      throw new Error(asOptionalString(event.error) ?? "Audit failed");
    }

    if (!flags.json) {
      renderer.renderEvent(event);
    }
  });

  const report = await fetchAuditReport(flags.apiUrl, auditId);
  if (flags.json) {
    const jsonResult = buildJsonScanResult({
      packageName: flags.packageSpec.name,
      version: flags.packageSpec.version ?? null,
      registryPrecheck,
      reusedRegistryVerdict: false,
      report,
      publishResult: publishState,
    });
    process.stdout.write(`${JSON.stringify(jsonResult, null, 2)}\n`);
  } else {
    renderer.renderFinal(report, publishState, {
      registryPrecheck,
      reusedRegistryVerdict: false,
    });
  }

  return exitCodeForVerdict(report.verdict);
}

async function runDoctor(apiUrl: string, json: boolean): Promise<number> {
  const localDocker = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
    encoding: "utf-8",
    timeout: 5_000,
  });

  try {
    const status = await fetchCliStatus(apiUrl);
    const payload = {
      apiUrl,
      engineReachable: status.engineReachable,
      engineDockerAvailable: status.dockerAvailable,
      engineDockerVersion: status.dockerVersion,
      localDockerAvailable: localDocker.status === 0,
      localDockerVersion: localDocker.status === 0 ? localDocker.stdout.trim() || null : null,
      publishConfigured: status.publishConfigured,
      registryReadConfigured: status.registryReadConfigured,
      registryWriteConfigured: status.registryWriteConfigured,
      llmConfigured: status.llmConfigured,
      llmBackend: status.llmBackend,
      llmBaseUrlConfigured: status.llmBaseUrlConfigured,
      runtimeRoot: status.runtimeRoot,
      packageManager: getDefaultPackageManagerAdapter().name,
    };

    if (json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      renderer.line("SafeForge doctor");
      renderer.line(`> engine reachable: ${payload.engineReachable ? "yes" : "no"} (${apiUrl})`);
      renderer.line(`> engine docker available: ${payload.engineDockerAvailable ? `yes (${payload.engineDockerVersion ?? "unknown"})` : "no"}`);
      renderer.line(`> local docker available: ${payload.localDockerAvailable ? `yes (${payload.localDockerVersion ?? "unknown"})` : "no"}`);
      renderer.line(`> publish configured: ${payload.publishConfigured ? "yes" : "no"}`);
      renderer.line(`> registry read configured: ${payload.registryReadConfigured ? "yes" : "no"}`);
      renderer.line(`> registry write configured: ${payload.registryWriteConfigured ? "yes" : "no"}`);
      renderer.line(`> llm configured: ${payload.llmConfigured ? `yes (${payload.llmBackend})` : "no"}`);
      renderer.line(`> runtime root: ${payload.runtimeRoot}`);
    }

    return payload.engineReachable ? 0 : 1;
  } catch (error) {
    const payload = {
      apiUrl,
      engineReachable: false,
      error: error instanceof Error ? error.message : String(error),
      localDockerAvailable: localDocker.status === 0,
      localDockerVersion: localDocker.status === 0 ? localDocker.stdout.trim() || null : null,
    };

    if (json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      renderer.line("SafeForge doctor");
      renderer.line(`> engine reachable: no (${apiUrl})`);
      renderer.line(`> error: ${payload.error}`);
      renderer.line(`> local docker available: ${payload.localDockerAvailable ? `yes (${payload.localDockerVersion ?? "unknown"})` : "no"}`);
    }

    return 1;
  }
}

function fallbackReportFromRegistry(packageName: string, version: string | null, precheck: NonNullable<Awaited<ReturnType<typeof fetchRegistryPrecheck>>>): AuditReport {
  return {
    verdict: normalizeVerdict(precheck.verdict),
    finalScore: precheck.score ?? 0,
    recommendedAction:
      normalizeVerdict(precheck.verdict) === "SAFE"
        ? "Proceed with installation using standard caution."
        : "Review the published audit before installing this package.",
    capabilities: precheck.capabilities,
    advisories: [],
    findings: [],
    proofs: [
      {
        capability: null,
        confidence: "CONFIRMED",
        confidenceScore: 10,
        problem: `Reused published SafeForge audit for ${packageName}${version ? `@${version}` : ""}`,
        evidence: precheck.reportUri ?? precheck.ensName ?? "Registry precheck matched a published audit",
        fileLine: precheck.ensName ?? packageName,
      },
    ],
    triage: {
      riskScore: precheck.score ?? 0,
      riskSummary: `Published audit verdict reused from ${precheck.ensName ?? "registry"}`,
    },
  };
}

function normalizeVerdict(value: string | null | undefined): Verdict {
  const upper = value?.toUpperCase();
  if (upper === "SAFE") return "SAFE";
  if (upper === "REVIEW REQUIRED") return "REVIEW REQUIRED";
  if (upper === "HIGH RISK") return "HIGH RISK";
  if (upper === "BLOCK") return "BLOCK";
  return "SAFE";
}

function exitCodeForVerdict(verdict: Verdict): number {
  return verdict === "HIGH RISK" || verdict === "BLOCK" ? 2 : verdict === "REVIEW REQUIRED" ? 1 : 0;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function printHelp() {
  process.stdout.write(
    [
      "SafeForge NPM CLI",
      "",
      "Usage:",
      "  safenpm scan <package[@version]> [--api-url URL] [--rescan] [--json] [--no-publish]",
      "  safenpm doctor [--api-url URL] [--json]",
      "",
      "Scan flags:",
      "  --node, --node-version <22|24>",
      "  --depth, --scan-depth <0-5>",
      "  --mode, --security-mode <strict|balanced|research>",
      "  --provider <name>",
      "  --base-url <url>",
      "  --model <model>",
      "  --api-key <key>",
      "",
      "Environment:",
      "  SAFEFORGE_NPM_API_URL",
      "  SAFEFORGE_NPM_SCAN_PROVIDER",
      "  SAFEFORGE_NPM_SCAN_BASE_URL",
      "  SAFEFORGE_NPM_SCAN_MODEL",
      "  SAFEFORGE_NPM_SCAN_API_KEY",
      "",
    ].join("\n"),
  );
}
