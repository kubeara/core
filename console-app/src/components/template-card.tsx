import { Link } from "react-router";
import type { CSSProperties } from "react";
import { ServiceBrandIcon } from "@/components/shared/service-brand-icon";
import type { Template } from "@/types";

type TemplateCardProps = {
  template: Template;
};

export function TemplateCard({ template }: TemplateCardProps) {
  return (
    <article
      className="template-card"
      style={{ "--template-accent": template.color } as CSSProperties}
    >
      <ServiceBrandIcon
        name={template.name}
        logo={template.logo}
        className="template-card-icon"
        style={{
          backgroundColor: `${template.color}18`,
          color: template.color,
        }}
      />
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
