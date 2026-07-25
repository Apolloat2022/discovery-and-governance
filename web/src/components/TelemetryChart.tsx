import type { TelemetryDay } from "../api/types";

/** Simple bar chart: executions per day, coloured by success proportion. */
export function TelemetryChart({ daily }: { daily: TelemetryDay[] }) {
  const max = Math.max(1, ...daily.map((d) => d.executions));
  const width = 640;
  const height = 120;
  const barGap = 2;
  const barWidth = Math.max(1, width / daily.length - barGap);

  const totalRuns = daily.reduce((sum, d) => sum + d.executions, 0);
  const totalSuccess = daily.reduce((sum, d) => sum + d.successes, 0);

  if (totalRuns === 0) {
    return <div className="text-faint text-sm">No executions recorded in this window.</div>;
  }

  return (
    <div className="flex-col" style={{ gap: 6 }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        {daily.map((day, i) => {
          const barHeight = (day.executions / max) * (height - 4);
          const successRatio = day.executions > 0 ? day.successes / day.executions : 1;
          const color = day.executions === 0 ? "var(--color-border)" : successRatio >= 0.7 ? "var(--color-success)" : "var(--color-danger)";
          return (
            <rect
              key={day.date}
              x={i * (barWidth + barGap)}
              y={height - barHeight}
              width={barWidth}
              height={Math.max(barHeight, day.executions > 0 ? 2 : 1)}
              fill={color}
              opacity={day.executions === 0 ? 0.5 : 0.9}
            >
              <title>
                {day.date}: {day.executions} run{day.executions === 1 ? "" : "s"}
                {day.executions > 0 ? `, ${Math.round(successRatio * 100)}% success` : ""}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="flex-row text-faint text-sm" style={{ justifyContent: "space-between" }}>
        <span>{daily[0]?.date}</span>
        <span>
          {totalRuns} runs · {Math.round((totalSuccess / totalRuns) * 100)}% success
        </span>
        <span>{daily[daily.length - 1]?.date}</span>
      </div>
    </div>
  );
}
