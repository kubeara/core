export interface DeploymentMatchRecord {
  id: string;
  templateSlug: string;
  serviceName: string | null;
  composeProject: string;
  /** Server row that owns this deployment (viewer vs sibling on shared host). */
  ownerServerId: string;
}
