import { HeroAnimation } from "./HeroAnimation";

export function Landing() {
  return (
    <div
      className="flex-1 flex flex-col items-center justify-start gap-6"
      style={{ padding: "48px 20px 80px" }}
    >
      <h1
        className="text-center leading-[1.1]"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "clamp(2.2rem, 5vw, 4rem)",
          letterSpacing: "-0.03em",
        }}
      >
        SafeForge NPM
        <br />
        audits before install
        <span style={{ color: "var(--text-muted)" }}>.</span>
      </h1>
      <p
        className="text-center max-w-[420px] leading-[1.7]"
        style={{ color: "var(--text-dim)", fontSize: "0.95rem" }}
      >
        Recursive AI-powered npm supply chain security with static analysis,
        sandbox behavior monitoring, and explainable verdicts.
      </p>

      <HeroAnimation />

      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.65rem",
          color: "var(--text-muted)",
          letterSpacing: "0.01em",
        }}
      >
        LLM-assisted analysis by{" "}
        <a
          className="split-link"
          href="https://featherless.ai"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Featherless"
        >
          <span className="split-link__top" aria-hidden="true">Featherless</span>
          <span className="split-link__bottom">Featherless</span>
        </a>
      </p>
    </div>
  );
}
