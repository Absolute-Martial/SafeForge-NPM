import test from "node:test";
import assert from "node:assert/strict";

import { scoreAudit } from "../../src/scoring.ts";
import type { InventoryReport } from "../../src/models.ts";

const emptyInventory: InventoryReport = {
  metadata: { name: "fixture", version: "1.0.0", description: null, license: null, homepage: null, repository: null },
  scripts: {},
  entryPoints: { install: [], runtime: [], bin: [] },
  dependencies: {},
  files: [],
  flags: [],
  dealbreaker: null,
};

test("scoreAudit maps score ranges to 4-tier verdicts", () => {
  const safe = scoreAudit({
    securityMode: "balanced",
    inventory: emptyInventory,
    advisories: [],
    findings: [],
    proofs: [],
    triage: null,
    cliBehavior: null,
    llmEnabled: false,
    maxDependencyDepth: 0,
  });
  assert.equal(safe.verdict, "SAFE");

  const review = scoreAudit({
    securityMode: "balanced",
    inventory: {
      ...emptyInventory,
      flags: [{ severity: "warn", check: "encoded-content", detail: "encoded blob", file: "README" }],
    },
    advisories: [],
    findings: [],
    proofs: [],
    triage: { riskScore: 6, riskSummary: "moderate", focusAreas: [] },
    cliBehavior: null,
    llmEnabled: true,
    maxDependencyDepth: 2,
  });
  assert.equal(review.verdict, "REVIEW REQUIRED");

  const highRisk = scoreAudit({
    securityMode: "balanced",
    inventory: emptyInventory,
    advisories: [{
      id: "ghsa-1",
      packageName: "left-pad",
      packageVersion: "1.0.0",
      title: "High severity advisory",
      summary: "unsafe",
      severity: "high",
      sourceIds: ["GHSA-1"],
      aliases: [],
      fixedVersion: null,
      affectedVersion: null,
      matchedNodes: [],
      dependencyPaths: [],
      references: [],
      malware: false,
    }],
    findings: [],
    proofs: [],
    triage: null,
    cliBehavior: null,
    llmEnabled: false,
    maxDependencyDepth: 1,
  });
  assert.equal(highRisk.verdict, "HIGH RISK");

  const block = scoreAudit({
    securityMode: "strict",
    inventory: {
      ...emptyInventory,
      flags: [{ severity: "info", check: "lifecycle-scripts", detail: "postinstall", file: null }],
    },
    advisories: [],
    findings: [],
    proofs: [],
    triage: null,
    cliBehavior: {
      enabled: true,
      nodeVersions: ["22"],
      commandsDiscovered: [],
      results: [{
        command: "tool",
        entry: "./bin.js",
        nodeVersion: "22",
        scenario: "help",
        args: ["--help"],
        exitCode: 0,
        durationMs: 50,
        stdoutPreview: "",
        stderrPreview: "",
        timedOut: false,
        risk: "high",
        observations: [{ kind: "network", detail: "GET https://example.com" }],
        trace: {
          modulesLoaded: [],
          networkCalls: [],
          fsOperations: [],
          envAccess: [],
          processSpawns: [],
          evalCalls: [],
          cryptoOps: [],
          timers: [],
        },
      }],
      highRiskCount: 1,
      skippedReason: null,
    },
    llmEnabled: false,
    maxDependencyDepth: 1,
  });
  assert.equal(block.verdict, "BLOCK");
});
