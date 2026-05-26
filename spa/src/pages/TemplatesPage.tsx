import { TemplateCard } from "@/components/template-card";
import { templates } from "@/lib/templates";
import { useAuth } from "@/contexts/auth-context";
import { getDisplayName } from "@/lib/user-display";

export function TemplatesPage() {
  const { user } = useAuth();

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Templates</h1>
          <p>
            Welcome back{user ? `, ${getDisplayName(user)}` : ""}. Deploy infrastructure
            templates with one click.
          </p>
        </div>
      </header>
      <div className="template-grid">
        {templates.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
}
