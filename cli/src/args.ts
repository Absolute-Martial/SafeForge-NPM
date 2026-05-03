import { parsePackageSpec, type PackageSpec } from "./package-spec.js";
import type { JsonScanResult, RegistryPrecheckResult, ScanRequest, NodeVersion, SecurityMode } from "./types.js";

export interface CommonFlags {
  apiUrl: string;
  json: boolean;
}

export interface ScanFlags extends CommonFlags {
  packageSpec: PackageSpec;
  rescan: boolean;
  publish: boolean;
  nodeVersions: NodeVersion[];
  scanDepth: number;
  securityMode: SecurityMode;
  llm: {
    providerName?: string;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
}

export interface DoctorFlags extends CommonFlags {}

export type ParsedCommand =
  | { command: "scan"; flags: ScanFlags }
  | { command: "doctor"; flags: DoctorFlags }
  | { command: "help" };

export function parseCliArgs(argv: string[], env = process.env): ParsedCommand {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { command: "help" };
  }

  if (command === "doctor") {
    const parsed = parseFlags(rest, env);
    return {
      command: "doctor",
      flags: {
        apiUrl: parsed.apiUrl,
        json: parsed.json,
      },
    };
  }

  if (command === "scan") {
    const packageArg = rest[0];
    if (!packageArg || packageArg.startsWith("--")) {
      throw new Error("Usage: safenpm scan <package[@version]>");
    }

    const packageSpec = parsePackageSpec(packageArg);
    const parsed = parseFlags(rest, env);
    return {
      command: "scan",
      flags: {
        apiUrl: parsed.apiUrl,
        json: parsed.json,
        packageSpec,
        rescan: parsed.rescan,
        publish: !parsed.noPublish,
        nodeVersions: parsed.nodeVersions,
        scanDepth: parsed.scanDepth,
        securityMode: parsed.securityMode,
        llm: {
          providerName: parsed.providerName,
          baseUrl: parsed.baseUrl,
          apiKey: parsed.apiKey,
          model: parsed.model,
        },
      },
    };
  }

  throw new Error(`Unknown command: ${command}`);
}

function parseFlags(args: string[], env: NodeJS.ProcessEnv) {
  const nodeVersions: NodeVersion[] = [];
  let apiUrl = env.SAFEFORGE_NPM_API_URL ?? "http://127.0.0.1:8000";
  let json = false;
  let rescan = false;
  let noPublish = false;
  let scanDepth = Number(env.SAFEFORGE_NPM_SCAN_DEPTH ?? 3);
  let securityMode = (env.SAFEFORGE_NPM_SECURITY_MODE as SecurityMode | undefined) ?? "balanced";
  let providerName = env.SAFEFORGE_NPM_SCAN_PROVIDER;
  let baseUrl = env.SAFEFORGE_NPM_SCAN_BASE_URL;
  let apiKey = env.SAFEFORGE_NPM_SCAN_API_KEY;
  let model = env.SAFEFORGE_NPM_SCAN_MODEL;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith("--")) {
      continue;
    }

    const [flag, inlineValue] = arg.split("=", 2);
    const nextValue = inlineValue ?? args[index + 1];
    const consumeValue = () => {
      if (!nextValue || nextValue.startsWith("--")) {
        throw new Error(`Missing value for ${flag}`);
      }
      if (!inlineValue) {
        index += 1;
      }
      return nextValue;
    };

    switch (flag) {
      case "--api-url":
        apiUrl = consumeValue();
        break;
      case "--json":
        json = true;
        break;
      case "--rescan":
        rescan = true;
        break;
      case "--no-publish":
        noPublish = true;
        break;
      case "--depth":
      case "--scan-depth":
        scanDepth = Number(consumeValue());
        if (!Number.isInteger(scanDepth) || scanDepth < 0 || scanDepth > 5) {
          throw new Error("Scan depth must be an integer between 0 and 5");
        }
        break;
      case "--mode":
      case "--security-mode": {
        const value = consumeValue();
        if (value !== "strict" && value !== "balanced" && value !== "research") {
          throw new Error(`Unsupported security mode: ${value}`);
        }
        securityMode = value;
        break;
      }
      case "--provider":
        providerName = consumeValue();
        break;
      case "--base-url":
        baseUrl = consumeValue();
        break;
      case "--api-key":
        apiKey = consumeValue();
        break;
      case "--model":
        model = consumeValue();
        break;
      case "--node":
      case "--node-version": {
        const value = consumeValue();
        for (const chunk of value.split(",")) {
          if (chunk === "22" || chunk === "24") {
            nodeVersions.push(chunk);
          } else {
            throw new Error(`Unsupported node version: ${chunk}`);
          }
        }
        break;
      }
      default:
        throw new Error(`Unknown flag: ${flag}`);
    }
  }

  return {
    apiUrl,
    json,
    rescan,
    noPublish,
    providerName,
    baseUrl,
    apiKey,
    model,
    scanDepth,
    securityMode,
    nodeVersions: dedupeNodeVersions(nodeVersions.length > 0 ? nodeVersions : ["22", "24"]),
  };
}

function dedupeNodeVersions(values: NodeVersion[]): NodeVersion[] {
  return [...new Set(values)];
}

export function buildScanRequest(flags: ScanFlags): ScanRequest {
  const llm = Object.fromEntries(
    Object.entries(flags.llm).filter(([, value]) => value && value.trim() !== ""),
  );

  return {
    packageName: flags.packageSpec.name,
    version: flags.packageSpec.version,
    publish: flags.publish,
    scanDepth: flags.scanDepth,
    securityMode: flags.securityMode,
    llm: Object.keys(llm).length > 0 ? llm : undefined,
    sandbox: {
      nodeVersions: flags.nodeVersions,
      cliBehaviorEnabled: true,
      aiScenariosEnabled: false,
    },
  };
}

export function sanitizeScanRequestForDisplay(request: ScanRequest) {
  return request.llm
    ? {
        ...request,
        llm: {
          providerName: request.llm.providerName,
          baseUrl: request.llm.baseUrl,
          model: request.llm.model,
        },
      }
    : request;
}

export function shouldReuseRegistryVerdict(precheck: RegistryPrecheckResult | null, rescan: boolean): boolean {
  return Boolean(precheck?.found && precheck.versionMatched && !rescan);
}

export function buildJsonScanResult(input: {
  packageName: string;
  version: string | null;
  registryPrecheck: RegistryPrecheckResult | null;
  reusedRegistryVerdict: boolean;
  report: {
    verdict: string;
    finalScore?: number | null;
    triage: { riskScore: number } | null;
    advisories: JsonScanResult["advisories"];
    findings: JsonScanResult["findings"];
    capabilities: string[];
    reasoningStageSummaries?: JsonScanResult["reasoningStageSummaries"];
    familyAnalyses?: JsonScanResult["familyAnalyses"];
    evidenceGraph?: JsonScanResult["evidenceGraph"];
  };
  publishResult: JsonScanResult["publishResult"];
}): JsonScanResult {
  return {
    packageName: input.packageName,
    version: input.version,
    registryPrecheck: input.registryPrecheck,
    reusedRegistryVerdict: input.reusedRegistryVerdict,
    verdict: input.report.verdict,
    score: input.report.finalScore ?? input.report.triage?.riskScore ?? null,
    advisories: input.report.advisories,
    findings: input.report.findings,
    capabilities: input.report.capabilities,
    reasoningStageSummaries: input.report.reasoningStageSummaries,
    familyAnalyses: input.report.familyAnalyses,
    evidenceGraph: input.report.evidenceGraph,
    publishResult: input.publishResult,
  };
}
