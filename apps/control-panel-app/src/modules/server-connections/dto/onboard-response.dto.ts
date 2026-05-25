export interface AgentInstallResponse {
  success: boolean;
  logs: string[];
  error?: string;
  skipped?: boolean;
}

export interface OnboardSuccessResponse {
  success: true;
  serverId: string;
  sshCredentialId: string;
  sshTest: { success: true };
  agentInstall?: AgentInstallResponse;
  message: string;
}

export interface OnboardFailureResponse {
  success: false;
  step: "SSH_TEST" | "AGENT_INSTALL";
  error: string;
  code: string;
  logs: string[];
}

export type OnboardResponseDto =
  | OnboardSuccessResponse
  | OnboardFailureResponse;
