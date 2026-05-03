import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEntrypointPrompt,
  buildEvidenceExtractionPrompt,
  buildFamilyPrompt,
  buildThreatContextPrompt,
} from "../../src/investigation/prompt.ts";
import {
  chooseBehaviorFamilies,
  deriveConfidenceFromProofType,
  normalizeEvidenceGraph,
} from "../../src/investigation/strategy.ts";

test("stage prompt builders produce distinct investigation prompts", () => {
  const baseInput = {
    packagePath: "/tmp/pkg",
    packageName: "fixture-pkg",
    version: "1.0.0",
    description: "fixture",
    readmeExcerpt: "Reads a file and uploads it.",
    flags: ["[warn] lifecycle-scripts: postinstall"],
    staticCaps: ["NETWORK", "ENV_VARS"],
    staticProofSummaries: ["index.js:12-30: reads process.env"],
    inventoryScripts: { postinstall: "node scripts/postinstall.js" },
    cliCommands: [{ name: "fixture", entry: "./bin.js" }],
    mainEntrypoint: "index.js",
    exportEntrypoints: ["./index.js"],
    scriptReferencedFiles: ["scripts/postinstall.js"],
  } as const;

  const threat = buildThreatContextPrompt(baseInput);
  const entrypoints = buildEntrypointPrompt(baseInput, "Purpose does not match capabilities.");
  const family = buildFamilyPrompt({
    family: "network_exfiltration",
    entrypoints: [{
      id: "cli:fixture",
      type: "cli",
      label: "fixture",
      file: "./bin.js",
      trigger: "",
      reason: "CLI is first user-controlled surface.",
      priority: 9,
      scriptName: null,
      commandName: "fixture",
    }],
    threatSummary: "Package claims local formatting but reaches out to remote endpoints.",
    entrypointSummary: "CLI bin.js is highest priority.",
    priorFindingSummaries: ["bin.js:10-20: calls fetch"],
    staticCaps: ["NETWORK"],
    readmeExcerpt: "Formats files locally.",
  });
  const extraction = buildEvidenceExtractionPrompt({
    threatContext: "Threat context summary",
    entrypointSummary: "Entrypoint summary",
    familyRuns: [{
      family: "network_exfiltration",
      summary: "Observed HTTP POST after reading env vars.",
      entrypointIds: ["cli:fixture"],
      toolCalls: [{ tool: "requireAndTrace", args: { entrypoint: "./bin.js" }, resultPreview: "TRACE LOG" }],
    }],
    staticProofSummaries: ["bin.js:10-20: fetch(...)"],
    findingsSoFar: ["network_exfiltration: observed POST to remote host"],
  });

  assert.match(threat, /infer intended package behavior/i);
  assert.match(entrypoints, /rank the exact entrypoints/i);
  assert.match(family, /Behavior family: Network exfiltration/i);
  assert.match(extraction, /Return only evidence-backed findings/i);
});

test("behavior-family routing picks relevant npm-focused families", () => {
  const families = chooseBehaviorFamilies({
    investigationInput: {
      packagePath: "/tmp/pkg",
      packageName: "fixture",
      version: "1.0.0",
      description: "",
      readmeExcerpt: "",
      flags: ["[warn] lifecycle-scripts: postinstall", "[warn] encoded-content: base64 blob"],
      staticCaps: ["NETWORK", "ENV_VARS", "NPM_TOKEN_ABUSE"],
      staticProofSummaries: ["index.js:1-4: reads process.env.NPM_TOKEN and posts to https://example.test"],
      inventoryScripts: { postinstall: "node postinstall.js" },
      cliCommands: [],
      mainEntrypoint: "index.js",
      exportEntrypoints: [],
      scriptReferencedFiles: ["postinstall.js"],
    },
    triage: { riskScore: 8, riskSummary: "high", focusAreas: [] },
    entrypoints: [{
      id: "hook:postinstall",
      type: "lifecycle",
      label: "postinstall",
      file: "postinstall.js",
      trigger: "postinstall",
      reason: "postinstall reads env and posts to remote host",
      priority: 10,
      scriptName: "postinstall",
      commandName: null,
    }],
  });

  assert.ok(families.includes("lifecycle_abuse"));
  assert.ok(families.includes("credential_theft"));
  assert.ok(families.includes("network_exfiltration"));
  assert.ok(families.includes("npm_token_abuse"));
});

test("confidence normalization enforces proof-type ceilings and verified floor", () => {
  const staticOnly = deriveConfidenceFromProofType(10, "static");
  assert.equal(staticOnly.score, 8);
  assert.equal(staticOnly.confidence, "LIKELY");

  const observed = deriveConfidenceFromProofType(6, "observed");
  assert.equal(observed.score, 7);
  assert.equal(observed.confidence, "LIKELY");

  const verified = deriveConfidenceFromProofType(4, "verified");
  assert.equal(verified.score, 10);
  assert.equal(verified.confidence, "CONFIRMED");
});

test("evidence graph normalization dedupes nodes and preserves valid edges", () => {
  const graph = normalizeEvidenceGraph({
    entrypoints: [],
    nodes: [
      { id: "a", kind: "entrypoint", label: "postinstall", fileLine: "package.json:1", detail: "hook", entrypointId: "hook:postinstall", sinkKind: null },
      { id: "b", kind: "entrypoint", label: "postinstall", fileLine: "package.json:1", detail: "hook", entrypointId: "hook:postinstall", sinkKind: null },
      { id: "c", kind: "sink", label: "network", fileLine: "postinstall.js:12", detail: "POST https://example.test", entrypointId: "hook:postinstall", sinkKind: "network" },
    ],
    edges: [
      { from: "a", to: "c", relation: "makes_network_request", detail: "trace", confidenceScore: 9 },
      { from: "missing", to: "c", relation: "calls", detail: "bad", confidenceScore: 4 },
    ],
  });

  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0]?.from, "a");
});
