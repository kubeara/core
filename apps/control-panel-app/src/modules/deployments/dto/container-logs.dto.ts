import { IsNotEmpty, IsString } from "class-validator";

export interface ContainerLogsStartResponseDto {
  sessionId: string;
  serverId: string;
  containerId: string;
}

export class ContainerLogsStopDto {
  @IsString()
  @IsNotEmpty()
  sessionId!: string;
}
