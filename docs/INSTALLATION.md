# Installation and Setup

SafeForge NPM is designed to run as a web dashboard backed by the TypeScript engine. The recommended demo path is Docker Compose because it runs the frontend and engine together and gives the engine access to Docker for sandbox scans.

## Requirements

- Node.js 22 or newer
- Docker
- Docker Compose
- Optional: OpenAI-compatible LLM API key
- Optional: GitHub token for GHSA enrichment
- Optional: NVD API key for CVE enrichment

## Recommended Run Path

From the repository root:

```bash
docker compose up --build
```

Open:

```text
http://127.0.0.1:8000
```

The Compose service builds the frontend, serves it through the engine container, mounts the Docker socket for sandbox execution, and uses a shared runtime directory for scan workspaces.

## Local Development

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

Build all project parts:

```bash
npm run build
```

## First Scan

1. Open the dashboard.
2. Configure optional settings.
3. Enter a package such as:

```text
is-number@7.0.0
lodash@4.17.15
express@4.17.1
```

4. Start the scan.
5. Review the final verdict, advisories, dependency graph, static findings, and sandbox behavior.

## Optional Configuration

LLM reasoning is optional. If no LLM is configured, SafeForge can still run dependency, advisory, static, and sandbox checks.

Common environment variables:

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

The web settings page can also write local settings to `settings.local.json`.

## Local CLI Preview

The repository includes an unpublished local CLI preview in `cli/`. It is not the primary product surface and is not published to npm.

```bash
npm --prefix cli install
npm --prefix cli run build
node cli/dist/index.js doctor
node cli/dist/index.js scan lodash
```

If linked locally, the binary name is `forgenpm`.
