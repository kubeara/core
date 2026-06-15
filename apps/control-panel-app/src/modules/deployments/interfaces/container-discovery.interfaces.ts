export interface DeploymentMatchRecord {
  id: string;
  templateSlug: string;
  serviceName: string | null;
  composeProject: string;
}
