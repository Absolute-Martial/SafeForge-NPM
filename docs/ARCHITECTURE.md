# Technical Architecture

SafeForge NPM is split into a web dashboard, an audit engine, sandbox execution support, and a small unpublished CLI preview.

## Components

```text
frontend/
  React dashboard for settings, scan input, live progress, and reports

engine/
  TypeScript API service that resolves packages, builds dependency graphs,
  checks vulnerabilities, runs static analysis, controls sandbox execution,
  performs optional AI reasoning, and generates final reports

sandbox/
  Fixtures and behavior-test harnesses used by the project tests

cli/
  Unpublished local ForgeNPM preview for future terminal workflows
```

## Runtime Flow

```text
Browser dashboard
        |
        v
Engine API
        |
        |-- package metadata resolution
        |-- dependency graph workspace
        |-- advisory lookup and enrichment
        |-- static package inventory
        |-- Docker sandbox behavior checks
        |-- optional OpenAI-compatible LLM reasoning
        |-- scoring and report generation
        v
Final dashboard report
```

## Engine Phases

1. Resolve package metadata and tarball source.
2. Build a dependency graph from a generated lockfile.
3. Query vulnerability sources for exact package/version matches.
4. Inventory package files, scripts, entrypoints, and suspicious patterns.
5. Run package behavior checks inside Docker sandboxes.
6. Optionally run AI-assisted reasoning against suspicious evidence.
7. Score the evidence and emit a final verdict.

## Data Flow

The frontend talks to the engine over HTTP and receives live scan progress over SSE. The final report contains normalized sections for dependencies, advisories, findings, sandbox behavior, AI reasoning, score, and verdict.

Sensitive values such as API keys are treated as configuration or per-scan secrets and should not be written to reports, SSE payloads, or browser storage.

## Docker Runtime

Docker is used for package behavior checks so package code is not executed directly in the host project. The engine uses temporary runtime workspaces and sandbox instrumentation to observe risky behavior such as network attempts, DNS lookups, process execution, environment reads, file writes, and dynamic code evaluation.

## External Services

SafeForge can use:

- OSV for package/version vulnerability matching
- GitHub Advisory-style enrichment for GHSA details
- NVD enrichment for CVE aliases
- OpenAI-compatible LLM APIs for optional reasoning

The deterministic scan path still works without LLM configuration.
