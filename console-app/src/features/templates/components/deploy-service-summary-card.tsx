import type { CSSProperties } from "react";
import type { ApiTemplate } from "../types";
import { getTemplateAccentColor } from "../utils/deploy-form-schema";

type DeployServiceSummaryCardProps = {
  template: ApiTemplate;
  serverName?: string;
  serverId: string;
  variableCount: number | "loading";
};

export function DeployServiceSummaryCard({
  template,
  serverName,
  serverId,
}: DeployServiceSummaryCardProps) {
  const accent = getTemplateAccentColor(template.slug);

  return (
    <article
      className="deploy-service-card"
      style={{ "--deploy-accent": accent } as CSSProperties}
    >
      <div
        className="deploy-service-card-accent"
        style={{ background: accent }}
      />
      <div className="deploy-service-card-main">
        <div
          className="deploy-service-icon"
          style={{
            backgroundColor: `${accent}20`,
            color: accent,
          }}
          aria-hidden
        >
          {template.name.charAt(0)}
        </div>
        <div className="deploy-service-content">
          <div className="deploy-service-headline">
            <h1>{template.name}</h1>
          </div>
          {template.category ? (
            <p className="deploy-service-category">{template.category}</p>
          ) : null}
          {template.description ? (
            <p className="deploy-service-description">{template.description}</p>
          ) : null}
          <dl className="deploy-service-meta-grid">
            <div className="deploy-service-meta-item">
              <dt>Target server</dt>
              <dd>{serverName ?? serverId}</dd>
            </div>
            <div className="deploy-service-meta-item">
              <dt>Template</dt>
              <dd>
                <code>{template.slug}</code>
              </dd>
            </div>
            {template.version ? (
              <div className="deploy-service-meta-item">
                <dt>Version</dt>
                <dd>{template.version}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </article>
  );
}
