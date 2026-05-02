# SafeForge NPM Engine

TypeScript audit engine for SafeForge NPM.

It handles:

- package resolution and inventory
- recursive dependency graph construction
- advisory matching and enrichment
- AI triage and investigation
- vendored npm-package-tester-backed CLI discovery plus SafeForge sandboxing
- proof generation and verification
- SSE streaming for the frontend dashboard

## Prerequisites

- Node.js 20+
- Docker
- an LLM API key for Anthropic or any OpenAI-compatible provider

## Run

```bash
npm install
npm run dev
```

Production:

```bash
npm run build
npm start
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

## Request Shape

`POST /audit` and `POST /audit/stream` accept:

```json
{
  "packageName": "eslint",
  "version": "9.0.0",
  "llm": {
    "providerName": "openai",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "ephemeral-per-scan-key",
    "model": "gpt-4.1-mini"
  },
  "sandbox": {
    "nodeVersions": ["20", "22"],
    "cliBehaviorEnabled": true,
    "aiScenariosEnabled": false
  }
}
```

Per-scan API keys are used only for the active run and are intentionally excluded from sanitized logs and reports.

## Environment Defaults

```bash
SAFEFORGE_NPM_LLM_BACKEND=openai_compatible
SAFEFORGE_NPM_LLM_BASE_URL=https://api.openai.com/v1
SAFEFORGE_NPM_LLM_API_KEY=your_default_key

SAFEFORGE_NPM_TRIAGE_MODEL=gpt-4.1-mini
SAFEFORGE_NPM_INVESTIGATION_MODEL=gpt-4.1
SAFEFORGE_NPM_TEST_GEN_MODEL=gpt-4.1
```

Those values are used when a scan does not supply an override.

Optional advisory/runtime settings:

```bash
SAFEFORGE_NPM_RUNTIME_ROOT=/runtime
SAFEFORGE_NPM_RUNTIME_HOST_ROOT=/absolute/host/path/to/.runtime
SAFEFORGE_NPM_GITHUB_TOKEN=ghp_...
SAFEFORGE_NPM_NVD_API_KEY=...
```

`SAFEFORGE_NPM_RUNTIME_HOST_ROOT` matters when the engine itself runs in Docker but launches sibling Docker containers through the host socket.

## Dependency + Advisory Phases

After inventory, the engine now:

- builds a dependency graph from a generated lockfile
- queries OSV for exact package/version matches
- enriches GHSA aliases with the GitHub advisory API when possible
- enriches CVE aliases from NVD
- emits `dependency_graph_ready`, `advisory_scan_started`, `advisory_match`, and `advisory_summary` SSE events

High and critical matched advisories, plus malware-style advisories, are promoted into structural proofs that can independently produce a `DANGEROUS` verdict.

## CLI Behavior Phase

After inventory, the engine can:

- detect CLI commands through the vendored `npm-package-tester` analyzer
- run each command under Node 20 and Node 22
- exercise `--help`, `--version`, and no-args forms
- instrument network, env, process, fs, eval/function, and timeout behavior
- emit `cli_behavior_started` and `cli_command_result` SSE events

High-risk runtime observations are converted into findings and proofs and can independently drive a `DANGEROUS` verdict.

## References

- Vulnhuntr: https://github.com/protectai/vulnhuntr
- npm-package-tester: https://github.com/kitium-ai/npm-package-tester
