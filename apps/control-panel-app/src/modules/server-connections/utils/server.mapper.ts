import { SshConnectionManager } from "@shared/ssh";
import { ServerResponseDto } from "../dto/server-response.dto";
import { ServerEntity } from "../entities/server.entity";
import {
  extractAgentErrorMessage,
  extractServerErrorMessage,
} from "./server-error.util";
import { readServerOperationFromMetadata } from "./server-operation.util";

export function toServerResponseDto(
  server: ServerEntity,
  sshManager: SshConnectionManager,
  isAgentConnected: (serverId: string) => boolean,
): ServerResponseDto {
  const { operationStatus } = readServerOperationFromMetadata(server.metadata);
  const agentConnected = isAgentConnected(server.id);

  return {
    id: server.id,
    status: server.status,
    metadata: server.metadata,
    name: server.name,
    host: server.host,
    port: server.port,
    username: server.username,
    provider: server.provider,
    region: server.region,
    operatingSystem: server.operatingSystem,
    serverType: server.serverType,
    lastConnectedAt: server.lastConnectedAt,
    connected: sshManager.isConnected(server.id),
    agentConnected,
    operationStatus,
    serverError: extractServerErrorMessage(server.serverError),
    agentError: agentConnected
      ? null
      : extractAgentErrorMessage(server.agentError),
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    deletedAt: server.deletedAt,
  };
}
