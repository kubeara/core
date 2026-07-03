import { ServiceBrandIcon } from "@/components/shared/service-brand-icon";
import {
  getTemplateCategoryTagsDisplay,
  normalizeTemplateCategories,
} from "../utils/format-template-category";
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

export function MarketplaceTemplateCard({
  template,
  onDeploy,
  showDeployButton = true,
  isDeployed = false,
}: MarketplaceTemplateCardProps) {
  const configFieldCount = countConfigFields(template);
  const categoryTags = getTemplateCategoryTagsDisplay(template.category);
  const categoryValues = normalizeTemplateCategories(template.category);

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
          {categoryTags ? (
            <ul
              className="marketplace-card-tags marketplace-card-headline-tags"
              aria-label="Categories"
            >
              {categoryTags.visible.map((label, index) => (
                <li
                  key={`${categoryValues[index] ?? label}-${index}`}
                  className="marketplace-card-tag template-category-label"
                >
                  {label}
                </li>
              ))}
              {categoryTags.overflowCount > 0 ? (
                <li className="marketplace-card-tag">
                  {categoryTags.overflowCount} more
                </li>
              ) : null}
            </ul>
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

        {template.tags && template.tags.length > 0 && (
          <ul className="marketplace-card-tags" aria-label="Tags">
            {template.tags.map((tag) => (
              <li key={tag} className="marketplace-card-tag">
                {tag}
              </li>
            ))}
          </ul>
        )}

        <dl className="marketplace-card-meta">
          {template.port != null && template.port > 0 && (
            <div className="marketplace-card-meta-item">
              <dt>Default port</dt>
              <dd>
                <code>{template.port}</code>
              </dd>
            </div>
          )}
          {configFieldCount > 0 && (
            <div className="marketplace-card-meta-item">
              <dt>Configuration</dt>
              <dd>
                {configFieldCount} field{configFieldCount === 1 ? "" : "s"}
              </dd>
            </div>
          )}
        </dl>
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
