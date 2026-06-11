import type { ContainerActionType } from "@shared/socket-events";

export type ContainerActionExecutionPath = "agent" | "host";

export interface ContainerActionResponseDto {
  action: ContainerActionType;
  containerId: string;
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executedVia: ContainerActionExecutionPath;
  message: string;
}
