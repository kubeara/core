import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import "./skeleton.css";

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({ className, style }: SkeletonProps) {
  return <div className={cn("skeleton", className)} style={style} aria-hidden />;
}

type SkeletonTextProps = SkeletonProps & {
  width?: string | number;
  size?: "sm" | "md" | "lg";
};

export function SkeletonText({
  className,
  style,
  width = "100%",
  size = "md",
}: SkeletonTextProps) {
  return (
    <Skeleton
      className={cn(
        "skeleton-text",
        size === "sm" && "skeleton-text-sm",
        size === "lg" && "skeleton-text-lg",
        className,
      )}
      style={{ width, ...style }}
    />
  );
}

export function SkeletonCircle({
  size,
  className,
}: {
  size: number;
  className?: string;
}) {
  return (
    <Skeleton
      className={cn("skeleton-circle", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function SkeletonCard({
  height = 280,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <Skeleton className={cn("skeleton-card", className)} style={{ height }} />
  );
}

export function SkeletonGrid({
  count = 6,
  cardHeight = 280,
  className,
  label = "Loading…",
}: {
  count?: number;
  cardHeight?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("skeleton-grid", className)}
      aria-live="polite"
      aria-busy="true"
    >
      <span className="skeleton-visually-hidden">{label}</span>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonCard key={index} height={cardHeight} />
      ))}
    </div>
  );
}

export function SkeletonInsightCard() {
  return (
    <article className="skeleton-insight-card" aria-hidden>
      <div className="skeleton-insight-accent" />
      <div className="skeleton-insight-body">
        <div className="skeleton-insight-header">
          <SkeletonText width="5rem" />
          <SkeletonText width="4.5rem" />
        </div>
        <Skeleton className="skeleton-insight-progress" />
        <div className="skeleton-insight-stats">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton-insight-stat">
              <SkeletonText width="3.5rem" size="sm" />
              <SkeletonText width="4.5rem" />
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

export function SkeletonInsightStack({
  count = 5,
  label = "Loading…",
  className,
}: {
  count?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("skeleton-insight-stack", className)}
      aria-live="polite"
      aria-busy="true"
    >
      <span className="skeleton-visually-hidden">{label}</span>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonInsightCard key={index} />
      ))}
    </div>
  );
}

export type SkeletonMarketplaceCardVariant = "services" | "overview";

function SkeletonOverviewMetaItem({
  labelClassName,
  valueClassName,
}: {
  labelClassName?: string;
  valueClassName: string;
}) {
  return (
    <div className="marketplace-card-meta-item">
      <Skeleton
        className={cn("skeleton-marketplace-meta-label", labelClassName)}
      />
      <Skeleton className={valueClassName} />
    </div>
  );
}

export function SkeletonMarketplaceCard({
  variant = "services",
}: {
  variant?: SkeletonMarketplaceCardVariant;
}) {
  if (variant === "overview") {
    return (
      <article
        className="marketplace-card overview-container-card skeleton-marketplace-card skeleton-marketplace-card--overview"
        aria-hidden
      >
        <Skeleton className="skeleton-marketplace-actions" />
        <div className="marketplace-card-header">
          <Skeleton className="skeleton-marketplace-icon" />
          <div className="marketplace-card-headline">
            <Skeleton className="skeleton-marketplace-category" />
            <Skeleton className="skeleton-marketplace-name" />
          </div>
        </div>
        <div className="marketplace-card-body">
          <Skeleton className="skeleton-marketplace-image-line" />
          <dl className="marketplace-card-meta">
            <SkeletonOverviewMetaItem
              labelClassName="skeleton-marketplace-meta-label--status"
              valueClassName="skeleton-marketplace-meta-status"
            />
            <SkeletonOverviewMetaItem
              labelClassName="skeleton-marketplace-meta-label--ports"
              valueClassName="skeleton-marketplace-meta-port"
            />
            <SkeletonOverviewMetaItem
              labelClassName="skeleton-marketplace-meta-label--created"
              valueClassName="skeleton-marketplace-meta-value--created"
            />
          </dl>
        </div>
      </article>
    );
  }

  return (
    <article
      className="marketplace-card skeleton-marketplace-card skeleton-marketplace-card--services"
      aria-hidden
    >
      <div className="marketplace-card-header">
        <Skeleton className="skeleton-marketplace-icon" />
        <div className="marketplace-card-headline">
          <Skeleton className="skeleton-marketplace-name" />
          <div className="skeleton-marketplace-tags skeleton-marketplace-tags--headline">
            <Skeleton className="skeleton-marketplace-tag" />
            <Skeleton className="skeleton-marketplace-tag skeleton-marketplace-tag--medium" />
          </div>
        </div>
      </div>
      <div className="marketplace-card-body">
        <div className="skeleton-marketplace-description">
          <SkeletonText width="100%" className="skeleton-marketplace-description-line" />
          <SkeletonText width="84%" className="skeleton-marketplace-description-line" />
        </div>
        <div className="skeleton-marketplace-tags">
          <Skeleton className="skeleton-marketplace-tag" />
          <Skeleton className="skeleton-marketplace-tag skeleton-marketplace-tag--medium" />
          <Skeleton className="skeleton-marketplace-tag skeleton-marketplace-tag--wide" />
        </div>
        {/* <dl className="marketplace-card-meta">
          <div className="marketplace-card-meta-item">
            <Skeleton className="skeleton-marketplace-meta-label" />
            <Skeleton className="skeleton-marketplace-meta-value" />
          </div>
        </dl> */}
      </div>
      <div className="marketplace-card-footer">
        <div className="skeleton-marketplace-deploy-btn">
          <Skeleton className="skeleton-marketplace-deploy-icon" />
          <Skeleton className="skeleton-marketplace-deploy-label" />
        </div>
      </div>
    </article>
  );
}

export function SkeletonMarketplaceGrid({
  count = 3,
  label = "Loading…",
  className,
  variant = "services",
}: {
  count?: number;
  label?: string;
  className?: string;
  variant?: SkeletonMarketplaceCardVariant;
}) {
  return (
    <div
      className={cn("skeleton-marketplace-grid", className)}
      aria-live="polite"
      aria-busy="true"
    >
      <span className="skeleton-visually-hidden">{label}</span>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonMarketplaceCard key={index} variant={variant} />
      ))}
    </div>
  );
}

export function SkeletonStack({
  children,
  className,
  label = "Loading…",
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("skeleton-stack", className)}
      aria-live="polite"
      aria-busy="true"
    >
      <span className="skeleton-visually-hidden">{label}</span>
      {children}
    </div>
  );
}

export function AppLoadingSkeleton() {
  return (
    <div className="skeleton-page-loading" aria-live="polite" aria-busy="true">
      <span className="skeleton-visually-hidden">Loading…</span>
      <SkeletonCard height={120} />
    </div>
  );
}

export function ServersTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <tr key={index} className="skeleton-table-row" aria-hidden>
          <td>
            <div className="skeleton-table-cell-name">
              <SkeletonCircle size={40} />
              <div className="skeleton-stack" style={{ gap: "0.375rem", flex: 1 }}>
                <SkeletonText width="70%" />
                <SkeletonText width="45%" size="sm" />
              </div>
            </div>
          </td>
          <td>
            <Skeleton className="skeleton-table-cell" style={{ maxWidth: "10rem" }} />
          </td>
          <td>
            <Skeleton
              className="skeleton-table-cell skeleton-table-cell-short"
            />
          </td>
          <td>
            <Skeleton
              className="skeleton-table-cell skeleton-table-cell-actions"
            />
          </td>
        </tr>
      ))}
    </>
  );
}

export function ServerDetailPageSkeleton() {
  return (
    <div className="dashboard server-detail skeleton-page" aria-live="polite" aria-busy="true">
      <span className="skeleton-visually-hidden">Loading server…</span>
      <header className="server-detail-header">
        <Skeleton className="skeleton-server-detail-back" />
        <div className="server-detail-header-main">
          <SkeletonText width="12rem" size="lg" style={{ height: "1.875rem" }} />
          <SkeletonText width="16rem" size="sm" />
        </div>
      </header>
      <div className="skeleton-tabs" aria-hidden>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="skeleton-tab" />
        ))}
      </div>
      <SkeletonMarketplaceGrid count={3} label="Loading overview…" variant="overview" />
    </div>
  );
}

export function DeployServiceSummaryCardSkeleton() {
  return (
    <div className="skeleton-deploy-service-card" aria-hidden>
      <Skeleton className="skeleton-deploy-service-card-accent" />
      <div className="skeleton-deploy-service-card-body">
        <SkeletonCircle size={56} />
        <div className="skeleton-deploy-service-card-content">
          <div className="skeleton-deploy-service-card-top">
            <div className="skeleton-deploy-service-card-details">
              <SkeletonText width="42%" size="lg" />
              <SkeletonText width="28%" size="sm" />
              <SkeletonText width="72%" />
            </div>
            <div className="skeleton-deploy-service-card-target">
              <SkeletonText width="4.5rem" size="sm" />
              <SkeletonText width="6.5rem" />
            </div>
          </div>
          <Skeleton className="skeleton-deploy-service-meta" />
        </div>
      </div>
    </div>
  );
}

export function DeployConfigurePageSkeleton() {
  return (
    <div className="skeleton-page" aria-live="polite" aria-busy="true">
      <span className="skeleton-visually-hidden">
        Loading deployment configuration…
      </span>
      <DeployServiceSummaryCardSkeleton />
      <Skeleton className="skeleton-card" style={{ height: "24rem" }} />
    </div>
  );
}

export function DeployFormFieldsSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <div className="skeleton-stack" aria-live="polite" aria-busy="true">
      <span className="skeleton-visually-hidden">
        Loading template configuration…
      </span>
      {Array.from({ length: fields }).map((_, index) => (
        <div key={index} className="skeleton-form-field" aria-hidden>
          <Skeleton className="skeleton-form-label" />
          <Skeleton className="skeleton-form-input" />
        </div>
      ))}
    </div>
  );
}

export function DeployLogsServiceCardSkeleton() {
  return (
    <div className="skeleton-deploy-service-card" aria-hidden>
      <Skeleton className="skeleton-deploy-service-card-accent" />
      <div className="skeleton-deploy-service-card-body">
        <SkeletonCircle size={56} />
        <div className="skeleton-deploy-service-card-content">
          <div className="skeleton-deploy-service-card-top">
            <div className="skeleton-deploy-service-card-details">
              <SkeletonText width="42%" size="lg" />
              <SkeletonText width="28%" size="sm" />
              <SkeletonText width="72%" />
            </div>
            <div className="skeleton-deploy-service-card-target">
              <SkeletonText width="14rem" size="sm" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeployLogsPageSkeleton() {
  return (
    <div className="dashboard skeleton-page skeleton-deploy-logs" aria-live="polite" aria-busy="true">
      <span className="skeleton-visually-hidden">Loading deployment…</span>
      <SkeletonText width="7rem" size="sm" />
      <DeployLogsServiceCardSkeleton />
      <Skeleton className="skeleton-deploy-terminal" />
    </div>
  );
}

export function McpKeysTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <>
      <span className="skeleton-visually-hidden">Loading tokens…</span>
      {Array.from({ length: rows }).map((_, index) => (
        <tr key={index} className="skeleton-table-row" aria-hidden>
          <td>
            <SkeletonText width="70%" />
          </td>
          <td>
            <Skeleton className="skeleton-table-cell" style={{ maxWidth: "7rem" }} />
          </td>
          <td>
            <Skeleton
              className="skeleton-table-cell skeleton-table-cell-short"
            />
          </td>
          <td>
            <Skeleton className="skeleton-table-cell" style={{ maxWidth: "7rem" }} />
          </td>
          <td>
            <Skeleton className="skeleton-table-cell skeleton-table-cell-actions" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function ProfilePageSkeleton() {
  return (
    <div className="profile-page skeleton-page" aria-live="polite" aria-busy="true">
      <span className="skeleton-visually-hidden">Loading profile…</span>
      <SkeletonText width="8.5rem" size="sm" />
      <header className="dashboard-header">
        <div className="skeleton-stack" style={{ gap: "0.5rem" }}>
          <SkeletonText width="6rem" size="lg" style={{ height: "1.75rem" }} />
          <SkeletonText width="20rem" size="sm" />
        </div>
      </header>
      <div className="profile-page-body">
        <div className="skeleton-profile-card skeleton-stack">
          <SkeletonText width="8rem" size="lg" />
          <SkeletonText width="100%" />
          <SkeletonText width="80%" />
          <Skeleton className="skeleton-form-input" />
          <Skeleton className="skeleton-form-input" />
        </div>
        <div className="skeleton-profile-card skeleton-stack">
          <SkeletonText width="10rem" size="lg" />
          <Skeleton className="skeleton-form-input" />
          <Skeleton className="skeleton-form-input" />
          <Skeleton className="skeleton-form-input" />
        </div>
      </div>
    </div>
  );
}
