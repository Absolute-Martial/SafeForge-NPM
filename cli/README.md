# SafeForge CLI

`safenpm` is the terminal wrapper for SafeForge NPM. Run it before `npm install` so your future self does not have to become a detective at 2 AM.

The CLI talks to a running SafeForge engine. It does not duplicate the scanner; it streams the same dependency, advisory, sandbox, and evidence-backed verdict flow you see in the web app.

## Quick Start

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

After packaging or linking the CLI, the command is:

```bash
safenpm doctor
safenpm scan lodash
```

## Doctor

`doctor` checks whether the local CLI can reach the engine and whether Docker is available for the sandbox work.

```bash
safenpm doctor
```

If Docker is missing, `doctor` will say so politely. Unlike your shell history.

Use JSON when a script needs the answer:

```bash
safenpm doctor --json
```

## Scan

The main command is:

```bash
safenpm scan <package>
```

Examples:

```bash
safenpm scan lodash
safenpm scan express@4.17.1
safenpm scan eslint --depth 2
safenpm scan prettier --mode strict
```

Friendly aliases are supported:

```bash
safenpm scan express@4.17.1 --depth 2 --mode balanced --node 22,24
```

Canonical flags also keep working:

```bash
safenpm scan express@4.17.1 --scan-depth 2 --security-mode balanced --node-version 22 --node-version 24
```

## Useful Flags

```text
--depth <0-5>                         Dependency scan depth
--mode <strict|balanced|research>     Security policy mode
--node <22,24>                        Node versions for CLI behavior checks
--json                                Print machine-readable output
--no-publish                          Skip registry publishing
--rescan                              Ignore a reusable published verdict
--api-url <url>                       SafeForge engine URL
--provider <name>                     Per-scan LLM provider label
--base-url <url>                      OpenAI-compatible base URL
--model <model>                       Per-scan LLM model
--api-key <key>                       Ephemeral per-scan LLM API key
```

## JSON And CI

Use `--json` for automation:

```bash
safenpm scan lodash@4.17.15 --depth 1 --json
```

The CLI exits with:

```text
0  SAFE
1  REVIEW REQUIRED
2  HIGH RISK or BLOCK
```

A basic CI check can look like:

```bash
safenpm scan express@4.17.1 --mode strict --depth 2 --json
```

If the package is spicy, CI gets a non-zero exit and you get a report instead of a surprise.

## Current Commands

Available now:

```text
safenpm scan <package>
safenpm doctor
```

Planned later:

```text
safenpm scan-lock
safenpm report <scan-id>
safenpm config
safenpm install
```

Those future commands are intentionally not stubbed here yet. Empty commands are like empty promises, and we are trying to be better than `left-pad` week.
