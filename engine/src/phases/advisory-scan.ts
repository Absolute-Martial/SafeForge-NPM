import { AdvisoryRecord, AdvisorySummary, type DependencyGraphReport, type DependencyGraphNode, type ScanWarning } from "../models.js";
import { config } from "../config.js";

const OSV_API = "https://api.osv.dev/v1/querybatch";
const GHSA_API = "https://api.github.com/advisories";
const NVD_API = "https://services.nvd.nist.gov/rest/json/cves/2.0";

type OsvAlias = string;

interface OsvReference {
  type?: string;
  url?: string;
}

interface OsvRangeEvent {
  fixed?: string;
  introduced?: string;
}

interface OsvAffected {
  ranges?: Array<{ events?: OsvRangeEvent[] }>;
  package?: { ecosystem?: string; name?: string };
}

interface OsvVulnerability {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  severity?: Array<{ type?: string; score?: string }>;
  affected?: OsvAffected[];
  references?: OsvReference[];
}

interface OsvResponse {
  vulns?: OsvVulnerability[];
}

interface AdvisoryScanResult {
  advisories: Array<ReturnType<typeof AdvisoryRecord.parse>>;
  summary: ReturnType<typeof AdvisorySummary.parse>;
  warnings: ScanWarning[];
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function collectDependencyPaths(
  nodeId: string,
  nodeById: Map<string, DependencyGraphNode>,
  parentsById: Map<string, string[]>,
  rootNodeId: string | null,
  maxDepth = 12,
): string[][] {
  if (!rootNodeId || nodeId === rootNodeId) {
    const node = nodeById.get(nodeId);
    return node ? [[node.name]] : [];
  }

  const paths: string[][] = [];

  function visit(currentId: string, trail: string[], depth: number): void {
    const current = nodeById.get(currentId);
    if (!current) return;
    const nextTrail = [current.name, ...trail];
    if (currentId === rootNodeId || depth >= maxDepth) {
      paths.push(nextTrail);
      return;
    }

    const parents = parentsById.get(currentId) ?? [];
    if (parents.length === 0) {
      paths.push(nextTrail);
      return;
    }

    for (const parentId of parents) {
      visit(parentId, nextTrail, depth + 1);
    }
  }

  visit(nodeId, [], 0);
  return paths.map((segments) => [...new Set(segments)]);
}

function firstFixedVersion(vuln: OsvVulnerability): string | null {
  for (const affected of vuln.affected ?? []) {
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed) return event.fixed;
      }
    }
  }
  return null;
}

function severityFromOsv(vuln: OsvVulnerability): "critical" | "high" | "moderate" | "low" | "info" | "unknown" {
  const score = vuln.severity?.[0]?.score?.toUpperCase() ?? "";
  if (score.includes("CRITICAL")) return "critical";
  if (score.includes("HIGH")) return "high";
  if (score.includes("MODERATE") || score.includes("MEDIUM")) return "moderate";
  if (score.includes("LOW")) return "low";
  return "unknown";
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

async function queryOsv(nodes: DependencyGraphNode[]): Promise<Array<{ node: DependencyGraphNode; vulns: OsvVulnerability[] }>> {
  if (nodes.length === 0) return [];

  const responses: Array<{ node: DependencyGraphNode; vulns: OsvVulnerability[] }> = [];
  for (const batch of chunk(nodes, 100)) {
    const response = await fetch(OSV_API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        queries: batch.map((node) => ({
          package: { ecosystem: "npm", name: node.name },
          version: node.version,
        })),
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`OSV query failed with HTTP ${response.status}`);
    }

    const data = (await response.json()) as { results?: OsvResponse[] };
    const results = data.results ?? [];
    for (let index = 0; index < batch.length; index += 1) {
      responses.push({
        node: batch[index]!,
        vulns: results[index]?.vulns ?? [],
      });
    }
  }
  return responses;
}

async function fetchGhsa(ghsaId: string): Promise<{
  summary?: string;
  severity?: string;
  references?: string[];
} | null> {
  if (!config.githubToken) {
    return null;
  }

  const response = await fetch(`${GHSA_API}/${ghsaId}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${config.githubToken}`,
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    summary?: string;
    severity?: string;
    references?: Array<{ url?: string }>;
  };

  return {
    summary: data.summary,
    severity: data.severity,
    references: (data.references ?? []).map((reference) => reference.url).filter(Boolean) as string[],
  };
}

async function fetchNvd(cveId: string): Promise<{
  description?: string;
  severity?: string;
  references?: string[];
} | null> {
  const headers: Record<string, string> = {};
  if (config.nvdApiKey) {
    headers.apiKey = config.nvdApiKey;
  }

  const response = await fetch(`${NVD_API}?cveId=${encodeURIComponent(cveId)}`, {
    headers,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    vulnerabilities?: Array<{
      cve?: {
        descriptions?: Array<{ lang?: string; value?: string }>;
        metrics?: {
          cvssMetricV31?: Array<{ cvssData?: { baseSeverity?: string } }>;
          cvssMetricV30?: Array<{ cvssData?: { baseSeverity?: string } }>;
          cvssMetricV2?: Array<{ baseSeverity?: string }>;
        };
        references?: Array<{ url?: string }>;
      };
    }>;
  };

  const cve = data.vulnerabilities?.[0]?.cve;
  if (!cve) return null;
  const description =
    cve.descriptions?.find((entry) => entry.lang === "en")?.value ??
    cve.descriptions?.[0]?.value;
  const severity =
    cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity ??
    cve.metrics?.cvssMetricV30?.[0]?.cvssData?.baseSeverity ??
    cve.metrics?.cvssMetricV2?.[0]?.baseSeverity;

  return {
    description,
    severity: severity?.toLowerCase(),
    references: (cve.references ?? []).map((reference) => reference.url).filter(Boolean) as string[],
  };
}

function summarizeAdvisories(advisories: Array<ReturnType<typeof AdvisoryRecord.parse>>) {
  const summary = {
    total: advisories.length,
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0,
    unknown: 0,
    dangerousCount: 0,
  };

  for (const advisory of advisories) {
    summary[advisory.severity] += 1;
    if (advisory.malware || advisory.severity === "critical" || advisory.severity === "high") {
      summary.dangerousCount += 1;
    }
  }

  return AdvisorySummary.parse(summary);
}

export async function scanAdvisories(
  dependencyGraph: DependencyGraphReport,
): Promise<AdvisoryScanResult> {
  const warnings: ScanWarning[] = [];
  const nodeById = new Map(dependencyGraph.nodes.map((node) => [node.id, node]));
  const parentsById = new Map(dependencyGraph.nodes.map((node) => [node.id, node.parents]));
  const rootNodeId =
    dependencyGraph.nodes.find((node) => node.dependencyType === "root")?.id ?? null;

  const osvResults = await queryOsv(dependencyGraph.nodes);
  const advisoriesByKey = new Map<string, ReturnType<typeof AdvisoryRecord.parse>>();
  const ghsaCache = new Map<OsvAlias, Awaited<ReturnType<typeof fetchGhsa>>>();
  const nvdCache = new Map<OsvAlias, Awaited<ReturnType<typeof fetchNvd>>>();

  const needsGhsa = osvResults.some(({ vulns }) =>
    vulns.some((vuln) => (vuln.aliases ?? []).some((alias) => alias.startsWith("GHSA-"))),
  );
  if (needsGhsa && !config.githubToken) {
    warnings.push({
      code: "GHSA_TOKEN_MISSING",
      message: "GitHub advisory enrichment skipped because SAFEFORGE_NPM_GITHUB_TOKEN is not set.",
    });
  }

  for (const { node, vulns } of osvResults) {
    for (const vuln of vulns) {
      const ghsaAlias = (vuln.aliases ?? []).find((alias) => alias.startsWith("GHSA-"));
      const cveAlias = (vuln.aliases ?? []).find((alias) => alias.startsWith("CVE-"));
      const key = uniqueStrings([ghsaAlias, cveAlias, vuln.id])[0] ?? vuln.id;

      if (ghsaAlias && !ghsaCache.has(ghsaAlias)) {
        ghsaCache.set(ghsaAlias, await fetchGhsa(ghsaAlias));
      }
      if (cveAlias && !nvdCache.has(cveAlias)) {
        nvdCache.set(cveAlias, await fetchNvd(cveAlias));
      }

      const ghsa = ghsaAlias ? ghsaCache.get(ghsaAlias) ?? null : null;
      const nvd = cveAlias ? nvdCache.get(cveAlias) ?? null : null;
      const existing = advisoriesByKey.get(key);
      const baseSeverity = ghsa?.severity?.toLowerCase() ?? nvd?.severity?.toLowerCase() ?? severityFromOsv(vuln);
      const severity =
        baseSeverity === "critical" || baseSeverity === "high" || baseSeverity === "low" || baseSeverity === "info"
          ? baseSeverity
          : baseSeverity === "moderate" || baseSeverity === "medium"
            ? "moderate"
            : "unknown";
      const dependencyPaths = collectDependencyPaths(node.id, nodeById, parentsById, rootNodeId);

      const advisory = AdvisoryRecord.parse({
        id: existing?.id ?? key,
        packageName: node.name,
        packageVersion: node.version,
        title: existing?.title ?? ghsa?.summary ?? vuln.summary ?? vuln.id,
        summary:
          ghsa?.summary ??
          nvd?.description ??
          vuln.details ??
          vuln.summary ??
          "Known vulnerability matched for this dependency version.",
        severity,
        sourceIds: uniqueStrings([...(existing?.sourceIds ?? []), vuln.id, ghsaAlias, cveAlias]),
        aliases: uniqueStrings([...(existing?.aliases ?? []), ...(vuln.aliases ?? [])]),
        fixedVersion: existing?.fixedVersion ?? firstFixedVersion(vuln),
        affectedVersion: existing?.affectedVersion ?? node.version,
        matchedNodes: uniqueStrings([...(existing?.matchedNodes ?? []), node.id]),
        dependencyPaths: [...(existing?.dependencyPaths ?? []), ...dependencyPaths],
        references: [
          ...(existing?.references ?? []),
          ...uniqueStrings([
            ...(vuln.references ?? []).map((reference) => reference.url),
            ...(ghsa?.references ?? []),
            ...(nvd?.references ?? []),
          ]).map((url) => ({ source: "reference", url })),
        ],
        malware:
          existing?.malware ??
          /malware|backdoor|typosquat|credential theft/i.test(
            `${vuln.summary ?? ""}\n${vuln.details ?? ""}\n${nvd?.description ?? ""}`,
          ),
      });

      advisoriesByKey.set(key, advisory);
    }
  }

  const advisories = [...advisoriesByKey.values()].sort((a, b) => {
    const rank = { critical: 0, high: 1, moderate: 2, low: 3, info: 4, unknown: 5 };
    return rank[a.severity] - rank[b.severity] || a.packageName.localeCompare(b.packageName);
  });

  return {
    advisories,
    summary: summarizeAdvisories(advisories),
    warnings,
  };
}
