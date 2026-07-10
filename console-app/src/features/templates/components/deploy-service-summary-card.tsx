import { ServiceBrandIcon } from "@/components/shared/service-brand-icon";
import type { ApiTemplate } from "../types";
import { getTemplateAccentColor } from "../utils/deploy-form-schema";
import { formatTemplateCategory } from "../utils/format-template-category";

export type DeployServiceSummaryStatus = {
  type: "validating";
  message: string;
};

type DeployServiceSummaryCardProps = {
  template: ApiTemplate;
  serverName?: string;
  serverId: string;
  variableCount: number | "loading";
  status?: DeployServiceSummaryStatus | null;
};

export function DeployServiceSummaryCard({
  template,
  serverName,
  serverId,
  status,
}: DeployServiceSummaryCardProps) {
  const accent = getTemplateAccentColor(template.slug);
  const categoryLabel = formatTemplateCategory(template.category);
  const targetServerName = serverName ?? serverId;

  return (
    <article className="deploy-service-card">
      <div className="deploy-service-card-accent" />
      <div className="deploy-service-card-main">
        <ServiceBrandIcon
          name={template.name}
          logo={template.logo}
          className="deploy-service-icon"
          style={{
            backgroundColor: `${accent}20`,
            color: accent,
          }}
        />
        <div className="deploy-service-content">
          <div className="deploy-service-card-top">
            <div className="deploy-service-details">
              <div className="deploy-service-headline">
                <h1>{template.name}</h1>
                {status?.type === "validating" ? (
                  <span
                    className="deploy-service-status deploy-service-status-validating"
                    role="status"
                    aria-live="polite"
                  >
                    {status.message}
                  </span>
                ) : null}
              </div>
              {categoryLabel ? (
                <p className="deploy-service-category">{categoryLabel}</p>
              ) : null}
              {template.shortDescription ? (
                <p className="deploy-service-description">
                  {template.shortDescription}
                </p>
              ) : null}
            </div>
            <div className="deploy-service-target">
              <span className="deploy-service-target-label">Target server</span>
              <p className="deploy-service-target-name">{targetServerName}</p>
            </div>
          </div>
          {template.version ? (
            <dl className="deploy-service-meta-grid">
              <div className="deploy-service-meta-item">
                <dt>Version</dt>
                <dd>{template.version}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      </div>
    </article>
  );
}
