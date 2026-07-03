import { ServerDetailSectionHeader } from "../server-detail-section-header";

export function ServerActivityTab() {
  return (
    <div className="server-detail-panel">
      <ServerDetailSectionHeader
        title="Recent activity"
        description="Deployments, configuration changes, and alerts for this server."
      />
      <div className="server-templates-state">
        <p className="server-templates-state-title">Coming soon</p>
        <p className="server-templates-state-text">
          A timeline of deployments, configuration changes, and alerts for
          this server is on the way. Check back in a future update.
        </p>
      </div>
    </div>
  );
}
