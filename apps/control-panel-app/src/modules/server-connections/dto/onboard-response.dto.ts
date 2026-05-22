export interface OnboardSuccessResponse {
  success: true;
  serverId: string;
  sshCredentialId: string;
  sshTest: { success: true };
  message: string;
}

export interface OnboardFailureResponse {
  success: false;
  step: "SSH_TEST";
  error: string;
  code: string;
  logs: string[];
}

export type OnboardResponseDto =
  | OnboardSuccessResponse
  | OnboardFailureResponse;
