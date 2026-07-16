import { ServiceBrandIcon } from "@/components/shared/service-brand-icon";
import {
  formatCategoryLabel,
  normalizeTemplateCategories,
} from "../utils/format-template-category";
import { MarketplaceCardInlineTags } from "./marketplace-card-inline-tags";
import type { ApiTemplate } from "../types";

type MarketplaceTemplateCardProps = {
  template: ApiTemplate;
  onDeploy?: (template: ApiTemplate) => void;
  showDeployButton?: boolean;
  isDeployed?: boolean;
};

function countConfigFields(template: ApiTemplate): number {
  return template.variables?.length ?? 0;
}

function DeployIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 2v8M5 7l3 3 3-3M3 13h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Renders a template card for the marketplace.
 * @param template 
 * @param onDeploy 
 * @param showDeployButton 
 * @param isDeployed 
 * @returns 
 */
export function MarketplaceTemplateCard({
  template,
  onDeploy,
  showDeployButton = true,
  isDeployed = false,
}: MarketplaceTemplateCardProps) {
  const configFieldCount = countConfigFields(template);
  const categoryTags = normalizeTemplateCategories(template.category).map(
    formatCategoryLabel,
  );
  const templateTags = template.tags ?? [];

  return (
    <article className="marketplace-card">
      <div className="marketplace-card-header">
        <ServiceBrandIcon
          name={template.name}
          logo={template.logo}
          className="marketplace-card-icon"
        />
        <div className="marketplace-card-headline">
          <h3 className="marketplace-card-name">
            {template.name}
            {isDeployed ? (
              <span className="marketplace-card-deployed-badge">Deployed</span>
            ) : null}
          </h3>
          {categoryTags.length > 0 ? (
            <MarketplaceCardInlineTags
              tags={categoryTags}
              ariaLabel="Categories"
              className="marketplace-card-headline-tags"
              tagClassName="template-category-label"
            />
          ) : null}
        </div>
      </div>

      <div className="marketplace-card-body">
        {template.shortDescription ? (
          <p className="marketplace-card-description">
            {template.shortDescription}
          </p>
        ) : (
          <p className="marketplace-card-description marketplace-card-description-empty">
            No description provided.
          </p>
        )}

        {templateTags.length > 0 ? (
          <MarketplaceCardInlineTags tags={templateTags} ariaLabel="Tags" />
        ) : null}

        {configFieldCount > 0 ? (
          <dl className="marketplace-card-meta">
            <div className="marketplace-card-meta-item">
              <dt>Configuration</dt>
              <dd>
                {configFieldCount} field{configFieldCount === 1 ? "" : "s"}
              </dd>
            </div>
          </dl>
        ) : null}
      </div>

      {showDeployButton && onDeploy && (
        <div className="marketplace-card-footer">
          <button
            type="button"
            className="marketplace-card-deploy-btn"
            onClick={() => onDeploy(template)}
          >
            <DeployIcon />
            Deploy
          </button>
        </div>
      )}
    </article>
  );
}
