import { ServerTemplatesPanel } from "@/features/templates/components/server-templates-panel";
import { ServerDetailSectionHeader } from "../server-detail-section-header";

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
      <ServerDetailSectionHeader
        title="Deploy a template"
        description="Browse the marketplace and deploy services directly to this server."
      />
      <ServerTemplatesPanel
        serverId={serverId}
        connectedTemplateSlugs={connectedIds}
      />
    </div>
  );
}
