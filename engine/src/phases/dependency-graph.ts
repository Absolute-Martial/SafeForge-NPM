import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  DependencyGraphNode,
  DependencyGraphReport,
  type DependencyType,
  type ScanWarning,
} from "../models.js";
import { createRuntimeTempDir } from "../runtime-root.js";

interface LockPackageEntry {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface LockfileV3 {
  name?: string;
  version?: string;
  packages?: Record<string, LockPackageEntry>;
}

export interface DependencyGraphPhaseResult {
  report: DependencyGraphReport;
  warnings: ScanWarning[];
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}

function createPackageTarball(packagePath: string, workDir: string): string {
  const output = execFileSync("npm", ["pack", packagePath, "--pack-destination", workDir], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tarballName = output.trim().split("\n").filter(Boolean).at(-1);
  if (!tarballName) {
    throw new Error(`Failed to create tarball for ${packagePath}`);
  }
  return path.join(workDir, tarballName);
}

function countDepth(lockPath: string): number {
  return Math.max(
    0,
    lockPath.split("/").filter((segment) => segment === "node_modules").length - 1,
  );
}

function leafPackageName(lockPath: string): string | null {
  const segments = lockPath.split("/");
  const idx = segments.lastIndexOf("node_modules");
  if (idx === -1) return null;
  const first = segments[idx + 1];
  if (!first) return null;
  if (first.startsWith("@")) {
    const second = segments[idx + 2];
    return second ? `${first}/${second}` : first;
  }
  return first;
}

function collectDependencyNames(entry: LockPackageEntry): string[] {
  const names = new Set<string>();
  for (const record of [
    entry.dependencies,
    entry.optionalDependencies,
    entry.peerDependencies,
    entry.devDependencies,
  ]) {
    for (const name of Object.keys(record ?? {})) {
      names.add(name);
    }
  }
  return [...names];
}

function fallbackReport(packageJson: Record<string, unknown>): DependencyGraphReport {
  const packageName = typeof packageJson.name === "string" ? packageJson.name : "unknown";
  const packageVersion = typeof packageJson.version === "string" ? packageJson.version : null;
  const rootId = `${packageName}@${packageVersion ?? "unknown"}::root`;

  return DependencyGraphReport.parse({
    packageName,
    packageVersion,
    nodeCount: 1,
    directCount: 0,
    maxDepth: 0,
    nodes: [
      DependencyGraphNode.parse({
        id: rootId,
        name: packageName,
        version: packageVersion ?? "unknown",
        depth: 0,
        dependencyType: "root",
        path: "root",
        parents: [],
        direct: false,
      }),
    ],
  });
}

function resolveDependencyType(
  packageName: string,
  rootPackageName: string,
  rootDeps: {
    prod: Set<string>;
    optional: Set<string>;
    peer: Set<string>;
    dev: Set<string>;
  },
): DependencyType {
  if (packageName === rootPackageName) return "root";
  if (rootDeps.optional.has(packageName)) return "optional";
  if (rootDeps.peer.has(packageName)) return "peer";
  if (rootDeps.dev.has(packageName)) return "dev";
  if (rootDeps.prod.has(packageName)) return "prod";
  return "transitive";
}

function resolveChildPath(
  parentPath: string,
  dependencyName: string,
  packagePaths: Set<string>,
): string | null {
  let current = parentPath;
  while (true) {
    const candidate = current
      ? `${current}/node_modules/${dependencyName}`
      : `node_modules/${dependencyName}`;
    if (packagePaths.has(candidate)) {
      return candidate;
    }

    if (!current) break;
    const idx = current.lastIndexOf("/node_modules/");
    current = idx === -1 ? "" : current.slice(0, idx);
  }
  return null;
}

export function parseDependencyGraphFromLockfile(
  lockfile: LockfileV3,
  packageJson: Record<string, unknown>,
): DependencyGraphReport | null {
  const packageName = typeof packageJson.name === "string" ? packageJson.name : "unknown";
  const packageVersion = typeof packageJson.version === "string" ? packageJson.version : null;
  const rootDeps = {
    prod: new Set(Object.keys((packageJson.dependencies as Record<string, unknown>) ?? {})),
    optional: new Set(Object.keys((packageJson.optionalDependencies as Record<string, unknown>) ?? {})),
    peer: new Set(Object.keys((packageJson.peerDependencies as Record<string, unknown>) ?? {})),
    dev: new Set(Object.keys((packageJson.devDependencies as Record<string, unknown>) ?? {})),
  };
  const packages = lockfile.packages ?? {};
  const packagePaths = Object.keys(packages).filter((lockEntryPath) => lockEntryPath);
  const pathSet = new Set(packagePaths);
  const rootPackagePath =
    packagePaths
      .filter((candidate) => leafPackageName(candidate) === packageName)
      .sort((a, b) => a.length - b.length)[0] ?? `node_modules/${packageName}`;

  const nodeByPath = new Map<string, ReturnType<typeof DependencyGraphNode.parse>>();
  for (const lockEntryPath of packagePaths) {
    const entry = packages[lockEntryPath];
    if (!entry?.version) continue;
    const entryName = entry.name ?? leafPackageName(lockEntryPath);
    if (!entryName) continue;

    const dependencyType = resolveDependencyType(entryName, packageName, rootDeps);
    const node = DependencyGraphNode.parse({
      id: `${entryName}@${entry.version}::${lockEntryPath}`,
      name: entryName,
      version: entry.version,
      depth: entryName === packageName ? 0 : countDepth(lockEntryPath),
      dependencyType,
      path: lockEntryPath,
      parents: [],
      direct: false,
    });
    nodeByPath.set(lockEntryPath, node);
  }

  const rootNode = nodeByPath.get(rootPackagePath);
  if (!rootNode) {
    return null;
  }

  const parentsById = new Map<string, Set<string>>();
  for (const [parentPath, parentNode] of nodeByPath.entries()) {
    const entry = packages[parentPath];
    if (!entry) continue;
    for (const dependencyName of collectDependencyNames(entry)) {
      const childPath = resolveChildPath(parentPath, dependencyName, pathSet);
      if (!childPath) continue;
      const childNode = nodeByPath.get(childPath);
      if (!childNode) continue;
      const parentSet = parentsById.get(childNode.id) ?? new Set<string>();
      parentSet.add(parentNode.id);
      parentsById.set(childNode.id, parentSet);
    }
  }

  const nodes = [...nodeByPath.values()].map((node) =>
    DependencyGraphNode.parse({
      ...node,
      parents: [...(parentsById.get(node.id) ?? new Set<string>())],
      direct: (parentsById.get(node.id) ?? new Set<string>()).has(rootNode.id),
    }),
  );

  return DependencyGraphReport.parse({
    packageName,
    packageVersion,
    nodeCount: nodes.length,
    directCount: nodes.filter((node) => node.direct).length,
    maxDepth: nodes.reduce((max, node) => Math.max(max, node.depth), 0),
    nodes: nodes.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name)),
  });
}

export async function buildDependencyGraph(packagePath: string): Promise<DependencyGraphPhaseResult> {
  const packageJson = readJson(path.join(packagePath, "package.json"));
  const warnings: ScanWarning[] = [];
  const workDir = createRuntimeTempDir("safeforge-depgraph-");

  try {
    const tarballPath = createPackageTarball(packagePath, workDir);
    fs.writeFileSync(
      path.join(workDir, "package.json"),
      JSON.stringify({ name: "safeforge-dependency-graph", private: true }, null, 2),
      "utf-8",
    );

    try {
      execFileSync(
        "npm",
        ["install", "--ignore-scripts", "--package-lock-only", "--omit=dev", tarballPath],
        {
          cwd: workDir,
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 120_000,
          encoding: "utf-8",
        },
      );
    } catch (error) {
      const message =
        error instanceof Error && "stderr" in error
          ? String((error as { stderr?: string }).stderr ?? error.message)
          : error instanceof Error
            ? error.message
            : "dependency graph install failed";
      warnings.push({
        code: "DEPENDENCY_GRAPH_INSTALL_FAILED",
        message: message.slice(0, 300),
      });
    }

    const lockPath = path.join(workDir, "package-lock.json");
    if (!fs.existsSync(lockPath)) {
      return {
        report: fallbackReport(packageJson),
        warnings,
      };
    }

    const lockfile = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as LockfileV3;
    const report = parseDependencyGraphFromLockfile(lockfile, packageJson);
    if (!report) {
      return {
        report: fallbackReport(packageJson),
        warnings: [
          ...warnings,
          {
            code: "DEPENDENCY_GRAPH_ROOT_MISSING",
            message: "The package-lock did not contain the resolved target package node.",
          },
        ],
      };
    }

    return { report, warnings };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
