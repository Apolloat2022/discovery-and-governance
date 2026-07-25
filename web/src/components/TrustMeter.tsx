function trustColor(score: number): string {
  if (score >= 70) return "var(--color-success)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-danger)";
}

export function TrustMeter({ score, compact }: { score: number; compact?: boolean }) {
  return (
    <span className="trust-meter" title={`Trust score ${score}/100`}>
      {!compact && (
        <span className="trust-meter-track">
          <span
            className="trust-meter-fill"
            style={{ width: `${score}%`, background: trustColor(score) }}
          />
        </span>
      )}
      <span className="trust-meter-value" style={{ color: trustColor(score) }}>
        {score}
      </span>
    </span>
  );
}

const BREAKDOWN_LABEL: Record<string, string> = {
  semantic: "Semantic",
  graph: "Graph",
  trust: "Trust",
};

export function ScoreBreakdown({ breakdown }: { breakdown: { semantic: number; graph: number; trust: number } }) {
  return (
    <div className="flex-col" style={{ gap: 6 }}>
      {(["semantic", "graph", "trust"] as const).map((key) => (
        <div className="breakdown-bar-row" key={key}>
          <span className="text-faint">{BREAKDOWN_LABEL[key]}</span>
          <span className="breakdown-bar-track">
            <span className="breakdown-bar-fill" style={{ width: `${Math.round(breakdown[key] * 100)}%` }} />
          </span>
          <span className="text-faint mono" style={{ textAlign: "right" }}>
            {Math.round(breakdown[key] * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}
