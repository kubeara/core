import { Link } from "react-router-dom";
import { getErrorMessage } from "@/api/api-error";
import { useAuth } from "@/features/auth/context/use-auth";
import { getDisplayName } from "@/lib/user-display";
import { useTemplatesQuery } from "@/features/templates/hooks";
import { SkeletonGrid } from "@/components/shared/skeleton";
import { MarketplaceTemplateCard } from "@/features/templates/components/marketplace-template-card";
import "@/features/templates/templates-ui.css";

/**
 * Templates catalog page backed by GET /api/templates.
 */
export function TemplatesPage() {
  const { user } = useAuth();
  const { data: templates, isPending, isError, error } = useTemplatesQuery();

  return (
    <div className="dashboard templates-catalog">
      <header className="templates-catalog-header dashboard-header">
        <div>
          <h1>Services</h1>
          <p>
            Welcome back{user ? `, ${getDisplayName(user)}` : ""}. Browse
            curated infrastructure templates and deploy them from a
            server&apos;s Services tab.
          </p>
        </div>
        <Link to="/servers" className="btn-primary">
          Go to Servers
        </Link>
      </header>

      {isPending && <SkeletonGrid count={6} label="Loading templates…" />}

      {isError && (
        <div className="templates-panel-state">
          <p className="text-sm text-[var(--danger)]">
            {getErrorMessage(error)}
          </p>
        </div>
      )}

      {!isPending && !isError && (!templates || templates.length === 0) && (
        <div className="templates-panel-state">
          <p>No templates available yet.</p>
        </div>
      )}

      {!isPending && !isError && templates && templates.length > 0 && (
        <div className="marketplace-grid">
          {templates.map((template) => (
            <MarketplaceTemplateCard
              key={template.slug}
              template={template}
              showDeployButton={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
