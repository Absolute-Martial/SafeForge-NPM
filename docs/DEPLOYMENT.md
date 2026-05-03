# Docker Compose Deployment

SafeForge NPM can be deployed as a Docker Compose application. Use the deployment-oriented compose file:

```text
compose.deploy.yaml
```

The normal `compose.yaml` is kept for local development.

## Why There Is A Deployment Compose File

SafeForge sandbox scans start sibling Docker containers. For that to work on a server, the app container needs:

- access to `/var/run/docker.sock`
- a runtime directory mounted into the app container
- the same runtime directory path visible to the host Docker daemon

That is why `compose.deploy.yaml` uses `SAFEFORGE_NPM_RUNTIME_HOST_ROOT`.

## Server Setup

1. Create a Docker Compose app from this repository.
2. Use this compose file:

```text
compose.deploy.yaml
```

3. Route your domain or reverse proxy to service `app` on port `8000`.
4. Add the environment variables below.
5. Deploy the service.

## Required Environment Variables

Set these on the server:

```bash
SAFEFORGE_NPM_RUNTIME_HOST_ROOT=/var/lib/safeforge-npm/runtime
SAFEFORGE_NPM_PUBLIC_PORT=8000
SAFEFORGE_NPM_SANDBOX_NETWORK=none
SAFEFORGE_NPM_PUBLISH_ENABLED=false
```

Create the runtime directory on the host:

```bash
sudo mkdir -p /var/lib/safeforge-npm/runtime
```

The compose file uses `env_file: .env`, so standard Compose environment files work.

## Optional Environment Variables

For AI-assisted reasoning:

```bash
SAFEFORGE_NPM_LLM_ENABLED=true
SAFEFORGE_NPM_LLM_BACKEND=openai_compatible
SAFEFORGE_NPM_LLM_BASE_URL=https://api.openai.com/v1
SAFEFORGE_NPM_LLM_API_KEY=your_key
SAFEFORGE_NPM_TRIAGE_MODEL=gpt-4.1-mini
SAFEFORGE_NPM_INVESTIGATION_MODEL=gpt-4.1
SAFEFORGE_NPM_TEST_GEN_MODEL=gpt-4.1
```

For advisory enrichment:

```bash
SAFEFORGE_NPM_GITHUB_TOKEN=your_github_token
SAFEFORGE_NPM_NVD_API_KEY=your_nvd_key
```

LLM configuration is optional. Without it, SafeForge still runs dependency, advisory, static, and sandbox checks.

## Sandbox Requirements

The app image includes the Docker CLI, but it uses the host Docker daemon through:

```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

This is required for Docker-based sandbox behavior monitoring.

If the Docker socket is not available or the runtime host path is wrong, package scans can still show metadata/advisory/static results, but sandbox behavior checks may be skipped or fail.

## Safer Fallback Mode

If you want to deploy the dashboard without sandbox execution first, set:

```bash
SAFEFORGE_NPM_CLI_BEHAVIOR_ENABLED=false
```

That lets the web dashboard run advisory and static analysis without launching sibling Docker containers. Re-enable sandbox monitoring after the Docker socket and runtime path are confirmed.

## Health Check

After deployment, open:

```text
https://your-domain.example.com/health
```

Expected response:

```json
{"ok":true}
```

Then open the root URL and run a small package scan:

```text
is-number@7.0.0
```
