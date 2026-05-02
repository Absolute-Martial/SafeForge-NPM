import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import { useAuditStore } from "../stores/auditStore";
import type { AdvisoryRecord, CliCommandResult, Finding, Proof } from "../lib/types";

function verificationStatus(proof?: Proof) {
  if (!proof) return { label: "FLAGGED", color: "var(--text-muted)", bg: "var(--bg-tertiary)", border: "var(--text-muted)", rank: 5 };
  switch (proof.kind) {
    case "TEST_CONFIRMED": return { label: "VERIFIED", color: "var(--danger)", bg: "var(--danger-bg)", border: "var(--danger)", rank: 0 };
    case "AI_DYNAMIC": return { label: "OBSERVED", color: "var(--suspected)", bg: "var(--suspected-bg)", border: "var(--suspected)", rank: 1 };
    case "TEST_UNCONFIRMED":
      if (proof.verifyError) return { label: "INFRA ERROR", color: "var(--text-muted)", bg: "var(--bg-tertiary)", border: "var(--text-muted)", rank: 3.5 };
      return { label: "UNVERIFIED", color: "var(--suspected)", bg: "var(--suspected-bg)", border: "var(--suspected)", rank: 2 };
    case "AI_STATIC": return { label: "STATIC ANALYSIS", color: "var(--text-muted)", bg: "var(--bg-tertiary)", border: "var(--text-muted)", rank: 3 };
    case "STRUCTURAL": return { label: "STRUCTURAL", color: "var(--text-dim)", bg: "var(--bg-secondary)", border: "var(--text-dim)", rank: 4 };
  }
}

function FindingCard({
  finding,
  proof,
  isExpanded,
  onToggle,
  onShowCode,
}: {
  finding: Finding;
  proof?: Proof;
  isExpanded: boolean;
  onToggle: () => void;
  onShowCode: () => void;
}) {
  const selectFile = useAuditStore((s) => s.selectFile);

  const caps = finding.capability
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const status = verificationStatus(proof);

  return (
    <div
      onClick={onToggle}
      style={{
        borderBottom: "1px solid var(--border)",
        borderLeft: `3px solid ${status.border}`,
        cursor: "pointer",
        background: isExpanded ? "var(--bg-secondary)" : undefined,
        transition: "background 0.15s",
      }}
    >
      {/* Header: problem title + verification badge */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 10,
          padding: "14px 20px 0",
        }}
      >
        <span
          style={{
            fontSize: "0.84rem",
            fontWeight: 600,
            color: "var(--text)",
            lineHeight: 1.4,
            flex: 1,
          }}
        >
          {finding.problem}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.55rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            padding: "1px 6px",
            borderRadius: 3,
            flexShrink: 0,
            background: status.bg,
            color: status.color,
          }}
        >
          {status.label === "VERIFIED" ? "✓ " : ""}{status.label}
        </span>
      </div>

      {/* Capability tags — neutral, not severity indicators */}
      <div style={{ padding: "4px 20px 0", display: "flex", gap: 6 }}>
        {caps.map((cap) => (
          <span
            key={cap}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.6rem",
              fontWeight: 600,
              padding: "1px 6px",
              borderRadius: 3,
              letterSpacing: "0.03em",
              background: "var(--bg-tertiary)",
              color: "var(--text-dim)",
              border: "1px solid var(--border)",
            }}
          >
            {cap}
          </span>
        ))}
      </div>

      {/* Evidence + file link */}
      <div
        style={{
          padding: "6px 20px 0",
          fontSize: "0.78rem",
          color: "var(--text-dim)",
          lineHeight: 1.6,
        }}
      >
        {finding.evidence
          ? finding.evidence.length > 200
            ? finding.evidence.slice(0, 200) + "..."
            : finding.evidence
          : finding.problem}
      </div>
      {finding.fileLine && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            const file = finding.fileLine.split(":")[0];
            if (file) {
              selectFile(file);
              onShowCode();
            }
          }}
          style={{
            padding: "6px 20px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.68rem",
            color: "var(--accent-light)",
            cursor: "pointer",
            display: "inline-block",
          }}
        >
          → {finding.fileLine}
        </div>
      )}

      {/* Expandable: proof box */}
      <div
        className={`proof-area${isExpanded ? " open" : ""}`}
      >
        <div
          style={{
            margin: "0 20px 14px",
            padding: "12px 14px",
            background: "var(--bg-code)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          {proof?.attackPathway && (
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.6rem",
                color: "var(--text-muted)",
                marginBottom: 8,
                letterSpacing: "0.05em",
              }}
            >
              ATTACK PATHWAY · {proof.attackPathway.replace(/_/g, " ")}
            </div>
          )}
          {finding.evidence && (
            <>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.55rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                Evidence
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-dim)",
                  lineHeight: 1.6,
                }}
              >
                {finding.evidence}
              </div>
            </>
          )}
          {finding.reproductionStrategy && (
            <>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.55rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: "var(--text-muted)",
                  marginBottom: 4,
                  marginTop: finding.evidence ? 10 : 0,
                }}
              >
                Reproduction
              </div>
              <div
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-dim)",
                  lineHeight: 1.7,
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {finding.reproductionStrategy}
              </div>
            </>
          )}
        </div>

        {/* Generated exploit test code */}
        {proof?.testCode && (
          <div
            style={{
              margin: "0 20px 14px",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                background: "var(--bg-tertiary)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-dim)",
                }}
              >
                Exploit Test
              </span>
              {proof.kind === "TEST_CONFIRMED" && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.55rem",
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 3,
                    background: "var(--danger-bg)",
                    color: "var(--danger)",
                  }}
                >
                  ✓ VERIFIED
                </span>
              )}
              {proof.kind === "TEST_UNCONFIRMED" && (
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.55rem",
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 3,
                    background: "var(--suspected-bg)",
                    color: "var(--suspected)",
                  }}
                >
                  UNCONFIRMED
                </span>
              )}
              {proof.testHash && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.55rem",
                    color: "var(--text-muted)",
                  }}
                >
                  #{proof.testHash.slice(0, 8)}
                </span>
              )}
            </div>
            <div style={{ maxHeight: 300, overflow: "auto" }}>
              <CodeMirror
                value={proof.testCode}
                extensions={[
                  javascript({ jsx: false, typescript: false }),
                  EditorView.editable.of(false),
                ]}
                basicSetup={{
                  lineNumbers: false,
                  foldGutter: false,
                  highlightActiveLine: false,
                }}
                style={{ fontSize: "0.72rem" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ResultsPanel({
  onShowCode,
}: {
  onShowCode: () => void;
}) {
  const findings = useAuditStore((s) => s.findings);
  const proofs = useAuditStore((s) => s.proofs);
  const cliBehavior = useAuditStore((s) => s.cliBehavior);
  const dependencyGraph = useAuditStore((s) => s.dependencyGraph);
  const advisories = useAuditStore((s) => s.advisories);
  const advisorySummary = useAuditStore((s) => s.advisorySummary);
  const scanWarnings = useAuditStore((s) => s.scanWarnings);
  const prioritizedEntrypoints = useAuditStore((s) => s.prioritizedEntrypoints);
  const reasoningStageSummaries = useAuditStore((s) => s.reasoningStageSummaries);
  const familyAnalyses = useAuditStore((s) => s.familyAnalyses);
  const evidenceGraph = useAuditStore((s) => s.evidenceGraph);
  const verdict = useAuditStore((s) => s.verdict);
  const finalScore = useAuditStore((s) => s.finalScore);
  const recommendedAction = useAuditStore((s) => s.recommendedAction);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Match each finding to a proof by fileLine (natural join key)
  const proofByFileLine = Object.fromEntries(proofs.map((p) => [p.fileLine, p]));

  // Sort findings: verified threats first, then observed, unverified, static, flagged
  const sortedFindings = [...findings]
    .map((f, i) => ({ finding: f, originalIndex: i, rank: verificationStatus(proofByFileLine[f.fileLine]).rank }))
    .sort((a, b) => a.rank - b.rank);

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div
        className="flex items-center shrink-0"
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span className="section-header">
          Findings
        </span>
        {findings.length > 0 && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.65rem",
              color: "var(--text-muted)",
              marginLeft: 8,
            }}
          >
            {findings.length}
          </span>
        )}
        <button
          onClick={onShowCode}
          className="btn-ghost"
          style={{ marginLeft: "auto", padding: "4px 10px" }}
        >
          view source
        </button>
      </div>

      {/* Findings list — sorted by verification status */}
      <div className="flex-1 overflow-y-auto">
        {verdict && finalScore !== null && (
          <div style={{ padding: "16px 20px 0" }}>
            <div
              style={{
                border: "1px solid var(--border)",
                borderLeft: `3px solid ${verdict === "SAFE" ? "var(--safe)" : verdict === "REVIEW REQUIRED" ? "var(--suspected)" : "var(--danger)"}`,
                borderRadius: "var(--radius-sm)",
                padding: "12px 14px",
                background: "var(--bg-primary)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span className="section-header" style={{ padding: 0 }}>{verdict}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--text-muted)" }}>
                  {finalScore}/100
                </span>
              </div>
              {recommendedAction && (
                <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", lineHeight: 1.6 }}>
                  {recommendedAction}
                </div>
              )}
            </div>
          </div>
        )}

        {sortedFindings.map(({ finding: f, originalIndex }) => (
          <FindingCard
            key={originalIndex}
            finding={f}
            proof={proofByFileLine[f.fileLine]}
            isExpanded={expandedIndex === originalIndex}
            onToggle={() =>
              setExpandedIndex(expandedIndex === originalIndex ? null : originalIndex)
            }
            onShowCode={onShowCode}
          />
        ))}

        {findings.length === 0 && advisories.length === 0 && (
          <div
            className="flex flex-col items-center justify-center gap-2"
            style={{
              padding: "48px 20px",
              color: "var(--text-muted)",
              fontSize: "0.85rem",
            }}
          >
            <div style={{ fontSize: "2rem", opacity: 0.3 }}>&#10003;</div>
            No suspicious behavior detected
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
              }}
            >
              Package appears safe to install
            </div>
          </div>
        )}

        {(scanWarnings.length > 0 || dependencyGraph || advisorySummary || advisories.length > 0) && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px 20px" }}>
            {scanWarnings.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                <span className="section-header" style={{ padding: 0 }}>Scan Warnings</span>
                {scanWarnings.map((warning) => (
                  <div
                    key={warning.code + warning.message}
                    style={{
                      border: "1px solid var(--border)",
                      borderLeft: "3px solid var(--suspected)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      background: "var(--bg-primary)",
                      fontSize: "0.78rem",
                      color: "var(--text-dim)",
                    }}
                  >
                    {warning.message}
                  </div>
                ))}
              </div>
            )}

            {dependencyGraph && (
              <div style={{ marginBottom: 16 }}>
                <span className="section-header" style={{ padding: 0 }}>Dependency Graph</span>
                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: 10,
                  }}
                >
                  {[
                    ["Packages", String(dependencyGraph.nodeCount)],
                    ["Direct", String(dependencyGraph.directCount)],
                    ["Max Depth", String(dependencyGraph.maxDepth)],
                    ["Scan Depth", String(dependencyGraph.scanDepthApplied)],
                    ["Root", `${dependencyGraph.packageName}${dependencyGraph.packageVersion ? `@${dependencyGraph.packageVersion}` : ""}`],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        padding: "10px 12px",
                        background: "var(--bg-primary)",
                      }}
                    >
                      <div style={{ fontSize: "0.65rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {label}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text)", marginTop: 4, overflowWrap: "anywhere" }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
                {dependencyGraph.truncated && (
                  <div style={{ marginTop: 10, fontSize: "0.74rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                    Scan depth limited this graph to {dependencyGraph.scanDepthApplied}. {dependencyGraph.truncatedNodeCount} deeper package{dependencyGraph.truncatedNodeCount === 1 ? "" : "s"} were excluded from matching and display.
                  </div>
                )}
              </div>
            )}

            {advisorySummary && (
              <div style={{ marginBottom: advisories.length > 0 ? 12 : 0 }}>
                <span className="section-header" style={{ padding: 0 }}>Advisories</span>
                <div style={{ marginTop: 10, fontSize: "0.78rem", color: "var(--text-dim)" }}>
                  {advisorySummary.total} matched
                  {advisorySummary.dangerousCount > 0 ? ` · ${advisorySummary.dangerousCount} dangerous` : ""}
                </div>
              </div>
            )}

            {advisories.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {advisories.map((advisory) => (
                  <AdvisoryCard key={`${advisory.id}-${advisory.packageName}-${advisory.packageVersion}`} advisory={advisory} />
                ))}
              </div>
            )}
          </div>
        )}

        {(prioritizedEntrypoints.length > 0 || reasoningStageSummaries.length > 0 || familyAnalyses.length > 0 || (evidenceGraph && evidenceGraph.nodes.length > 0)) && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px 20px" }}>
            <span className="section-header" style={{ padding: 0 }}>Evidence</span>

            {reasoningStageSummaries.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                {reasoningStageSummaries.map((stage) => (
                  <div
                    key={stage.stage}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: "10px 12px",
                      background: "var(--bg-primary)",
                    }}
                  >
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "var(--text-muted)", marginBottom: 6 }}>
                      {stage.stage.replace(/_/g, " ")}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--text)", lineHeight: 1.6 }}>{stage.summary}</div>
                    {stage.highlights.length > 0 && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        {stage.highlights.slice(0, 4).map((highlight) => (
                          <div key={highlight} style={{ fontSize: "0.72rem", color: "var(--text-dim)", lineHeight: 1.5 }}>
                            {highlight}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {prioritizedEntrypoints.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 8 }}>
                  PRIORITIZED ENTRYPOINTS
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {prioritizedEntrypoints.slice(0, 6).map((entrypoint) => (
                    <div key={entrypoint.id} style={{ borderLeft: "2px solid var(--accent)", paddingLeft: 10 }}>
                      <div style={{ fontSize: "0.76rem", color: "var(--text)" }}>
                        {entrypoint.type} · {entrypoint.label}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "var(--accent-light)", marginTop: 4 }}>
                        {entrypoint.file || entrypoint.trigger || "n/a"}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 }}>
                        {entrypoint.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {familyAnalyses.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 8 }}>
                  BEHAVIOR FAMILIES
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {familyAnalyses.map((family) => (
                    <div key={family.family} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", background: "var(--bg-primary)" }}>
                      <div style={{ fontSize: "0.74rem", color: "var(--text)" }}>{family.family.replace(/_/g, " ")}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 }}>{family.summary}</div>
                      {(family.sinkKinds.length > 0 || family.observedSignals.length > 0) && (
                        <div style={{ marginTop: 8, fontSize: "0.68rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                          {family.sinkKinds.length > 0 ? `sinks: ${family.sinkKinds.join(", ")}` : ""}
                          {family.sinkKinds.length > 0 && family.observedSignals.length > 0 ? " · " : ""}
                          {family.observedSignals.length > 0 ? `signals: ${family.observedSignals.join(", ")}` : ""}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {evidenceGraph && evidenceGraph.nodes.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 8 }}>
                  EVIDENCE CHAINS
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {evidenceGraph.entrypoints.slice(0, 6).map((entrypoint) => {
                    const nodes = evidenceGraph.nodes.filter((node) => node.entrypointId === entrypoint.id);
                    return (
                      <div key={entrypoint.id} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "10px 12px", background: "var(--bg-primary)" }}>
                        <div style={{ fontSize: "0.76rem", color: "var(--text)" }}>
                          {entrypoint.label}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.68rem", color: "var(--text-muted)", marginTop: 4 }}>
                          {entrypoint.file || entrypoint.trigger || "n/a"}
                        </div>
                        {nodes.length > 0 ? (
                          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                            {nodes.slice(0, 4).map((node) => (
                              <div key={node.id} style={{ borderLeft: "2px solid var(--border)", paddingLeft: 10 }}>
                                <div style={{ fontSize: "0.72rem", color: "var(--text)" }}>
                                  {node.kind} {node.sinkKind ? `· ${node.sinkKind}` : ""}
                                </div>
                                <div style={{ fontSize: "0.7rem", color: "var(--text-dim)", lineHeight: 1.5, marginTop: 2 }}>
                                  {node.detail || node.label}
                                </div>
                                {node.fileLine && (
                                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.66rem", color: "var(--accent-light)", marginTop: 4 }}>
                                    {node.fileLine}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ marginTop: 8, fontSize: "0.72rem", color: "var(--text-muted)" }}>
                            No evidence nodes attached.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {cliBehavior && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px 20px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <span className="section-header" style={{ padding: 0 }}>CLI Behavior</span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.65rem",
                  color: cliBehavior.highRiskCount > 0 ? "var(--danger)" : "var(--text-muted)",
                }}
              >
                {cliBehavior.results.length} runs
              </span>
            </div>

            {cliBehavior.skippedReason && (
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 12 }}>
                {cliBehavior.skippedReason}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {cliBehavior.results.map((result, index) => (
                <CliBehaviorCard key={`${result.command}-${result.nodeVersion}-${result.scenario}-${index}`} result={result} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdvisoryCard({ advisory }: { advisory: AdvisoryRecord }) {
  const severityColor =
    advisory.severity === "critical" || advisory.severity === "high"
      ? "var(--danger)"
      : advisory.severity === "moderate"
        ? "var(--suspected)"
        : "var(--text-dim)";

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${severityColor}`,
        borderRadius: "var(--radius-sm)",
        padding: "10px 12px",
        background: "var(--bg-primary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <code style={{ fontSize: "0.75rem", color: "var(--text)" }}>
          {advisory.packageName}@{advisory.packageVersion}
        </code>
        <span
          style={{
            fontSize: "0.62rem",
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 3,
            background: advisory.severity === "critical" || advisory.severity === "high" ? "var(--danger-bg)" : "var(--bg-tertiary)",
            color: severityColor,
            fontFamily: "var(--font-mono)",
          }}
        >
          {advisory.severity.toUpperCase()}
        </span>
        {advisory.fixedVersion && (
          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            fix {advisory.fixedVersion}
          </span>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: "0.8rem", color: "var(--text)" }}>
        {advisory.title}
      </div>
      <div style={{ marginTop: 4, fontSize: "0.76rem", color: "var(--text-dim)", lineHeight: 1.6 }}>
        {advisory.summary}
      </div>

      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>
          IDs · {advisory.sourceIds.join(", ")}
        </div>
        {advisory.dependencyPaths[0] && (
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", overflowWrap: "anywhere" }}>
            Path · {advisory.dependencyPaths[0].join(" > ")}
          </div>
        )}
      </div>
    </div>
  );
}

function CliBehaviorCard({ result }: { result: CliCommandResult }) {
  const riskColor =
    result.risk === "high"
      ? "var(--danger)"
      : result.risk === "infra_error"
        ? "var(--suspected)"
        : "var(--text-dim)";

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${riskColor}`,
        borderRadius: "var(--radius-sm)",
        padding: "10px 12px",
        background: "var(--bg-primary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <code style={{ fontSize: "0.75rem", color: "var(--text)" }}>
          {result.command}{result.args.length > 0 ? ` ${result.args.join(" ")}` : ""}
        </code>
        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          Node {result.nodeVersion}
        </span>
        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          exit {result.exitCode ?? "n/a"}
        </span>
        <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          {result.durationMs}ms
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "0.62rem",
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 3,
            background: result.risk === "high" ? "var(--danger-bg)" : "var(--bg-tertiary)",
            color: riskColor,
            fontFamily: "var(--font-mono)",
          }}
        >
          {result.risk.toUpperCase()}
        </span>
      </div>

      {result.observations.length > 0 && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {result.observations.map((obs, index) => (
            <div key={`${obs.kind}-${index}`} style={{ fontSize: "0.76rem", color: "var(--text-dim)" }}>
              <span style={{ fontFamily: "var(--font-mono)", color: riskColor }}>{obs.kind}</span>
              {" · "}
              {obs.detail}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
