import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  CapabilityEnum,
  CliBehaviorReport,
  CliCommandDescriptor,
  CliCommandResult,
  InstrumentationLog,
  type AuditReport,
  type CliBehaviorObservation,
  type Finding,
  type Proof,
} from "../models.js";
import type { EmitFn } from "../events.js";
import type { AuditSandboxOptions } from "../audit-options.js";
import { dockerExec } from "../sandbox/docker.js";
import { INSTRUMENTATION_JS } from "../sandbox/instrumentation.js";
import { getDefaultCliSandboxRunner } from "../sandbox/cli-runner.js";
import { createRuntimeTempDir, toDockerMountSource } from "../runtime-root.js";

const TRACE_START = "__SAFEFORGE_NPM_TRACE__";
const TRACE_END = "__SAFEFORGE_NPM_TRACE_END__";
const SENSITIVE_ENV_RE = /(TOKEN|SECRET|PASSWORD|API_KEY|AUTH|NPM_|GITHUB_|OPENAI_)/i;
const TRUNCATED_OUTPUT_RE = /\[truncated at \d+ bytes\]/i;
const WRITE_METHOD_RE = /write|append|mkdir|rm|unlink|rename|createWriteStream/i;
const ALLOWED_WRITE_PREFIXES = [
  "/workspace/project",
  "/workspace/.npm-cache",
  "/workspace/tmp",
  "/tmp",
];
const CLI_SCENARIOS = [
  { name: "help", args: ["--help"] },
  { name: "version", args: ["--version"] },
  { name: "no-args", args: [] },
] as const;

export interface CliBehaviorPhaseResult {
  report: AuditReport["cliBehavior"];
  findings: Finding[];
  proofs: Proof[];
  capabilities: CapabilityEnum[];
}

interface ParsedTraceOutput {
  cleanedStdout: string;
  cleanedStderr: string;
  trace: InstrumentationLog;
}

function shellEscape(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

function emptyTrace(): InstrumentationLog {
  return {
    modulesLoaded: [],
    networkCalls: [],
    fsOperations: [],
    envAccess: [],
    processSpawns: [],
    evalCalls: [],
    cryptoOps: [],
    timers: [],
  };
}

export function extractCliCommands(
  packageJson: Record<string, unknown>,
  fallbackPackageName?: string,
): Array<{ name: string; entry: string }> {
  const bin = packageJson.bin;
  const packageName = typeof packageJson.name === "string" ? packageJson.name : fallbackPackageName;
  if (!bin) return [];

  if (typeof bin === "string") {
    if (!packageName) return [];
    return [{ name: packageName, entry: bin }];
  }

  if (typeof bin === "object" && !Array.isArray(bin)) {
    return Object.entries(bin)
      .filter((entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string")
      .map(([name, entry]) => ({ name, entry }));
  }

  return [];
}

export function deriveCliObservations(result: {
  trace: InstrumentationLog;
  stdoutPreview: string;
  stderrPreview: string;
  timedOut: boolean;
  installError?: string | null;
}): CliBehaviorObservation[] {
  const observations: CliBehaviorObservation[] = [];
  const { trace } = result;

  if (result.installError) {
    observations.push({ kind: "install_error", detail: result.installError });
  }

  if (trace.networkCalls.length > 0) {
    const first = trace.networkCalls[0]!;
    observations.push({
      kind: "network",
      detail: `${first.method} ${first.url}`,
    });
  }

  const sensitiveEnvReads = [...new Set(trace.envAccess.filter((key) => SENSITIVE_ENV_RE.test(key)))];
  if (sensitiveEnvReads.length > 0) {
    observations.push({
      kind: "env",
      detail: `Sensitive env access: ${sensitiveEnvReads.join(", ")}`,
    });
  }

  if (trace.processSpawns.length > 0) {
    const first = trace.processSpawns[0]!;
    observations.push({
      kind: "process",
      detail: `${first.cmd}${first.args.length > 0 ? ` ${first.args.join(" ")}` : ""}`,
    });
  }

  const suspiciousWrites = trace.fsOperations.filter(
    (op) =>
      WRITE_METHOD_RE.test(op.op) &&
      !ALLOWED_WRITE_PREFIXES.some((prefix) => op.path.startsWith(prefix)),
  );
  if (suspiciousWrites.length > 0) {
    observations.push({
      kind: "filesystem",
      detail: `Write outside workspace: ${suspiciousWrites[0]!.path}`,
    });
  }

  if (trace.evalCalls.length > 0) {
    observations.push({
      kind: "eval",
      detail: `Dynamic code execution: ${trace.evalCalls[0]!.code.slice(0, 120)}`,
    });
  }

  if (result.timedOut) {
    observations.push({
      kind: "timeout",
      detail: "Command execution timed out",
    });
  }

  if (TRUNCATED_OUTPUT_RE.test(result.stdoutPreview) || TRUNCATED_OUTPUT_RE.test(result.stderrPreview)) {
    observations.push({
      kind: "large_output",
      detail: "Command produced unusually large output",
    });
  }

  return observations;
}

function resultRisk(observations: CliBehaviorObservation[]): CliCommandResult["risk"] {
  const highRiskKinds = new Set(["network", "env", "process", "filesystem", "timeout"]);
  return observations.some((obs) => highRiskKinds.has(obs.kind)) ? "high" : "low";
}

function parseTraceFromOutput(stdout: string, stderr: string): ParsedTraceOutput {
  const combined = `${stdout}\n${stderr}`;
  const startIndex = combined.lastIndexOf(TRACE_START);
  const endIndex = combined.lastIndexOf(TRACE_END);
  let trace = emptyTrace();

  if (startIndex !== -1 && endIndex > startIndex) {
    const json = combined.slice(startIndex + TRACE_START.length, endIndex).trim();
    try {
      trace = InstrumentationLog.parse(JSON.parse(json));
    } catch {
      trace = emptyTrace();
    }
  }

  return {
    cleanedStdout: stdout.replace(new RegExp(`${TRACE_START}[\\s\\S]*${TRACE_END}`, "g"), "").trim(),
    cleanedStderr: stderr.replace(new RegExp(`${TRACE_START}[\\s\\S]*${TRACE_END}`, "g"), "").trim(),
    trace,
  };
}

function buildCliFinding(
  command: CliCommandResult,
  observation: CliBehaviorObservation,
): { capability: CapabilityEnum; finding: Finding; proof: Proof } | null {
  let capability: CapabilityEnum | null = null;
  let problem = "";

  switch (observation.kind) {
    case "network":
      capability = observation.detail.includes("dns://") ? "DNS_EXFIL" : "NETWORK";
      problem = `CLI command attempted outbound network access during ${command.scenario}`;
      break;
    case "env":
      capability = "ENV_VARS";
      problem = `CLI command accessed sensitive environment variables during ${command.scenario}`;
      break;
    case "process":
      capability = "PROCESS_SPAWN";
      problem = `CLI command spawned a child process during ${command.scenario}`;
      break;
    case "filesystem":
      capability = "FILESYSTEM";
      problem = `CLI command wrote outside the allowed workspace during ${command.scenario}`;
      break;
    case "eval":
      capability = "EVAL";
      problem = `CLI command executed dynamic code during ${command.scenario}`;
      break;
    case "timeout":
      capability = "DOS_LOOP";
      problem = `CLI command timed out during ${command.scenario}`;
      break;
    default:
      return null;
  }

  const fileLine = `package.json:${command.command} (${command.nodeVersion} ${command.scenario})`;
  const reproductionCmd = `${command.command}${command.args.length > 0 ? ` ${command.args.join(" ")}` : ""}`;
  const finding: Finding = {
    capability,
    confidence: "CONFIRMED",
    confidenceScore: 10,
    fileLine,
    problem,
    evidence: observation.detail,
    reproductionStrategy: `Run ${reproductionCmd} in a Node ${command.nodeVersion} sandbox with instrumentation enabled and inspect the emitted runtime trace.`,
    entrypointId: `cli:${command.command}`,
    sinkKind:
      observation.kind === "network" ? (capability === "DNS_EXFIL" ? "dns" : "network") :
      observation.kind === "env" ? "env_access" :
      observation.kind === "process" ? "child_process" :
      observation.kind === "filesystem" ? "filesystem" :
      observation.kind === "eval" ? "eval" :
      "unknown",
    proofType: "observed",
    evidenceNodeIds: [],
  };

  const proof: Proof = {
    capability,
    attackPathway: "CLI_RUNTIME",
    confidence: "CONFIRMED",
    confidenceScore: 10,
    fileLine,
    problem,
    evidence: observation.detail,
    entrypointId: `cli:${command.command}`,
    sinkKind:
      observation.kind === "network" ? (capability === "DNS_EXFIL" ? "dns" : "network") :
      observation.kind === "env" ? "env_access" :
      observation.kind === "process" ? "child_process" :
      observation.kind === "filesystem" ? "filesystem" :
      observation.kind === "eval" ? "eval" :
      "unknown",
    proofType: "observed",
    evidenceNodeIds: [],
    kind: "AI_DYNAMIC",
    contentHash: null,
    reproducible: true,
    reproductionCmd,
    testFile: null,
    testHash: null,
    testCode: null,
    verifyError: null,
    reasoningHash: null,
    teeAttestationId: null,
  };

  return { capability, finding, proof };
}

function emitCliResult(
  emit: EmitFn | undefined,
  result: CliCommandResult,
): void {
  emit?.("cli_command_result", { result });
}

function writeInstrumentationFile(workDir: string): void {
  writeFileSync(join(workDir, "safeforge-instrumentation.js"), INSTRUMENTATION_JS, "utf-8");
}

function createPackageTarball(packagePath: string, workDir: string): string {
  const output = execFileSync("npm", ["pack", packagePath, "--ignore-scripts", "--pack-destination", workDir], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tarballName = output.trim().split("\n").filter(Boolean).at(-1);
  if (!tarballName) {
    throw new Error(`Failed to create tarball for ${packagePath}`);
  }
  return join(workDir, tarballName);
}

async function startCliContainer(packagePath: string, workDir: string, nodeVersion: string): Promise<string> {
  const containerName = `safeforge-cli-${nodeVersion}-${Date.now().toString(36)}`;
  const result = await dockerExec([
    "run", "-d",
    "--name", containerName,
    "--network=bridge",
    "--cap-drop=ALL",
    "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
    `--memory=512m`,
    "--cpus=1",
    "--user", "1000:1000",
    "--pids-limit", "128",
    "-v", `${toDockerMountSource(packagePath)}:/pkg:ro`,
    "-v", `${toDockerMountSource(workDir)}:/workspace`,
    "-w", "/workspace",
    `node:${nodeVersion}-slim`,
    "sleep", "infinity",
  ], 30_000);

  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `Failed to start Node ${nodeVersion} container`);
  }

  return containerName;
}

async function stopCliContainer(containerName: string): Promise<void> {
  await dockerExec(["rm", "-f", containerName], 10_000).catch(() => {});
}

async function prepareCliProject(containerName: string): Promise<string | null> {
  const install = await dockerExec([
    "exec",
    "-w", "/workspace/project",
    containerName,
    "sh", "-lc",
    "npm init -y >/dev/null 2>&1 && npm install --cache /workspace/.npm-cache /workspace/package.tgz",
  ], 120_000);

  if (install.exitCode !== 0) {
    return (install.stderr || install.stdout || "package install failed").slice(0, 600);
  }

  await dockerExec(["network", "disconnect", "bridge", containerName], 10_000).catch(() => {});
  return null;
}

async function runCliCommand(
  containerName: string,
  command: CliCommandDescriptor,
  nodeVersion: string,
  scenario: (typeof CLI_SCENARIOS)[number],
): Promise<CliCommandResult> {
  const commandLine = [shellEscape(`./node_modules/.bin/${command.name}`), ...scenario.args.map(shellEscape)].join(" ");
  const started = Date.now();
  const exec = await dockerExec([
    "exec",
    "-e", "NODE_OPTIONS=--require /workspace/safeforge-instrumentation.js",
    "-e", "NPM_TOKEN=safeforge_test_npm_token",
    "-e", "OPENAI_API_KEY=safeforge_test_openai_key",
    "-e", "SAFEFORGE_SECRET=safeforge_test_secret",
    "-e", "GITHUB_TOKEN=safeforge_test_github_token",
    "-w", "/workspace/project",
    containerName,
    "sh", "-lc",
    commandLine,
  ], 15_000);
  const durationMs = Date.now() - started;
  const parsed = parseTraceFromOutput(exec.stdout, exec.stderr);
  const stdoutPreview = parsed.cleanedStdout.slice(0, 500);
  const stderrPreview = parsed.cleanedStderr.slice(0, 500);
  const observations = deriveCliObservations({
    trace: parsed.trace,
    stdoutPreview,
    stderrPreview,
    timedOut: exec.timedOut,
  });

  return CliCommandResult.parse({
    command: command.name,
    entry: command.entry,
    nodeVersion,
    scenario: scenario.name,
    args: scenario.args,
    exitCode: exec.exitCode,
    durationMs,
    stdoutPreview,
    stderrPreview,
    timedOut: exec.timedOut,
    risk: resultRisk(observations),
    observations,
    trace: parsed.trace,
  });
}

export async function runCliBehavior(
  packagePath: string,
  sandboxOptions: AuditSandboxOptions,
  emit?: EmitFn,
): Promise<CliBehaviorPhaseResult> {
  if (!sandboxOptions.cliBehaviorEnabled) {
    return {
      report: CliBehaviorReport.parse({
        enabled: false,
        nodeVersions: sandboxOptions.nodeVersions,
        commandsDiscovered: [],
        results: [],
        highRiskCount: 0,
      }),
      findings: [],
      proofs: [],
      capabilities: [],
    };
  }

  const runner = await getDefaultCliSandboxRunner();
  const commands = await runner.discoverCommands(packagePath, basename(packagePath));

  emit?.("cli_behavior_started", {
    commands,
    nodeVersions: sandboxOptions.nodeVersions,
  });

  if (commands.length === 0) {
    return {
      report: CliBehaviorReport.parse({
        enabled: true,
        nodeVersions: sandboxOptions.nodeVersions,
        commandsDiscovered: [],
        results: [],
        highRiskCount: 0,
      }),
      findings: [],
      proofs: [],
      capabilities: [],
    };
  }

  const dockerCheck = await dockerExec(["info"], 5_000);
  if (dockerCheck.exitCode !== 0) {
    return {
      report: CliBehaviorReport.parse({
        enabled: true,
        nodeVersions: sandboxOptions.nodeVersions,
        commandsDiscovered: commands,
        results: [],
        highRiskCount: 0,
        skippedReason: "Docker unavailable for CLI behavior sandbox",
      }),
      findings: [],
      proofs: [],
      capabilities: [],
    };
  }

  const allResults: CliCommandResult[] = [];

  for (const nodeVersion of sandboxOptions.nodeVersions) {
    const workDir = createRuntimeTempDir(`safeforge-npm-cli-${nodeVersion}-`);
    mkdirSync(join(workDir, "project"), { recursive: true });
    mkdirSync(join(workDir, ".npm-cache"), { recursive: true });

    let containerName: string | null = null;
    try {
      writeInstrumentationFile(workDir);
      createPackageTarball(packagePath, workDir);
      containerName = await startCliContainer(packagePath, workDir, nodeVersion);
      const installError = await prepareCliProject(containerName);

      if (installError) {
        for (const command of commands) {
          const result = CliCommandResult.parse({
            command: command.name,
            entry: command.entry,
            nodeVersion,
            scenario: "install",
            args: [],
            exitCode: null,
            durationMs: 0,
            stdoutPreview: "",
            stderrPreview: installError,
            timedOut: false,
            risk: "infra_error",
            observations: deriveCliObservations({
              trace: emptyTrace(),
              stdoutPreview: "",
              stderrPreview: installError,
              timedOut: false,
              installError,
            }),
          });
          allResults.push(result);
          emitCliResult(emit, result);
        }
        continue;
      }

      for (const command of commands) {
        for (const scenario of CLI_SCENARIOS) {
          const result = await runCliCommand(containerName, command, nodeVersion, scenario);
          allResults.push(result);
          emitCliResult(emit, result);
        }
      }
    } finally {
      if (containerName) {
        await stopCliContainer(containerName);
      }
      rmSync(workDir, { recursive: true, force: true });
    }
  }

  const findings: Finding[] = [];
  const proofs: Proof[] = [];
  const capabilities = new Set<CapabilityEnum>();

  for (const result of allResults) {
    if (result.risk !== "high") continue;
    for (const observation of result.observations) {
      const artifact = buildCliFinding(result, observation);
      if (!artifact) continue;
      capabilities.add(artifact.capability);
      findings.push(artifact.finding);
      proofs.push(artifact.proof);
    }
  }

  return {
    report: CliBehaviorReport.parse({
      enabled: true,
      nodeVersions: sandboxOptions.nodeVersions,
      commandsDiscovered: commands,
      results: allResults,
      highRiskCount: allResults.filter((result) => result.risk === "high").length,
    }),
    findings,
    proofs,
    capabilities: [...capabilities],
  };
}
