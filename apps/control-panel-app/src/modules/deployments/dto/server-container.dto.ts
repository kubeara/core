import { ManagedType } from "../enums/managed-type.enum";

export interface ServerContainerDto {
  containerId: string | null;
  containerName: string;
  imageName: string;
  status: string;
  ports: string;
  runningSince: string;
  lastRestarted: string;
  managedType: ManagedType;
  deploymentId: string | null;
  templateId: string | null;
  serviceName: string | null;
  serverId: string;
  isOnline: boolean;
}
