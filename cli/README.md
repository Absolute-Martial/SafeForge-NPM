# ForgeNPM Local CLI Preview

`forgenpm` is an unpublished local CLI preview for SafeForge NPM. The main product is still the web dashboard; this wrapper exists to prove the engine can support terminal workflows later.

It talks to a running SafeForge engine. It does not duplicate the scanner, store API keys, or replace the dashboard.

## Status

- Not published to npm
- Not available through `npm install -g`
- Not available through `npx`
- Intended for local development and future roadmap validation

Run it before a package decision if you are already working from the repo. Your future self may still need coffee, but at least the dependency report will be less mysterious.

## Local Quick Start

From the repo root:

```bash
npm --prefix cli install
npm --prefix cli run build
npm --prefix engine run build
node engine/dist/index.js
```

In another terminal:

```bash
node cli/dist/index.js doctor
node cli/dist/index.js scan lodash
```

If you link or package the CLI locally, the binary name is:

```bash
forgenpm doctor
forgenpm scan lodash
```

## Doctor

`doctor` checks whether the local CLI can reach the engine and whether Docker is available for sandbox work.

```bash
node cli/dist/index.js doctor
```

JSON output is available for scripts:

```bash
node cli/dist/index.js doctor --json
```

If Docker is missing, `doctor` will say so directly. Your shell history may still judge you; this command will not.

## Scan Preview

The preview scan command calls the same engine API used by the dashboard:

```bash
node cli/dist/index.js scan lodash
node cli/dist/index.js scan express@4.17.1 --depth 2 --mode balanced
node cli/dist/index.js scan lodash@4.17.15 --json
```

Useful local flags:

```text
--depth <0-5>                         Dependency scan depth
--mode <strict|balanced|research>     Security policy mode
--node <22,24>                        Node versions for package behavior checks
--json                                Print machine-readable output
--no-publish                          Skip registry publishing
--rescan                              Ignore a reusable published verdict
--api-url <url>                       SafeForge engine URL
--provider <name>                     Per-scan LLM provider label
--base-url <url>                      OpenAI-compatible base URL
--model <model>                       Per-scan LLM model
--api-key <key>                       Ephemeral per-scan LLM API key
```

Canonical flags also work: `--scan-depth`, `--security-mode`, and repeated `--node-version`.

## Roadmap

The CLI is deliberately small for now. Planned future work:

- Local developer CLI scanner
- GitHub Action integration
- npm proxy firewall
- Enterprise policy dashboard integration
