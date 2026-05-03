import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useAuditStore } from "../stores/auditStore";
import type { AppSettings, AuditStartOptions, NodeVersion, SecurityMode, SettingsResponse } from "../lib/types";

const API_BASE = import.meta.env.DEV ? "/api" : "";

const DEFAULT_SETTINGS: AppSettings = {
  llmEnabled: false,
  llmBackend: "openai_compatible",
  llmBaseUrl: "https://api.openai.com/v1",
  llmApiKey: "",
  llmApiKeyConfigured: false,
  triageModel: "gpt-4.1-mini",
  investigationModel: "gpt-4.1",
  testGenModel: "gpt-4.1",
  githubToken: "",
  githubTokenConfigured: false,
  nvdApiKey: "",
  nvdApiKeyConfigured: false,
  defaultNodeVersions: ["22", "24"],
  defaultScanDepth: 3,
  defaultSecurityMode: "balanced",
  cliBehaviorEnabled: true,
  aiScenariosEnabled: false,
  publishEnabled: true,
  sandboxImage: "node:24-slim",
  sandboxMemoryMb: 512,
  sandboxCpus: 1,
  sandboxNetwork: "none",
  maxDockerExecTimeoutSec: 30,
  runtimeRoot: "",
  runtimeHostRoot: "",
};

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

function mergePublicSettings(incoming: AppSettings): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...incoming,
    llmApiKey: "",
    githubToken: "",
    nvdApiKey: "",
    llmApiKeyConfigured: incoming.llmApiKeyConfigured ?? false,
    githubTokenConfigured: incoming.githubTokenConfigured ?? false,
    nvdApiKeyConfigured: incoming.nvdApiKeyConfigured ?? false,
    runtimeRoot: incoming.runtimeRoot ?? "",
    runtimeHostRoot: incoming.runtimeHostRoot ?? "",
  };
}

function buildSettingsPayload(settings: AppSettings): Partial<AppSettings> {
  const { llmApiKeyConfigured, githubTokenConfigured, nvdApiKeyConfigured, ...payload } = settings;
  if (!payload.llmApiKey?.trim()) delete payload.llmApiKey;
  if (!payload.githubToken?.trim()) delete payload.githubToken;
  if (!payload.nvdApiKey?.trim()) delete payload.nvdApiKey;
  return payload;
}

export function Dashboard() {
  const startAudit = useAuditStore((s) => s.startAudit);
  const isRunning = useAuditStore((s) => s.isRunning);
  const error = useAuditStore((s) => s.error);

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [configPath, setConfigPath] = useState("");
  const [input, setInput] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`${API_BASE}/settings`);
        if (!response.ok) {
          throw new Error(`Settings request failed (${response.status})`);
        }
        const payload = await response.json() as SettingsResponse;
        if (!active) return;
        setSettings(mergePublicSettings(payload.settings));
        setConfigPath(payload.configPath);
        setLoadError(null);
      } catch (fetchError) {
        if (!active) return;
        setLoadError(fetchError instanceof Error ? fetchError.message : "Failed to load settings");
      } finally {
        if (active) {
          setIsLoadingSettings(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const parsedInput = useMemo(() => parsePackageInput(input), [input]);
  const selectedNodeVersions = settings.defaultNodeVersions;
  const researchModeUnavailable = settings.defaultSecurityMode === "research" && !settings.llmEnabled;
  const canAudit = parsedInput.packageName.length > 0 && selectedNodeVersions.length > 0 && !isRunning && !isSavingSettings && !researchModeUnavailable;

  const scanOptions = useMemo<AuditStartOptions>(() => ({
    sandbox: {
      nodeVersions: settings.defaultNodeVersions,
      cliBehaviorEnabled: settings.cliBehaviorEnabled,
      aiScenariosEnabled: settings.aiScenariosEnabled,
    },
    publish: settings.publishEnabled,
    scanDepth: settings.defaultScanDepth,
    securityMode: settings.defaultSecurityMode,
  }), [settings]);

  const updateSettings = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaveMessage(null);
  };

  const handleNodeVersionToggle = (version: NodeVersion) => {
    setSettings((current) => {
      const exists = current.defaultNodeVersions.includes(version);
      return {
        ...current,
        defaultNodeVersions: exists
          ? current.defaultNodeVersions.filter((entry) => entry !== version)
          : [...current.defaultNodeVersions, version].sort() as NodeVersion[],
      };
    });
    setSaveMessage(null);
  };

  const persistSettings = async () => {
    setIsSavingSettings(true);
    setLoadError(null);
    setSaveMessage(null);
    try {
      const response = await fetch(`${API_BASE}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSettingsPayload(settings)),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `Settings save failed (${response.status})`);
      }
      const payload = await response.json() as SettingsResponse;
      setSettings(mergePublicSettings(payload.settings));
      setConfigPath(payload.configPath);
      setSaveMessage("Saved to settings.local.json");
      return true;
    } catch (saveError) {
      setLoadError(saveError instanceof Error ? saveError.message : "Failed to save settings");
      return false;
    } finally {
      setIsSavingSettings(false);
    }
  };

  const loadModels = async () => {
    setIsLoadingModels(true);
    setLoadError(null);
    try {
      const response = await fetch(`${API_BASE}/settings/models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backend: settings.llmBackend,
          baseUrl: settings.llmBaseUrl,
        }),
      });
      const payload = await response.json() as { models?: string[]; error?: string; warning?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Model discovery failed (${response.status})`);
      }
      setModels(payload.models ?? []);
      setSaveMessage(payload.models?.length ? `Loaded ${payload.models.length} models` : (payload.warning ?? "No models returned"));
    } catch (modelError) {
      setLoadError(modelError instanceof Error ? modelError.message : "Failed to load models");
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canAudit) return;
    const saved = await persistSettings();
    if (!saved) return;
    await startAudit(parsedInput.packageName, parsedInput.version, scanOptions);
  };

  if (isLoadingSettings) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ padding: 24 }}>
        <div style={{ fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
          Loading scanner settings...
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1"
      style={{
        padding: "28px 20px 40px",
      }}
    >
      <div
        style={{
          width: "min(1280px, 100%)",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
          gap: 18,
          alignItems: "start",
        }}
      >
        <section
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div className="flex items-start justify-between gap-4" style={{ flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <h1
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  letterSpacing: 0,
                }}
              >
                Settings
              </h1>
              <p
                style={{
                  color: "var(--text-dim)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.77rem",
                  lineHeight: 1.65,
                  maxWidth: 620,
                }}
              >
                SafeForge stores local engine configuration in <span style={{ color: "var(--text)" }}>{configPath || "settings.local.json"}</span>.
                Keep LLM disabled for database and deterministic checks only, or enable an OpenAI-compatible provider for deeper reasoning.
              </p>
            </div>

            <div className="flex items-center gap-10" style={{ flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void persistSettings()}
                disabled={isSavingSettings}
                style={primaryButtonStyle}
              >
                {isSavingSettings ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>

          {(loadError || saveMessage || error) && (
            <div
              style={{
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${loadError || error ? "var(--danger)" : "var(--safe)"}`,
                background: loadError || error ? "var(--danger-bg)" : "var(--safe-bg)",
                color: loadError || error ? "var(--danger)" : "var(--safe)",
                padding: "10px 12px",
                fontFamily: "var(--font-mono)",
                fontSize: "0.74rem",
              }}
            >
              {loadError ?? error ?? saveMessage}
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: 12,
            }}
          >
            <SettingToggle
              label="Enable LLM reasoning"
              detail="Turns on triage, investigation, test generation, and verification."
              checked={settings.llmEnabled}
              onChange={(value) => updateSettings("llmEnabled", value)}
            />
            <SettingToggle
              label="CLI behavior sandbox"
              detail="Runs package CLI commands in isolated Docker sandboxes."
              checked={settings.cliBehaviorEnabled}
              onChange={(value) => updateSettings("cliBehaviorEnabled", value)}
            />
            <SettingToggle
              label="Auto publish"
              detail="Publishes fresh scan results when publish infrastructure is configured."
              checked={settings.publishEnabled}
              onChange={(value) => updateSettings("publishEnabled", value)}
            />
          </div>

          <SectionTitle title="Scan Policy" detail="These defaults are applied to web scans and CLI requests unless overridden." />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              alignItems: "start",
            }}
          >
            <Field label={`Scan depth (${settings.defaultScanDepth})`}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={1}
                  value={settings.defaultScanDepth}
                  onChange={(event) => updateSettings("defaultScanDepth", Number(event.target.value))}
                />
                <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.68rem", lineHeight: 1.5 }}>
                  {scanDepthLabel(settings.defaultScanDepth)}
                </span>
              </div>
            </Field>

            <Field label="Security mode">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(["strict", "balanced", "research"] as SecurityMode[]).map((mode) => {
                  const selected = settings.defaultSecurityMode === mode;
                  const disabled = mode === "research" && !settings.llmEnabled;
                  return (
                    <button
                      key={mode}
                      type="button"
                      disabled={disabled}
                      onClick={() => updateSettings("defaultSecurityMode", mode)}
                      style={{
                        ...segmentedButtonStyle,
                        borderColor: selected ? "var(--accent)" : "var(--border)",
                        background: selected ? "var(--accent-bg)" : "transparent",
                        color: disabled ? "var(--text-muted)" : "var(--text)",
                        opacity: disabled ? 0.55 : 1,
                      }}
                    >
                      {modeLabel(mode)}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          <SectionTitle title="LLM Provider" detail="Server-side defaults for OpenAI-compatible reasoning." />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <Field label="Backend">
              <select
                value={settings.llmBackend}
                onChange={(event) => updateSettings("llmBackend", event.target.value as AppSettings["llmBackend"])}
                style={inputStyle}
              >
                <option value="openai_compatible">OpenAI compatible</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </Field>

            <Field label="Base URL">
              <input
                type="url"
                value={settings.llmBaseUrl}
                onChange={(event) => updateSettings("llmBaseUrl", event.target.value)}
                placeholder="https://api.openai.com/v1"
                style={inputStyle}
                disabled={!settings.llmEnabled}
              />
            </Field>

            <Field label="API key">
              <input
                type="password"
                value={settings.llmApiKey ?? ""}
                onChange={(event) => updateSettings("llmApiKey", event.target.value)}
                placeholder={settings.llmApiKeyConfigured ? "Saved server-side; enter a new key to replace" : "sk-..."}
                autoComplete="off"
                style={inputStyle}
                disabled={!settings.llmEnabled}
              />
            </Field>

            <Field label="Load model list">
              <button
                type="button"
                onClick={() => void loadModels()}
                disabled={!settings.llmEnabled || settings.llmBackend !== "openai_compatible" || isLoadingModels}
                style={secondaryButtonStyle}
              >
                {isLoadingModels ? "Loading..." : "Fetch /models"}
              </button>
            </Field>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <ModelField
              label="Triage model"
              value={settings.triageModel}
              models={models}
              disabled={!settings.llmEnabled}
              onChange={(value) => updateSettings("triageModel", value)}
            />
            <ModelField
              label="Investigation model"
              value={settings.investigationModel}
              models={models}
              disabled={!settings.llmEnabled}
              onChange={(value) => updateSettings("investigationModel", value)}
            />
            <ModelField
              label="Test generation model"
              value={settings.testGenModel}
              models={models}
              disabled={!settings.llmEnabled}
              onChange={(value) => updateSettings("testGenModel", value)}
            />
          </div>

          <SectionTitle title="Vulnerability Intelligence" detail="Optional enrichment tokens for advisory scanning." />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <Field label="GitHub advisory token">
              <input
                type="password"
                value={settings.githubToken ?? ""}
                onChange={(event) => updateSettings("githubToken", event.target.value)}
                placeholder={settings.githubTokenConfigured ? "Saved server-side; enter a new token to replace" : "ghp_..."}
                autoComplete="off"
                style={inputStyle}
              />
            </Field>
            <Field label="NVD API key">
              <input
                type="password"
                value={settings.nvdApiKey ?? ""}
                onChange={(event) => updateSettings("nvdApiKey", event.target.value)}
                placeholder={settings.nvdApiKeyConfigured ? "Saved server-side; enter a new key to replace" : "NVD key"}
                autoComplete="off"
                style={inputStyle}
              />
            </Field>
          </div>

          <SectionTitle title="Sandbox Defaults" detail="Native SafeForge CLI behavior testing settings." />
          <div className="flex items-center gap-10" style={{ flexWrap: "wrap" }}>
            <CheckboxChip
              label="Node 22"
              checked={settings.defaultNodeVersions.includes("22")}
              onChange={() => handleNodeVersionToggle("22")}
            />
            <CheckboxChip
              label="Node 24"
              checked={settings.defaultNodeVersions.includes("24")}
              onChange={() => handleNodeVersionToggle("24")}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            <Field label="Sandbox image">
              <input
                type="text"
                value={settings.sandboxImage}
                onChange={(event) => updateSettings("sandboxImage", event.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Sandbox memory (MB)">
              <input
                type="number"
                min={64}
                max={4096}
                value={settings.sandboxMemoryMb}
                onChange={(event) => updateSettings("sandboxMemoryMb", Number(event.target.value))}
                style={inputStyle}
              />
            </Field>
            <Field label="Sandbox CPUs">
              <input
                type="number"
                min={0.25}
                max={4}
                step={0.25}
                value={settings.sandboxCpus}
                onChange={(event) => updateSettings("sandboxCpus", Number(event.target.value))}
                style={inputStyle}
              />
            </Field>
            <Field label="Sandbox network">
              <input
                type="text"
                value={settings.sandboxNetwork}
                onChange={(event) => updateSettings("sandboxNetwork", event.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Docker exec timeout (sec)">
              <input
                type="number"
                min={5}
                max={300}
                value={settings.maxDockerExecTimeoutSec}
                onChange={(event) => updateSettings("maxDockerExecTimeoutSec", Number(event.target.value))}
                style={inputStyle}
              />
            </Field>
            <Field label="Runtime root">
              <input
                type="text"
                value={settings.runtimeRoot ?? ""}
                onChange={(event) => updateSettings("runtimeRoot", event.target.value)}
                placeholder="/tmp/safeforge-npm-runtime"
                style={inputStyle}
              />
            </Field>
          </div>
        </section>

        <aside
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius)",
            padding: 18,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            position: "sticky",
            top: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "1.1rem",
                fontWeight: 700,
                letterSpacing: 0,
              }}
            >
              Start Scan
            </h2>
            <p style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: "0.74rem", lineHeight: 1.65 }}>
              {settings.llmEnabled
                ? "Deep analysis is enabled. The engine will use saved provider settings plus deterministic checks."
                : "LLM reasoning is off. SafeForge will return database and deterministic scan results only."}
            </p>
            {researchModeUnavailable && (
              <p style={{ color: "var(--danger)", fontFamily: "var(--font-mono)", fontSize: "0.72rem", lineHeight: 1.55 }}>
                Research mode requires LLM configuration. Enable LLM reasoning or switch back to Strict or Balanced.
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-12">
            <Field label="Package spec">
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="event-stream@3.3.6"
                autoFocus
                style={inputStyle}
              />
            </Field>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <MetricCard label="LLM mode" value={settings.llmEnabled ? "Enabled" : "Disabled"} tone={settings.llmEnabled ? "accent" : "neutral"} />
              <MetricCard label="CLI sandbox" value={settings.cliBehaviorEnabled ? "On" : "Off"} tone={settings.cliBehaviorEnabled ? "accent" : "neutral"} />
              <MetricCard label="Node targets" value={settings.defaultNodeVersions.join(", ")} tone="neutral" />
              <MetricCard label="Depth" value={String(settings.defaultScanDepth)} tone="neutral" />
              <MetricCard label="Security mode" value={modeLabel(settings.defaultSecurityMode)} tone={settings.defaultSecurityMode === "balanced" ? "neutral" : "accent"} />
              <MetricCard label="Publish" value={settings.publishEnabled ? "Auto" : "Off"} tone="neutral" />
            </div>

            <button type="submit" disabled={!canAudit} style={primaryButtonStyle}>
              {isRunning ? "Auditing..." : "Save And Audit"}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <h3
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "0.98rem",
          letterSpacing: 0,
        }}
      >
        {title}
      </h3>
      <p style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.7rem", lineHeight: 1.6 }}>
        {detail}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function SettingToggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-primary, transparent)",
        cursor: "pointer",
      }}
    >
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontWeight: 600, fontSize: "0.84rem" }}>{label}</span>
        <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.68rem", lineHeight: 1.5 }}>
          {detail}
        </span>
      </div>
    </label>
  );
}

function CheckboxChip({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: "999px",
        border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
        background: checked ? "var(--accent-bg)" : "transparent",
        cursor: "pointer",
        fontFamily: "var(--font-mono)",
        fontSize: "0.78rem",
      }}
    >
      <input type="checkbox" checked={checked} onChange={onChange} />
      {label}
    </label>
  );
}

function ModelField({
  label,
  value,
  models,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  models: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <select value={models.includes(value) ? value : "__custom__"} onChange={(event) => {
          if (event.target.value !== "__custom__") {
            onChange(event.target.value);
          }
        }} disabled={disabled} style={inputStyle}>
          {models.length === 0 && <option value="__custom__">Custom model</option>}
          {models.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
          <option value="__custom__">Custom model</option>
        </select>
        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter model id"
          disabled={disabled}
          style={inputStyle}
        />
      </div>
    </Field>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: "accent" | "neutral" }) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "10px 12px",
        background: tone === "accent" ? "var(--accent-bg)" : "transparent",
        minHeight: 72,
      }}
    >
      <div style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.68rem", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: "var(--font-heading)", fontSize: "0.98rem", fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

function scanDepthLabel(depth: number) {
  if (depth === 0) return "0 = root package only";
  if (depth === 1) return "1 = direct dependencies only";
  return `${depth} = progressively deeper transitive scanning`;
}

function modeLabel(mode: SecurityMode) {
  return mode === "strict" ? "Strict" : mode === "balanced" ? "Balanced" : "Research";
}

const inputStyle: CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  padding: "10px 12px",
  color: "var(--text)",
  fontFamily: "var(--font-mono)",
  width: "100%",
};

const primaryButtonStyle: CSSProperties = {
  padding: "10px 16px",
  border: "none",
  borderRadius: "var(--radius)",
  background: "var(--accent)",
  color: "#fff",
  fontWeight: 700,
  fontSize: "0.8rem",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
};

const secondaryButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
};

const segmentedButtonStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: "var(--radius-sm)",
  border: "1px solid var(--border)",
  background: "transparent",
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: "0.74rem",
};
