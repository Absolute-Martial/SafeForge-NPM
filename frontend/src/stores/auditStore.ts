import { create } from "zustand";
import type {
  FileRecord,
  FileVerdict,
  FileStatus,
  PhaseInfo,
  AgentStep,
  Finding,
  FocusArea,
  Proof,
  CliBehaviorReport,
  AuditStartOptions,
  SSEEvent,
  PipelineLogEntry,
  InventoryMeta,
  DependencyGraphReport,
  AdvisoryRecord,
  AdvisorySummary,
  ScanWarning,
  AuditReport,
  Verdict,
} from "../lib/types";
import { PHASE_ORDER, PHASE_LABELS } from "../lib/types";
const API_BASE = import.meta.env.DEV ? "/api" : "";
const STORAGE_AUDIT_ID = "safeforge_npm_auditId";
const STORAGE_PACKAGE_NAME = "safeforge_npm_packageName";

interface AuditState {
  // Audit session
  auditId: string | null;
  packageName: string;
  isRunning: boolean;

  // Pipeline state
  phase: string | null;
  phases: PhaseInfo[];

  // File tree
  files: FileRecord[];
  fileStatuses: Record<string, FileStatus>;
  fileVerdicts: Record<string, FileVerdict>;

  // Triage
  riskScore: number | null;
  riskSummary: string | null;
  focusAreas: FocusArea[];

  // Pipeline activity (early phases)
  pipelineLog: PipelineLogEntry[];

  // Investigation
  agentSteps: AgentStep[];
  findings: Finding[];

  // Verdict
  verdict: Verdict | null;
  finalScore: number | null;
  recommendedAction: string | null;
  capabilities: string[];
  proofCount: number;
  proofs: Proof[];
  cliBehavior: CliBehaviorReport | null;
  dependencyGraph: DependencyGraphReport | null;
  advisories: AdvisoryRecord[];
  advisorySummary: AdvisorySummary | null;
  scanWarnings: ScanWarning[];

  // Inventory metadata
  inventoryMeta: InventoryMeta | null;

  // UI state
  selectedFile: string | null;
  selectedFileContent: string | null;
  autoFollow: boolean;
  error: string | null;

  // Animation state
  agentThinking: boolean;
  triageProgress: { current: number; total: number } | null;

  // Actions
  startAudit: (packageName: string, version?: string, options?: AuditStartOptions) => Promise<void>;
  connectToSession: (auditId: string) => Promise<void>;
  handleEvent: (event: SSEEvent) => void;
  selectFile: (path: string) => Promise<void>;
  reset: () => void;
}

const initialState = {
  auditId: null,
  packageName: "",
  isRunning: false,
  phase: null,
  phases: PHASE_ORDER.map((name) => ({ name, status: "pending" as const })),
  files: [],
  fileStatuses: {},
  fileVerdicts: {},
  riskScore: null,
  riskSummary: null,
  focusAreas: [],
  pipelineLog: [],
  agentSteps: [],
  findings: [],
  verdict: null,
  finalScore: null,
  recommendedAction: null,
  capabilities: [],
  proofCount: 0,
  proofs: [],
  cliBehavior: null,
  dependencyGraph: null,
  advisories: [],
  advisorySummary: null,
  scanWarnings: [],
  inventoryMeta: null,
  selectedFile: null,
  selectedFileContent: null,
  autoFollow: true,
  error: null,
  agentThinking: false,
  triageProgress: null,
};

let activeEventSource: EventSource | null = null;
let activeFileAbort: AbortController | null = null;
// Per-connection seen-set; replaced on every connectSSE call so replays are always fresh
let seenEventSeqs = new Set<number>();

function connectSSE(
  auditId: string,
  set: (partial: Partial<AuditState>) => void,
  get: () => AuditState,
) {
  // Close any existing connection first (guards against React Strict Mode double-fire)
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
  // Fresh dedup set per connection — replayed events from the server always start at seq 0
  seenEventSeqs = new Set();
  const es = new EventSource(`${API_BASE}/audit/${auditId}/events`);
  activeEventSource = es;

  const handler = (e: MessageEvent) => {
    try {
      const event = JSON.parse(e.data) as SSEEvent;
      get().handleEvent(event);
    } catch (err) {
      console.warn("Malformed SSE event, skipping:", err);
    }
  };

  const eventTypes = [
    "audit_started", "phase_started", "phase_completed",
    "file_list", "file_analyzing", "file_verdict",
    "triage_complete", "triage_progress", "inventory_meta",
    "agent_thinking", "agent_tool_call", "agent_tool_result",
    "agent_reasoning", "finding_discovered",
    "verify_started", "verify_test_result",
    "cli_behavior_started", "cli_command_result",
    "dependency_graph_ready", "advisory_scan_started", "advisory_match", "advisory_summary",
    "publish_complete", "publish_failed", "audit_complete",
    "verdict_reached", "audit_error",
  ] as const;
  for (const type of eventTypes) {
    es.addEventListener(type, handler);
  }

  es.onerror = () => {
    es.close();
    activeEventSource = null;
    if (get().isRunning) {
      set({ isRunning: false, error: "Lost connection to audit engine" });
    }
  };
}

export const useAuditStore = create<AuditState>((set, get) => ({
  ...initialState,

  reset: () => {
    if (activeEventSource) {
      activeEventSource.close();
      activeEventSource = null;
    }
    sessionStorage.removeItem(STORAGE_AUDIT_ID);
    sessionStorage.removeItem(STORAGE_PACKAGE_NAME);
    // seenEventSeqs is reset inside connectSSE on every new connection — no need to clear here
    set({ ...initialState, phases: PHASE_ORDER.map((name) => ({ name, status: "pending" as const })) });
  },

  startAudit: async (packageName: string, version?: string, options?: AuditStartOptions) => {
    get().reset();
    set({ packageName, isRunning: true });

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/audit/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageName,
          ...(version && { version }),
          ...(options?.llm ? { llm: options.llm } : {}),
          ...(options?.sandbox ? { sandbox: options.sandbox } : {}),
          ...(typeof options?.publish === "boolean" ? { publish: options.publish } : {}),
          ...(typeof options?.scanDepth === "number" ? { scanDepth: options.scanDepth } : {}),
          ...(options?.securityMode ? { securityMode: options.securityMode } : {}),
        }),
      });
    } catch {
      set({ isRunning: false, error: "Failed to connect to audit engine" });
      return;
    }

    if (!res.ok) {
      let msg = `Engine returned ${res.status}`;
      try {
        const body = await res.json();
        if (body.error) msg = body.error;
      } catch { /* ignore */ }
      set({ isRunning: false, error: msg });
      return;
    }

    let auditId: string;
    try {
      const body = await res.json();
      auditId = body.auditId;
    } catch {
      set({ isRunning: false, error: "Invalid response from engine" });
      return;
    }
    set({ auditId });
    sessionStorage.setItem(STORAGE_AUDIT_ID, auditId);
    sessionStorage.setItem(STORAGE_PACKAGE_NAME, packageName);

    connectSSE(auditId, set, get);
  },

  connectToSession: async (auditId: string) => {
    get().reset();
    const savedName = sessionStorage.getItem(STORAGE_PACKAGE_NAME) || "";
    set({ auditId, isRunning: true, packageName: savedName });

    // Check if session exists before connecting SSE
    try {
      const res = await fetch(`${API_BASE}/audit/${auditId}/report`);
      if (!res.ok) {
        // Session gone — clear stale storage and go back to landing silently
        sessionStorage.removeItem(STORAGE_AUDIT_ID);
        set({ auditId: null, isRunning: false });
        if (window.location.pathname !== "/") {
          history.replaceState(null, "", "/");
        }
        return;
      }
    } catch {
      sessionStorage.removeItem(STORAGE_AUDIT_ID);
      set({ auditId: null, isRunning: false });
      return;
    }

    sessionStorage.setItem(STORAGE_AUDIT_ID, auditId);
    connectSSE(auditId, set, get);
  },

  handleEvent: (event: SSEEvent) => {
    // Deduplicate: skip events we've already processed (guards against SSE replay + Strict Mode)
    // Use server-assigned seq (buffer index) — unique even for same-millisecond events
    const seq = (event as { seq?: number }).seq;
    if (seq !== undefined) {
      if (seenEventSeqs.has(seq)) return;
      seenEventSeqs.add(seq);
    }

    const state = get();

    switch (event.type) {
      case "phase_started": {
        set({
          phase: event.phase,
          phases: state.phases.map((p) =>
            p.name === event.phase ? { ...p, status: "active" } : p
          ),
          pipelineLog: [...state.pipelineLog, {
            kind: "phase" as const,
            text: PHASE_LABELS[event.phase] || event.phase,
            timestamp: event.timestamp,
          }],
        });
        break;
      }

      case "phase_completed": {
        set({
          phases: state.phases.map((p) =>
            p.name === event.phase ? { ...p, status: "done", durationMs: event.durationMs } : p
          ),
        });
        break;
      }

      case "file_list": {
        const statuses: Record<string, FileStatus> = {};
        for (const f of event.files) {
          statuses[f.path] = "pending";
        }
        const dirs = new Set(
          event.files.map((f) => f.path.split("/").slice(0, -1).join("/")).filter(Boolean)
        );
        set({
          files: event.files,
          fileStatuses: statuses,
          pipelineLog: [...state.pipelineLog, {
            kind: "info" as const,
            text: `Found ${event.files.length} files${dirs.size > 0 ? ` across ${dirs.size} directories` : ""}`,
            timestamp: event.timestamp,
          }],
        });
        break;
      }

      case "file_analyzing": {
        set({
          fileStatuses: { ...state.fileStatuses, [event.file]: "analyzing" },
          pipelineLog: [...state.pipelineLog, {
            kind: "file-scan" as const,
            text: event.file,
            file: event.file,
            timestamp: event.timestamp,
          }],
        });
        // Auto-follow: open file in viewer during triage
        if (state.autoFollow && state.phase === "triage") {
          get().selectFile(event.file);
        }
        break;
      }

      case "file_verdict": {
        const { verdict } = event;
        const status: FileStatus =
          verdict.riskContribution >= 5 ? "dangerous" :
            verdict.riskContribution >= 3 ? "suspicious" : "safe";
        const pipelineLog = verdict.riskContribution >= 3
          ? [...state.pipelineLog, {
            kind: "file-flag" as const,
            text: verdict.summary || `Risk ${verdict.riskContribution}/10`,
            file: verdict.file,
            risk: verdict.riskContribution,
            timestamp: event.timestamp,
          }]
          : state.pipelineLog;
        set({
          fileStatuses: { ...state.fileStatuses, [verdict.file]: status },
          fileVerdicts: { ...state.fileVerdicts, [verdict.file]: verdict },
          pipelineLog,
        });
        break;
      }

      case "triage_progress": {
        set({ triageProgress: { current: event.current, total: event.total } });
        break;
      }

      case "inventory_meta": {
        const meta: InventoryMeta = {
          scripts: event.scripts,
          dependencies: event.dependencies,
          entryPoints: event.entryPoints,
          metadata: event.metadata,
        };
        const LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall", "prepare", "prepack"];
        const lifecycle = Object.entries(event.scripts)
          .filter(([k]) => LIFECYCLE_SCRIPTS.includes(k));
        const newEntries: typeof state.pipelineLog = [];
        if (lifecycle.length > 0) {
          newEntries.push({
            kind: "scripts" as const,
            text: lifecycle.map(([k, v]) => `${k}: ${v}`).join("\n"),
            scripts: event.scripts,
            timestamp: event.timestamp,
          });
        }
        const depCounts = Object.entries(event.dependencies)
          .filter(([, deps]) => Object.keys(deps).length > 0)
          .map(([kind, deps]) => `${Object.keys(deps).length} ${kind}`)
          .join(" · ");
        if (depCounts) {
          newEntries.push({
            kind: "info" as const,
            text: depCounts + " dependencies",
            timestamp: event.timestamp,
          });
        }
        set({
          inventoryMeta: meta,
          pipelineLog: [...state.pipelineLog, ...newEntries],
        });
        break;
      }

      case "triage_complete": {
        set({
          riskScore: event.riskScore,
          riskSummary: event.riskSummary,
          focusAreas: event.focusAreas,
          triageProgress: null,
        });
        break;
      }

      case "agent_thinking": {
        set({ agentThinking: true });
        break;
      }

      case "agent_tool_call": {
        set({ agentThinking: false });
        const step: AgentStep = {
          type: "tool_call",
          tool: event.tool,
          args: event.args,
          step: event.step,
          timestamp: event.timestamp,
        };
        set({ agentSteps: [...state.agentSteps, step] });

        // Auto-follow: if agent reads a file, select it
        if (state.autoFollow && event.tool === "readFile") {
          const filePath = (event.args as { path?: string })?.path;
          if (filePath) get().selectFile(filePath);
        }
        break;
      }

      case "agent_tool_result": {
        const step: AgentStep = {
          type: "tool_result",
          tool: event.tool,
          resultPreview: event.resultPreview,
          step: event.step,
          timestamp: event.timestamp,
          injectionDetected: event.injectionDetected,
        };
        set({ agentSteps: [...state.agentSteps, step] });
        break;
      }

      case "agent_reasoning": {
        set({ agentThinking: false });
        const step: AgentStep = {
          type: "reasoning",
          text: event.text,
          step: event.step,
          timestamp: event.timestamp,
        };
        set({ agentSteps: [...state.agentSteps, step] });
        break;
      }

      case "finding_discovered": {
        set({ findings: [...state.findings, event.finding] });
        break;
      }

      case "cli_behavior_started": {
        set({
          cliBehavior: {
            enabled: true,
            nodeVersions: event.nodeVersions,
            commandsDiscovered: event.commands,
            results: [],
            highRiskCount: 0,
            skippedReason: null,
          },
          pipelineLog: [...state.pipelineLog, {
            kind: "info" as const,
            text: `Discovered ${event.commands.length} CLI command${event.commands.length === 1 ? "" : "s"} across Node ${event.nodeVersions.join(", ")}`,
            timestamp: event.timestamp,
          }],
        });
        break;
      }

      case "dependency_graph_ready": {
        const truncationNote = event.graph.truncated
          ? `, truncated at depth ${event.graph.scanDepthApplied} (${event.graph.truncatedNodeCount} deeper package${event.graph.truncatedNodeCount === 1 ? "" : "s"} hidden)`
          : "";
        set({
          dependencyGraph: event.graph,
          pipelineLog: [...state.pipelineLog, {
            kind: "info" as const,
            text: `Dependency graph ready: ${event.graph.nodeCount} packages, ${event.graph.directCount} direct, depth ${event.graph.maxDepth}${truncationNote}`,
            timestamp: event.timestamp,
          }],
        });
        break;
      }

      case "advisory_scan_started": {
        set({
          pipelineLog: [...state.pipelineLog, {
            kind: "info" as const,
            text: `Checking advisories for ${event.nodeCount} package versions`,
            timestamp: event.timestamp,
          }],
        });
        break;
      }

      case "advisory_match": {
        set({
          advisories: [...state.advisories, event.advisory],
          pipelineLog: [...state.pipelineLog, {
            kind: "info" as const,
            text: `${event.advisory.severity.toUpperCase()} advisory on ${event.advisory.packageName}@${event.advisory.packageVersion}`,
            timestamp: event.timestamp,
          }],
        });
        break;
      }

      case "advisory_summary": {
        const warningLog = event.warnings.map((warning) => ({
          kind: "info" as const,
          text: warning.message,
          timestamp: event.timestamp,
        }));
        set({
          advisorySummary: event.summary,
          scanWarnings: [...state.scanWarnings, ...event.warnings],
          pipelineLog: [...state.pipelineLog, {
            kind: "info" as const,
            text: `Advisory summary: ${event.summary.total} matches, ${event.summary.dangerousCount} dangerous`,
            timestamp: event.timestamp,
          }, ...warningLog],
        });
        break;
      }

      case "cli_command_result": {
        const nextResults = [...(state.cliBehavior?.results ?? []), event.result];
        const highRiskCount = nextResults.filter((result) => result.risk === "high").length;
        const summary = `${event.result.command} ${event.result.args.join(" ").trim()} · Node ${event.result.nodeVersion} · ${event.result.risk.toUpperCase()}${event.result.observations.length > 0 ? ` · ${event.result.observations.map((obs) => obs.kind).join(", ")}` : ""}`;

        set({
          cliBehavior: {
            enabled: true,
            nodeVersions: state.cliBehavior?.nodeVersions ?? [event.result.nodeVersion],
            commandsDiscovered: state.cliBehavior?.commandsDiscovered ?? [],
            results: nextResults,
            highRiskCount,
            skippedReason: state.cliBehavior?.skippedReason ?? null,
          },
          pipelineLog: [...state.pipelineLog, {
            kind: "info" as const,
            text: summary,
            timestamp: event.timestamp,
          }],
        });
        break;
      }

      case "verify_started": {
        set({
          pipelineLog: [...state.pipelineLog, {
            kind: "info" as const,
            text: `Running ${event.totalTests} exploit test${event.totalTests === 1 ? "" : "s"} in sandbox...`,
            timestamp: event.timestamp,
          }],
        });
        break;
      }

      case "verify_test_result": {
        const labels = { confirmed: "PASSED", unconfirmed: "FAILED", infra_error: "INFRA ERROR" } as const;
        set({
          pipelineLog: [...state.pipelineLog, {
            kind: "info" as const,
            text: `Test ${event.testFile}: ${labels[event.status]}${event.error ? ` (${event.error})` : ""}`,
            timestamp: event.timestamp,
          }],
        });
        break;
      }

      case "verdict_reached": {
        set({
          verdict: event.verdict,
          capabilities: event.capabilities,
          proofCount: event.proofCount,
          isRunning: false,
          agentThinking: false,
        });
        // Fetch full report to hydrate proof details (non-blocking)
        const { auditId } = get();
        if (auditId) {
          fetch(`${API_BASE}/audit/${auditId}/report`)
            .then((r) => (r.ok ? r.json() : null))
            .then((report) => {
              if (report) {
                const hydrated = report as AuditReport;
                set({
                  verdict: hydrated.verdict ?? state.verdict,
                  finalScore: hydrated.finalScore ?? state.finalScore,
                  recommendedAction: hydrated.recommendedAction ?? state.recommendedAction,
                  proofs: hydrated.proofs ?? [],
                  findings: hydrated.findings ?? state.findings,
                  capabilities: hydrated.capabilities ?? state.capabilities,
                  cliBehavior: hydrated.cliBehavior ?? state.cliBehavior,
                  dependencyGraph: hydrated.dependencyGraph ?? state.dependencyGraph,
                  advisories: hydrated.advisories ?? state.advisories,
                  advisorySummary: hydrated.advisorySummary ?? state.advisorySummary,
                  scanWarnings: hydrated.scanWarnings ?? state.scanWarnings,
                });
              }
            })
            .catch(() => { });
        }
        break;
      }

      case "audit_error": {
        set({ isRunning: false, error: event.error ?? "Audit failed" });
        break;
      }

      case "publish_complete":
      case "publish_failed":
      case "audit_complete":
        break;
    }
  },

  selectFile: async (filePath: string) => {
    const { auditId } = get();
    set({ selectedFile: filePath, selectedFileContent: null });

    if (!auditId) return;

    // Cancel any in-flight file fetch
    activeFileAbort?.abort();
    const controller = new AbortController();
    activeFileAbort = controller;

    try {
      const res = await fetch(
        `${API_BASE}/audit/${auditId}/file/${filePath}`,
        { signal: controller.signal },
      );
      if (res.ok) {
        const content = await res.text();
        if (get().selectedFile === filePath) {
          set({ selectedFileContent: content });
        }
      } else {
        if (get().selectedFile === filePath) {
          set({ selectedFileContent: `// Failed to load file (${res.status})` });
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (get().selectedFile === filePath) {
        set({ selectedFileContent: "// Failed to load file" });
      }
    }
  },
}));
