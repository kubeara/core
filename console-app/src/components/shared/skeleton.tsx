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
      <SkeletonText width="7rem" size="sm" />
      <header className="dashboard-header">
        <div className="skeleton-stack" style={{ gap: "0.5rem" }}>
          <SkeletonText width="14rem" size="lg" style={{ height: "1.75rem" }} />
          <SkeletonText width="18rem" size="sm" />
        </div>
      </header>
      <div className="skeleton-tabs" aria-hidden>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="skeleton-tab" />
        ))}
      </div>
      <SkeletonGrid count={3} cardHeight={200} />
    </div>
  );
}

export function DeployConfigurePageSkeleton() {
  return (
    <div className="skeleton-page" aria-live="polite" aria-busy="true">
      <span className="skeleton-visually-hidden">
        Loading deployment configuration…
      </span>
      <Skeleton className="skeleton-deploy-service-card" />
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

export function DeployLogsPageSkeleton() {
  return (
    <div className="dashboard skeleton-page skeleton-deploy-logs" aria-live="polite" aria-busy="true">
      <span className="skeleton-visually-hidden">Loading deployment…</span>
      <SkeletonText width="7rem" size="sm" />
      <Skeleton className="skeleton-deploy-service-card" />
      <Skeleton className="skeleton-deploy-terminal" />
    </div>
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
