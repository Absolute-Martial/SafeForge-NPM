import { useAuditStore } from "../stores/auditStore";
import { PhaseProgress } from "./PhaseProgress";

export function Header() {
  const isRunning = useAuditStore((s) => s.isRunning);
  const packageName = useAuditStore((s) => s.packageName);
  const verdict = useAuditStore((s) => s.verdict);
  const reset = useAuditStore((s) => s.reset);

  const hasAudit = isRunning || verdict;

  const statusColor = verdict
    ? verdict === "SAFE"
      ? "var(--safe)"
      : verdict === "REVIEW REQUIRED"
        ? "var(--suspected)"
        : "var(--danger)"
    : "var(--investigating)";

  const goHome = () => {
    reset();
    history.pushState(null, "", "/");
  };

  return (
    <header
      className="flex items-center gap-4 shrink-0"
      style={{
        padding: "0 20px",
        height: "var(--header-height)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <button
        onClick={goHome}
        aria-label="Go to home page"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "1rem",
          letterSpacing: "-0.02em",
          cursor: "pointer",
          background: "none",
          border: "none",
          padding: 0,
          color: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        SafeForge<span style={{ color: "var(--accent)" }}> NPM</span>
      </button>

      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.55rem",
          color: "var(--arc-blue)",
          border: "1px solid var(--arc-blue)",
          borderRadius: 9999,
          padding: "1px 8px",
          letterSpacing: "0.04em",
          opacity: 0.75,
          whiteSpace: "nowrap",
        }}
      >
        Scanner
      </span>

      <div style={{ flex: 1 }} />

      {hasAudit && (
        <div
          className="flex items-center gap-2"
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 20,
            padding: "4px 14px",
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            whiteSpace: "nowrap",
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: statusColor,
            }}
          />
          {packageName}
        </div>
      )}

      {hasAudit && <PhaseProgress />}

      <button
        onClick={() =>
          document.documentElement.classList.toggle("urushi")
        }
        className="flex items-center gap-1"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          fontSize: "0.7rem",
          color: "var(--text-muted)",
          padding: 0,
        }}
        aria-label="Toggle theme"
      >
        <div
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: "var(--accent)",
          }}
        />
      </button>
    </header>
  );
}
