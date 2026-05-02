import test from "node:test";
import assert from "node:assert/strict";

import {
  buildJsonScanResult,
  buildScanRequest,
  parseCliArgs,
  sanitizeScanRequestForDisplay,
  shouldReuseRegistryVerdict,
} from "../../src/args.ts";

test("parseCliArgs handles scan flags and scoped package specs", () => {
  const parsed = parseCliArgs([
    "scan",
    "@scope/pkg@1.2.3",
    "--node-version",
    "22",
    "--node-version=24",
    "--scan-depth",
    "4",
    "--security-mode",
    "strict",
    "--provider",
    "openai",
    "--base-url",
    "https://api.openai.com/v1",
    "--model",
    "gpt-4.1-mini",
    "--api-key",
    "sk-secret",
  ]);

  assert.equal(parsed.command, "scan");
  if (parsed.command !== "scan") throw new Error("expected scan command");
  assert.deepEqual(parsed.flags.packageSpec, { name: "@scope/pkg", version: "1.2.3" });
  assert.deepEqual(parsed.flags.nodeVersions, ["22", "24"]);
  assert.equal(parsed.flags.scanDepth, 4);
  assert.equal(parsed.flags.securityMode, "strict");
  assert.equal(parsed.flags.llm.apiKey, "sk-secret");
});

test("buildScanRequest preserves ephemeral llm override but sanitizeScanRequestForDisplay redacts api key", () => {
  const parsed = parseCliArgs([
    "scan",
    "left-pad@1.3.0",
    "--api-key",
    "sk-secret",
    "--base-url",
    "https://example.com/v1",
  ]);
  if (parsed.command !== "scan") throw new Error("expected scan command");

  const request = buildScanRequest(parsed.flags);
  const sanitized = sanitizeScanRequestForDisplay(request);

  assert.equal(request.llm?.apiKey, "sk-secret");
  assert.equal("apiKey" in (sanitized.llm ?? {}), false);
  assert.equal(request.scanDepth, 3);
  assert.equal(request.securityMode, "balanced");
});

test("shouldReuseRegistryVerdict only reuses exact matches when rescan is false", () => {
  assert.equal(
    shouldReuseRegistryVerdict(
      {
        found: true,
        verdict: "dangerous",
        score: 9,
        reportUri: "https://example.com/report.json",
        sourceUri: null,
        publishedAt: null,
        versionMatched: true,
        ensName: "1-0-0.pkg.safeforge-npm.eth",
        capabilities: ["NETWORK"],
      },
      false,
    ),
    true,
  );

  assert.equal(
    shouldReuseRegistryVerdict(
      {
        found: true,
        verdict: "dangerous",
        score: 9,
        reportUri: "https://example.com/report.json",
        sourceUri: null,
        publishedAt: null,
        versionMatched: true,
        ensName: "1-0-0.pkg.safeforge-npm.eth",
        capabilities: ["NETWORK"],
      },
      true,
    ),
    false,
  );
});

test("buildJsonScanResult returns the public machine-readable scan shape", () => {
  const result = buildJsonScanResult({
    packageName: "axios",
    version: "1.7.0",
    registryPrecheck: null,
    reusedRegistryVerdict: false,
    report: {
      verdict: "SAFE",
      finalScore: 18,
      triage: { riskScore: 2 },
      advisories: [],
      findings: [],
      capabilities: [],
      reasoningStageSummaries: [{ stage: "threat_context", summary: "Looks harmless", highlights: [] }],
      familyAnalyses: [],
      evidenceGraph: { entrypoints: [], nodes: [], edges: [] },
    },
    publishResult: { status: "skipped" },
  });

  assert.equal(result.packageName, "axios");
  assert.equal(result.score, 18);
  assert.equal(result.verdict, "SAFE");
  assert.equal(result.reasoningStageSummaries?.[0]?.stage, "threat_context");
});
