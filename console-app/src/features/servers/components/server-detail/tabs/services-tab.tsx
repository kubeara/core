import { ServerTemplatesPanel } from "@/features/templates/components/server-templates-panel";

type ServerServicesTabProps = {
  serverId: string;
  connectedIds: Set<string>;
};

export function ServerServicesTab({
  serverId,
  connectedIds,
}: ServerServicesTabProps) {
  return (
    <div className="server-detail-panel server-detail-templates">
      <h2 className="server-detail-section-title">Deploy a template</h2>
      <p className="server-detail-section-desc">
        Browse the marketplace and deploy services directly to this server.
      </p>
      <ServerTemplatesPanel
        serverId={serverId}
        connectedTemplateSlugs={connectedIds}
      />
    </div>
  );
}
