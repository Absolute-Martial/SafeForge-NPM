import { useMemo, useState } from "react";
import { useAuditStore } from "../stores/auditStore";
import type { AuditStartOptions } from "../lib/types";

const PROVIDER_PRESETS = {
  openai: { label: "OpenAI", providerName: "openai", baseUrl: "https://api.openai.com/v1" },
  openrouter: { label: "OpenRouter", providerName: "openrouter", baseUrl: "https://openrouter.ai/api/v1" },
  groq: { label: "Groq", providerName: "groq", baseUrl: "https://api.groq.com/openai/v1" },
  custom: { label: "Custom", providerName: "custom", baseUrl: "" },
} as const;

function parsePackageInput(input: string): { packageName: string; version?: string } {
  const trimmed = input.trim();
  if (!trimmed) return { packageName: "" };

  if (trimmed.startsWith("@")) {
    const secondAt = trimmed.indexOf("@", 1);
    if (secondAt > 0) {
      return {
        packageName: trimmed.slice(0, secondAt),
        version: trimmed.slice(secondAt + 1) || undefined,
      };
    }
    return { packageName: trimmed };
  }

  const [packageName, version] = trimmed.split("@");
  return { packageName, version: version || undefined };
}

export function Dashboard() {
  const startAudit = useAuditStore((s) => s.startAudit);
  const isRunning = useAuditStore((s) => s.isRunning);
  const error = useAuditStore((s) => s.error);

  const [input, setInput] = useState("");
  const [providerPreset, setProviderPreset] = useState<keyof typeof PROVIDER_PRESETS>("openai");
  const [baseUrl, setBaseUrl] = useState<string>(PROVIDER_PRESETS.openai.baseUrl);
  const [model, setModel] = useState("gpt-4.1-mini");
  const [apiKey, setApiKey] = useState("");
  const [node20, setNode20] = useState(true);
  const [node22, setNode22] = useState(true);

  const parsedInput = useMemo(() => parsePackageInput(input), [input]);

  const scanOptions = useMemo<AuditStartOptions>(() => {
    const preset = PROVIDER_PRESETS[providerPreset];
    const llm = {
      providerName: preset.providerName,
      baseUrl: baseUrl.trim() || preset.baseUrl,
      apiKey: apiKey.trim() || undefined,
      model: model.trim() || undefined,
    };

    return {
      llm: llm.baseUrl || llm.apiKey || llm.model || llm.providerName ? llm : undefined,
      sandbox: {
        nodeVersions: [node20 ? "20" : null, node22 ? "22" : null].filter(Boolean) as Array<"20" | "22">,
        cliBehaviorEnabled: true,
        aiScenariosEnabled: false,
      },
    };
  }, [apiKey, baseUrl, model, node20, node22, providerPreset]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedInput.packageName || (!node20 && !node22)) return;
    startAudit(parsedInput.packageName, parsedInput.version, scanOptions);
  };

  const applyPreset = (presetKey: keyof typeof PROVIDER_PRESETS) => {
    setProviderPreset(presetKey);
    setBaseUrl(PROVIDER_PRESETS[presetKey].baseUrl);
  };

  return (
    <div
      className="flex-1 flex flex-col items-center justify-start gap-6"
      style={{ padding: "48px 20px 80px" }}
    >
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "1.6rem",
          letterSpacing: 0,
        }}
      >
        SafeForge NPM
      </h2>

      <p
        style={{
          color: "var(--text-dim)",
          fontSize: "0.85rem",
          fontFamily: "var(--font-mono)",
          maxWidth: 540,
          textAlign: "center",
          lineHeight: 1.7,
        }}
      >
        Audit an npm package before installation with recursive dependency analysis, provider-agnostic AI triage,
        and CLI behavior monitoring across isolated Node sandboxes.
      </p>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        style={{
          width: "min(720px, 100%)",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius)",
          padding: 18,
        }}
      >
        <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. eslint or @scope/pkg@1.2.3"
            autoFocus
            style={{
              background: "var(--bg-primary)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius)",
              padding: "10px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: "0.9rem",
              color: "var(--text)",
              flex: 1,
              minWidth: 260,
              outline: "none",
            }}
          />
          <button
            type="submit"
            disabled={!parsedInput.packageName || isRunning || (!node20 && !node22)}
            className="disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              padding: "10px 20px",
              border: "none",
              borderRadius: "var(--radius)",
              background: "var(--accent)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
              fontFamily: "var(--font-mono)",
            }}
          >
            {isRunning ? "Auditing..." : "Audit"}
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              Provider
            </span>
            <select
              value={providerPreset}
              onChange={(e) => applyPreset(e.target.value as keyof typeof PROVIDER_PRESETS)}
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 12px",
                color: "var(--text)",
              }}
            >
              {Object.entries(PROVIDER_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>{preset.label}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              Base URL
            </span>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 12px",
                color: "var(--text)",
                fontFamily: "var(--font-mono)",
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              Model
            </span>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4.1-mini"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 12px",
                color: "var(--text)",
                fontFamily: "var(--font-mono)",
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              API Key
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Used only for this scan"
              autoComplete="off"
              style={{
                background: "var(--bg-primary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "10px 12px",
                color: "var(--text)",
                fontFamily: "var(--font-mono)",
              }}
            />
          </label>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            borderTop: "1px solid var(--border)",
            paddingTop: 12,
          }}
        >
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            Sandbox Node versions
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "var(--text-dim)" }}>
            <input type="checkbox" checked={node20} onChange={(e) => setNode20(e.target.checked)} />
            Node 20
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", color: "var(--text-dim)" }}>
            <input type="checkbox" checked={node22} onChange={(e) => setNode22(e.target.checked)} />
            Node 22
          </label>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "auto" }}>
            CLI behavior tests run with `--help`, `--version`, and no args.
          </span>
        </div>
      </form>

      {error && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.85rem",
            color: "var(--danger)",
            maxWidth: 640,
            textAlign: "center",
            background: "rgba(255,60,60,0.08)",
            border: "1px solid var(--danger)",
            borderRadius: "var(--radius)",
            padding: "14px 20px",
          }}
        >
          <p style={{ marginBottom: 8 }}>{error}</p>
          <button
            onClick={() => {
              if (parsedInput.packageName && (node20 || node22)) {
                startAudit(parsedInput.packageName, parsedInput.version, scanOptions);
              }
            }}
            style={{
              padding: "6px 16px",
              border: "1px solid var(--danger)",
              borderRadius: "var(--radius)",
              background: "none",
              color: "var(--danger)",
              fontWeight: 600,
              fontSize: "0.75rem",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
            }}
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
