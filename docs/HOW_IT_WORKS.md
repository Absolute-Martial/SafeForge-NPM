# How SafeForge NPM Works

SafeForge NPM turns a package name into an evidence-backed risk report.

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

## 1. Package Resolution

The engine resolves the requested npm package and version, fetches metadata, and prepares an isolated workspace for analysis.

## 2. Dependency Graph

SafeForge builds a recursive dependency graph from a generated lockfile. Each package node records its name, version, depth, parent path, and dependency context.

This lets the report explain not only that a vulnerable package exists, but also how it entered the tree.

## 3. Vulnerability Checks

The engine checks known vulnerabilities with OSV as the primary matcher. GHSA and NVD data can enrich matched records with advisory details, CVE metadata, severity, fixed versions, and references.

## 4. Static Risk Analysis

The scanner inspects package files and metadata for risky signals:

- lifecycle scripts
- suspicious `bin` entrypoints
- `eval` and `Function`
- `child_process`
- filesystem access
- network libraries
- DNS usage
- dynamic require patterns
- obfuscation indicators

Static findings are useful signals, but they are stronger when corroborated by sandbox behavior or advisory evidence.

## 5. Sandbox Behavior Monitoring

SafeForge executes selected package behavior in Docker sandboxes and records runtime events. The sandbox looks for:

- web/API request attempts
- DNS lookups
- command execution
- child process spawning
- file writes
- environment variable access
- dynamic code execution
- crashes and timeouts

Observed high-risk behavior can directly increase the score and affect the verdict.

## 6. AI Reasoning

If enabled, AI reasoning summarizes suspicious evidence and explains why the behavior matters. It is used as an explanation layer and confidence signal, not as the only source of truth.

If LLM configuration is missing or disabled, SafeForge still runs deterministic advisory, static, and sandbox checks.

## 7. Policy and Verdict

SafeForge combines evidence into a 0-100 score:

```text
0-24     SAFE
25-49    REVIEW REQUIRED
50-74    HIGH RISK
75-100   BLOCK
```

The final report includes the score, verdict, recommended action, and evidence behind the decision.
