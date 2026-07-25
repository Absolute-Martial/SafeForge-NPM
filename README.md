# SafeForge NPM done

## Overview

SafeForge NPM is a web-based npm supply-chain intelligence dashboard for recursive dependency analysis, CVE checks, sandbox behavior monitoring, AI reasoning, and explainable package risk reports.

Submitted for Nexforge under the Cybersecurity & Digital Privacy track.

## Problem Statement

npm packages can bring vulnerable dependencies, compromised maintainer releases, suspicious lifecycle scripts, credential access, command execution, and unexpected network behavior into a project through one install decision.

Most package checks stop at known CVEs. That is useful, but incomplete: malicious packages often hide in install scripts, CLI entrypoints, obfuscated loaders, and runtime behavior that only appears when the package is executed.

## Solution

SafeForge NPM gives developers a web dashboard that scans a package before trust is granted. It resolves the package, builds a dependency graph, checks advisory databases, analyzes source code, runs package behavior inside Docker sandboxes, monitors risky runtime activity, and generates a clear score and verdict.

The goal is not just to say "bad package" or "good package." The goal is to show evidence: which dependency is affected, which file looks risky, what behavior happened in the sandbox, and why the final verdict was produced.

## Key Features

- Web-based npm package scanner
- Recursive dependency graph analysis
- OSV and GitHub Advisory-style vulnerability lookup
- NVD CVE enrichment
- Static JavaScript risk analysis
- Lifecycle script detection
- Suspicious command and API usage detection
- Docker-based sandbox behavior monitoring
- Web/API request attempt logging
- Command execution analysis
- File write and environment access monitoring
- AI-assisted risk reasoning
- Explainable risk scoring
- `SAFE`, `REVIEW REQUIRED`, `HIGH RISK`, or `BLOCK` verdicts
- Exportable scan reports

## Demo

Run the full prototype locally with Docker Compose:

```bash
docker compose up --build
```

Open:

```text
http://127.0.0.1:8000
```

Suggested demo package inputs:

```text
is-number@7.0.0
lodash@4.17.15
express@4.17.1
```

The dashboard is the main product surface. It is designed for package lookup, scan configuration, live activity, sandbox telemetry, advisory results, and final risk reports.

Full setup details are in [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Screenshots

Screenshots can be captured from the running dashboard after starting Docker Compose. Recommended views for submission:

- Settings page with vulnerability and LLM configuration
- Active scan progress
- Final verdict panel
- Dependency and advisory results
- Sandbox behavior monitoring section

## How It Works

```text
User enters package@version
        ↓
Package metadata is resolved
        ↓
Recursive dependency graph is built
        ↓
Known vulnerabilities are checked through advisory databases
        ↓
Source files are statically analyzed for suspicious patterns
        ↓
CLI/package behavior is executed inside a hardened sandbox
        ↓
Network, command, file, and environment activity is monitored
        ↓
AI reasoning explains suspicious findings
        ↓
Policy engine generates final risk score and verdict
```

More detail is available in [docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md).

## Dashboard Guide

1. Open the web app.
2. Configure settings if needed:
   - LLM provider and model
   - GitHub token for advisory enrichment
   - NVD API key for CVE enrichment
   - Node versions and sandbox options
   - scan depth and security mode
3. Enter an npm package name or exact `package@version`.
4. Start the scan.
5. Review the live activity feed.
6. Inspect the final report:
   - dependency graph summary
   - advisory matches
   - static findings
   - sandbox behavior events
   - AI reasoning output when enabled
   - final score and verdict

LLM reasoning is optional. If it is disabled, SafeForge still performs deterministic dependency, advisory, static, and sandbox checks.

## Technical Architecture

```text
frontend/
  React dashboard for scan setup, live SSE activity, settings, and reports

engine/
  TypeScript API service for package resolution, advisory lookup, analysis,
  sandbox orchestration, scoring, reports, and settings persistence

sandbox/
  Local fixtures and behavior-test harnesses used by the engine test suite

cli/
  Unpublished local CLI preview for future developer workflow support
```

Runtime flow:

```text
Frontend -> Engine API -> npm metadata / lockfile workspace
                    -> OSV / GitHub Advisory / NVD enrichment
                    -> static inventory and risk scanner
                    -> Docker sandbox workers
                    -> optional OpenAI-compatible LLM reasoning
                    -> final report
```

The full architecture notes are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Vulnerability Data Sources

SafeForge NPM uses advisory data as evidence, not guesswork:

- OSV is the primary package/version vulnerability matcher.
- GitHub Advisory-style data enriches GHSA details when a token is configured.
- NVD enriches CVE aliases with severity and references when available.

High and critical matches increase the score significantly. Moderate and low findings are still reported so developers can review dependency paths and fixed versions.

## Sandbox Design

SafeForge executes package behavior inside Docker-based sandboxes rather than on the host project.

The sandbox design focuses on:

- isolated temporary workspaces
- Node 22 and Node 24 behavior checks
- constrained container execution
- blocked/default-controlled network behavior
- instrumentation for network, DNS, process, filesystem, environment, and dynamic-code events
- redaction of secrets in events and reports

Observed high-risk behavior, such as suspicious network attempts, sensitive environment reads, shell execution, or write attempts outside the expected workspace, is promoted into findings.

## Risk Scoring Model

SafeForge reports a 0-100 score and a four-tier verdict:

```text
0-24     SAFE
25-49    REVIEW REQUIRED
50-74    HIGH RISK
75-100   BLOCK
```

The score combines:

- advisory severity
- vulnerable dependency depth
- static JavaScript risk signals
- lifecycle script risk
- sandbox runtime behavior
- command and API usage
- environment and file access
- AI confidence when LLM reasoning is enabled

The report keeps evidence close to each finding so users can understand why the score changed.

## Setup Instructions

Prerequisites:

- Node.js 22+
- Docker
- Docker Compose
- an LLM API key only if you want AI-assisted reasoning

Run the production-style local stack:

```bash
docker compose up --build
```

For server deployment with Docker Compose, use [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and `compose.deploy.yaml`.

Run engine and frontend separately for local development:

```bash
npm --prefix engine install
npm --prefix engine run dev
```

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

Build everything:

```bash
npm run build
```

For troubleshooting and first-scan guidance, see [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Environment Variables

SafeForge can be configured through environment variables or through the web settings page, which writes local configuration to `settings.local.json`.

Common settings:

```bash
SAFEFORGE_NPM_LLM_BACKEND=openai_compatible
SAFEFORGE_NPM_LLM_BASE_URL=https://api.openai.com/v1
SAFEFORGE_NPM_LLM_API_KEY=your_server_default_key
SAFEFORGE_NPM_TRIAGE_MODEL=gpt-4.1-mini
SAFEFORGE_NPM_INVESTIGATION_MODEL=gpt-4.1
SAFEFORGE_NPM_TEST_GEN_MODEL=gpt-4.1
SAFEFORGE_NPM_GITHUB_TOKEN=your_github_token
SAFEFORGE_NPM_NVD_API_KEY=your_nvd_key
SAFEFORGE_NPM_RUNTIME_ROOT=/runtime
```

LLM API keys are optional and can be disabled for database-only and deterministic scans. Per-scan API keys are treated as ephemeral and must not be written to browser storage, SSE payloads, logs, or reports.

## Project Structure

```text
.
├── cli/          # unpublished local ForgeNPM CLI preview
├── docs/         # installation, architecture, deployment, and flow notes
├── engine/       # TypeScript audit engine and API
├── frontend/     # React dashboard
├── sandbox/      # sandbox fixtures and harness tests
├── compose.deploy.yaml
├── compose.yaml  # one-command local runtime
├── Dockerfile
└── README.md
```

The CLI preview is not published to npm. If linked locally, its binary is `forgenpm`, but CLI distribution is roadmap work rather than the primary feature of this submission.

## Originality and Attribution

SafeForge NPM is original hackathon work. It implements its own dashboard, engine pipeline, sandbox orchestration, scoring, reporting, and settings model.

Public projects reviewed during design:

- Vulnhuntr: reference for staged AI-assisted vulnerability reasoning and confidence discipline.  
  https://github.com/protectai/vulnhuntr
- npm-package-tester: reference for npm CLI discovery, package behavior testing, and Docker-based execution patterns.  
  https://github.com/kitium-ai/npm-package-tester

These projects were used as design references only; SafeForge NPM does not vendor their source code.

## Roadmap

- CLI scanner for local developer workflows
- GitHub Action integration
- npm proxy firewall
- Enterprise policy dashboard

## License

No explicit open-source license has been added yet. Add a license before distributing or accepting external contributions.
