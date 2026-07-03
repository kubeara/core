import type { ReactNode } from "react";

type ServerDetailSectionHeaderProps = {
  title: string;
  description?: ReactNode;
  className?: string;
};

export function ServerDetailSectionHeader({
  title,
  description,
  className,
}: ServerDetailSectionHeaderProps) {
  return (
    <header
      className={["server-detail-section-header", className]
        .filter(Boolean)
        .join(" ")}
    >
      <h2 className="server-detail-section-title">{title}</h2>
      {description ? (
        <p className="server-detail-section-desc">{description}</p>
      ) : null}
    </header>
  );
}
