# SafeForge NPM

Recursive AI-powered npm supply chain security and behavior testing scanner.

SafeForge NPM audits npm packages before installation by combining recursive dependency graphing, live advisory intelligence, AI-assisted reasoning, runtime sandbox monitoring, and CLI behavior testing across isolated Node environments.

## What Changed

This codebase is being adapted into SafeForge NPM with two major shifts:

- no payment gate in the audit flow
- provider-agnostic LLM support through any OpenAI-compatible API

Users can keep server defaults in `.env` or override provider, base URL, model, and API key per scan from the UI. Per-scan API keys are ephemeral and are not written to browser storage, audit reports, or SSE event payloads.

## Current MVP

- package input with `package` or `package@version`
- recursive dependency graph construction from a generated lockfile
- OSV matching with optional GHSA enrichment and CVE enrichment from NVD
- recursive inventory and structural risk scanning
- AI triage and investigation with server-default or per-scan OpenAI-compatible providers
- vendored `npm-package-tester` command discovery defaults with SafeForge-owned instrumentation
- Docker sandbox execution for `--help`, `--version`, and no-args runs
- Node 20 and Node 22 CLI behavior checks
- runtime observation for network, env access, child processes, filesystem writes, eval/function usage, and timeout anomalies
- dependency/advisory warnings and explainable affected paths
- explainable `SAFE` or `DANGEROUS` verdicts

## Architecture

```text
User enters package@version
        |
        v
Package Resolver
        |
        v
Recursive Dependency Graph
        |
        v
Advisory Intelligence
        |-- OSV exact package/version matching
        |-- GHSA enrichment when token is available
        `-- NVD enrichment for CVE aliases
        |
        v
Recursive Dependency + Inventory Scan
        |
        v
Static Risk Scanner
        |-- lifecycle scripts
        |-- eval / Function
        |-- child_process
        |-- fs access
        |-- http / https / net / dns
        `-- obfuscation signals
        |
        v
CLI Discovery
        `-- vendored npm-package-tester analyzer
        |
        v
CLI Behavior Sandbox
        |-- Node 20
        |-- Node 22
        |-- --help
        |-- --version
        `-- no-args
        |
        v
AI Triage + Investigation
        |
        v
Proof Generation + Verification
        |
        v
Explainable Verdict
```

## Provider-Agnostic LLM Setup

Server defaults still come from environment variables:

```bash
SAFEFORGE_NPM_LLM_BACKEND=openai_compatible
SAFEFORGE_NPM_LLM_BASE_URL=https://api.openai.com/v1
SAFEFORGE_NPM_LLM_API_KEY=your_server_default_key

SAFEFORGE_NPM_TRIAGE_MODEL=gpt-4.1-mini
SAFEFORGE_NPM_INVESTIGATION_MODEL=gpt-4.1
SAFEFORGE_NPM_TEST_GEN_MODEL=gpt-4.1
```

At scan time, the dashboard can override those defaults with any OpenAI-compatible provider such as OpenAI, OpenRouter, Groq, or a custom endpoint.

Advisory enrichment is optional:

```bash
SAFEFORGE_NPM_GITHUB_TOKEN=ghp_...
SAFEFORGE_NPM_NVD_API_KEY=...
```

If the GitHub token is missing, SafeForge still scans with OSV and emits a scan warning instead of failing.

## CLI Behavior Sandbox

SafeForge NPM vendors `npm-package-tester` under `third_party/npm-package-tester/` and uses that snapshot as the default CLI discovery backend, while keeping runtime instrumentation, policy logic, and verdict shaping inside SafeForge.

For each discovered CLI command, SafeForge runs:

```bash
tool --help
tool --version
tool
```

Those commands execute inside constrained Docker sandboxes with runtime instrumentation. SafeForge records whether the package:

- attempts outbound network access
- reads sensitive environment variables
- spawns child processes
- writes outside the allowed workspace
- evaluates dynamic code
- times out or emits suspiciously large output

High-risk observed behavior is promoted directly into findings and can independently produce a `DANGEROUS` verdict even when static triage is otherwise low.

## Advisory Pipeline

For every resolved package version in the dependency graph, SafeForge:

1. queries OSV as the primary exact-match vulnerability source
2. enriches GHSA aliases through the GitHub advisory API when `SAFEFORGE_NPM_GITHUB_TOKEN` is set
3. enriches CVE aliases from NVD
4. deduplicates results into one advisory record with severity, fixed version, aliases, and dependency path context

High and critical advisories, plus malware-style advisories, currently promote the package to `DANGEROUS`.

## Running It

The simplest end-to-end path is Docker Compose:

```bash
docker compose up --build
```

That starts the engine, serves the built frontend from the same container, mounts the Docker socket for sibling sandboxes, and uses `./.runtime` as the shared runtime root for package resolution and sandbox workspaces.

Open:

```text
http://127.0.0.1:8000
```

## Local Development

Prerequisites:

- Node.js 22+
- Docker
- an LLM API key if you want live AI phases

Run the engine:

```bash
npm --prefix engine install
npm --prefix engine run dev
```

Run the frontend:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Production build:

```bash
npm run build
```

## Verification

The current implementation has been verified with:

- `npm --prefix engine run build`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`
- `curl http://127.0.0.1:8000/health`
- targeted engine unit tests for audit option sanitization, CLI command detection, runtime risk mapping, provider override behavior, config loading, and sandbox instrumentation

## Credits

SafeForge NPM builds on prior open-source ideas and reworks them into a provider-agnostic npm security scanner.

- Vulnhuntr by Protect AI  
  https://github.com/protectai/vulnhuntr
- npm-package-tester by kitium-ai  
  https://github.com/kitium-ai/npm-package-tester

Vulnhuntr informs the staged AI-assisted reasoning workflow and confidence shaping.

npm-package-tester informs CLI discovery, Docker execution patterns, Node-version test matrices, and scenario-driven sandbox behavior checks. A vendored source snapshot is included under `third_party/npm-package-tester/` with its upstream license preserved.
