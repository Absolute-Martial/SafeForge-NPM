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
- terminal-native `safenpm scan` and `safenpm doctor` commands
- settings-first web UI backed by `settings.local.json`
- recursive dependency graph construction from a generated lockfile
- OSV matching with optional GHSA enrichment and CVE enrichment from NVD
- recursive inventory and structural risk scanning
- AI triage and investigation with server-default or per-scan OpenAI-compatible providers
- native SafeForge CLI discovery and Docker sandboxing
- Docker sandbox execution for `--help`, `--version`, and no-args runs
- Node 22 and Node 24 LTS CLI behavior checks
- runtime observation for network, env access, child processes, filesystem writes, eval/function usage, and timeout anomalies
- dependency/advisory warnings and explainable affected paths
- explainable `SAFE`, `REVIEW REQUIRED`, `HIGH RISK`, or `BLOCK` verdicts

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
        `-- native SafeForge bin discovery
        |
        v
CLI Behavior Sandbox
        |-- Node 22
        |-- Node 24
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

## Settings-First Setup

The web app now opens on a settings-first control surface. Saving that form writes local engine configuration to:

```text
settings.local.json
```

That file can hold:

```json
{
  "llmEnabled": true,
  "llmBackend": "openai_compatible",
  "llmBaseUrl": "https://api.openai.com/v1",
  "llmApiKey": "your_key",
  "triageModel": "gpt-4.1-mini",
  "investigationModel": "gpt-4.1",
  "testGenModel": "gpt-4.1",
  "githubToken": "ghp_...",
  "nvdApiKey": "nvd_...",
  "defaultNodeVersions": ["22", "24"],
  "defaultScanDepth": 3,
  "defaultSecurityMode": "balanced",
  "cliBehaviorEnabled": true,
  "publishEnabled": true
}
```

The settings page can also query `/models` from any OpenAI-compatible base URL through the engine, so model dropdowns can populate without exposing provider API calls directly to the browser.

If `llmEnabled` is off, SafeForge skips LLM triage/investigation/test generation and returns database plus deterministic scan results only.

Environment variables are still supported as fallback defaults:

```bash
SAFEFORGE_NPM_LLM_BACKEND=openai_compatible
SAFEFORGE_NPM_LLM_BASE_URL=https://api.openai.com/v1
SAFEFORGE_NPM_LLM_API_KEY=your_server_default_key
```

## CLI Behavior Sandbox

SafeForge NPM uses native `package.json#bin` discovery plus Docker sandbox execution.

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

High-risk observed behavior is promoted directly into findings and materially increases the final 0-100 score, even when static triage is otherwise low.

## Advisory Pipeline

For every resolved package version in the dependency graph, SafeForge:

1. queries OSV as the primary exact-match vulnerability source
2. enriches GHSA aliases through the GitHub advisory API when `SAFEFORGE_NPM_GITHUB_TOKEN` is set
3. enriches CVE aliases from NVD
4. deduplicates results into one advisory record with severity, fixed version, aliases, and dependency path context

High and critical advisories, plus malware-style advisories, materially raise the final score and can drive the verdict into `HIGH RISK` or `BLOCK`.

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

The first screen is the settings page. Configure your provider, models, and vulnerability-enrichment tokens there, save them, and then run scans from the same page.

## Terminal CLI

SafeForge now ships a terminal-native wrapper in `cli/`:

```bash
npm --prefix cli install
npm --prefix cli run build
node cli/dist/index.js doctor
node cli/dist/index.js scan event-stream@3.3.6
```

Once the package is published, the intended entrypoint is:

```bash
safenpm doctor
safenpm scan event-stream@3.3.6
```

Useful flags:

```bash
safenpm scan lodash@4.17.21 --rescan --json --no-publish
safenpm scan eslint@9.0.0 --node-version 22 --node-version 24 --scan-depth 2 --security-mode balanced
safenpm scan react@19.0.0 --provider openai --base-url https://api.openai.com/v1 --model gpt-4.1-mini --api-key "$SAFEFORGE_NPM_SCAN_API_KEY"
```

The CLI talks to a running SafeForge engine API, defaults to `http://127.0.0.1:8000`, reuses an existing published verdict when registry reads are configured and an exact version audit already exists, and falls back to a fresh scan when `--rescan` is set.

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
- `npm --prefix cli run build`
- `npx --prefix cli tsx --test cli/tests/unit/args.test.ts`
- `npm --prefix frontend run lint`
- `npm --prefix frontend run build`
- `npx --prefix engine tsx --test engine/tests/unit/audit-options.test.ts engine/tests/unit/config.test.ts engine/tests/unit/models.test.ts engine/tests/unit/scoring.test.ts`
- `node cli/dist/index.js doctor --api-url http://127.0.0.1:8124 --json`
- `node cli/dist/index.js scan is-number@7.0.0 --api-url http://127.0.0.1:8124 --json --no-publish`
- targeted engine unit tests for audit option sanitization, CLI command detection, runtime risk mapping, provider override behavior, config loading, and sandbox instrumentation

## Credits

SafeForge NPM builds on prior open-source ideas and reworks them into a provider-agnostic npm security scanner.

- Vulnhuntr by Protect AI  
  https://github.com/protectai/vulnhuntr

Vulnhuntr informs the staged AI-assisted reasoning workflow and confidence shaping.
