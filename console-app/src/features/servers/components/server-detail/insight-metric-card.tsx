import type { ReactNode } from "react";

export type InsightMetricStat = {
  label: string;
  value: ReactNode;
};

type InsightMetricCardProps = {
  title: string;
  value: string;
  valueUnit?: string;
  usagePercent?: number;
  stats: InsightMetricStat[];
};

export function InsightMetricCard({
  title,
  value,
  valueUnit,
  usagePercent,
  stats,
}: InsightMetricCardProps) {
  const clampedUsage =
    usagePercent !== undefined
      ? Math.min(100, Math.max(0, usagePercent))
      : undefined;

  return (
    <article className="insight-metric-card">
      <div className="insight-metric-card-accent" aria-hidden />
      <div className="insight-metric-card-body">
        <header className="insight-metric-card-header">
          <h3 className="insight-metric-card-title">{title}</h3>
          <p className="insight-metric-card-value">
            <span className="insight-metric-card-value-main">{value}</span>
            {valueUnit ? (
              <span className="insight-metric-card-value-unit">{valueUnit}</span>
            ) : null}
          </p>
        </header>

        {clampedUsage !== undefined && (
          <div
            className="insight-metric-progress"
            role="progressbar"
            aria-valuenow={clampedUsage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${title} usage`}
          >
            <div
              className="insight-metric-progress-fill"
              style={{ width: `${clampedUsage}%` }}
            />
          </div>
        )}

        <dl className="server-detail-grid insight-metric-card-stats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}
