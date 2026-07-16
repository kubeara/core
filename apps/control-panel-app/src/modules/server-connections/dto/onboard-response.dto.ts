export interface AgentInstallResponse {
  success: boolean;
  logs: string[];
  error?: string;
  skipped?: boolean;
  pending?: boolean;
}

export interface OnboardSuccessData {
  serverId: string;
  sshCredentialId: string;
  sshTest: { success: true };
  agentInstall?: AgentInstallResponse;
}

export type OnboardResponseDto = OnboardSuccessData;
