import { ServiceBrandIcon } from "@/components/shared/service-brand-icon";
import type { ApiTemplate } from "../types";
import { getTemplateAccentColor } from "../utils/deploy-form-schema";
import { formatTemplateCategory } from "../utils/format-template-category";

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
  const categoryLabel = formatTemplateCategory(template.category);

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
          <div className="deploy-service-headline">
            <h1>{template.name}</h1>
          </div>
          {categoryLabel ? (
            <p className="deploy-service-category">{categoryLabel}</p>
          ) : null}
          {template.shortDescription ? (
            <p className="deploy-service-description">{template.shortDescription}</p>
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
