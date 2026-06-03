import { Link } from "react-router-dom";
import type { Template } from "@/types";

type TemplateCardProps = {
  template: Template;
};

export function TemplateCard({ template }: TemplateCardProps) {
  return (
    <article className="template-card">
      <div
        className="template-card-icon"
        style={{ backgroundColor: `${template.color}18`, color: template.color }}
      >
        {template.name.charAt(0)}
      </div>
      <div className="template-card-body">
        <div className="template-card-meta">
          <span className="template-card-category">{template.category}</span>
        </div>
        <h3>{template.name}</h3>
        <p>{template.description}</p>
      </div>
      <Link
        to={`/deploy/${template.id}`}
        className="template-card-action"
      >
        Deploy
      </Link>
    </article>
  );
}
