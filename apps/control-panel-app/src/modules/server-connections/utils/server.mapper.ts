import { SshConnectionManager } from "@shared/ssh";
import { ServerResponseDto } from "../dto/server-response.dto";
import { ServerEntity } from "../entities/server.entity";

export function toServerResponseDto(
  server: ServerEntity,
  sshManager: SshConnectionManager,
): ServerResponseDto {
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
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    deletedAt: server.deletedAt,
  };
}
