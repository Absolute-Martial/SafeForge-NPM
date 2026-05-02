# SafeForge NPM Engine

TypeScript audit engine for SafeForge NPM.

It handles:

- package resolution and inventory
- recursive dependency graph construction
- advisory matching and enrichment
- AI triage and investigation
- native CLI discovery plus SafeForge sandboxing
- proof generation and verification
- SSE streaming for the frontend dashboard

## Prerequisites

- Node.js 22+
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
  "publish": true,
  "scanDepth": 3,
  "securityMode": "balanced",
  "llm": {
    "providerName": "openai",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "ephemeral-per-scan-key",
    "model": "gpt-4.1-mini"
  },
  "sandbox": {
    "nodeVersions": ["22", "24"],
    "cliBehaviorEnabled": true,
    "aiScenariosEnabled": false
  }
}
```

Per-scan API keys are used only for the active run and are intentionally excluded from sanitized logs and reports.

Set `"publish": false` to suppress auto-publish for a specific scan even when publish infrastructure is configured on the server.

## Settings API

The engine exposes local configuration endpoints for the web settings page:

- `GET /settings`
- `PUT /settings`
- `POST /settings/models`

`GET /settings` and `PUT /settings` read/write `settings.local.json` at the repo root and immediately reload runtime config without restarting the engine.

`POST /settings/models` proxies OpenAI-compatible `/models` discovery through the engine so the browser can populate model lists safely.

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

High and critical matched advisories, plus malware-style advisories, materially raise the final score and can drive the verdict into `HIGH RISK` or `BLOCK`.

## CLI Behavior Phase

After inventory, the engine can:

- detect CLI commands through native SafeForge `package.json#bin` discovery
- run each command under Node 22 and Node 24
- exercise `--help`, `--version`, and no-args forms
- instrument network, env, process, fs, eval/function, and timeout behavior
- emit `cli_behavior_started` and `cli_command_result` SSE events

High-risk runtime observations are converted into findings and proofs and materially raise the final score.

## CLI Support Endpoints

The terminal CLI also uses:

- `GET /cli/status`
- `GET /registry/precheck?packageName=<name>&version=<version>`

`/cli/status` reports engine reachability, Docker availability, publish/registry readiness, and LLM configuration presence.

`/registry/precheck` checks for an exact published verdict for a package version when registry reads are configured.

## References

- Vulnhuntr: https://github.com/protectai/vulnhuntr
