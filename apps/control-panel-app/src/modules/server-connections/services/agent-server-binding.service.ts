import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { normalizeServerHostForUrls } from "@control-panel/modules/deployments/utils/deployment-server.util";

import { LOCAL_SERVER } from "../constants/local-server.constants";
import { ServerEntity } from "../entities/server.entity";
import { ServerType } from "../enums/server-type.enum";

export interface ResolveAgentServerBindingInput {
  /** From install-generated agent env (never required from the user). */
  explicitServerId?: string | null;
  /** From agent handshake (env or runtime detection). */
  reportedPublicIp?: string | null;
}

/**
 * Resolves which `servers` row an agent connection belongs to without manual UUID entry.
 */
@Injectable()
export class AgentServerBindingService {
  private readonly logger = new Logger(AgentServerBindingService.name);

  constructor(
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
  ) {}

  /**
   * Determines server id for a newly connected agent.
   *
   * Order:
   * 1. Explicit id from remote install (written into generated `.env.agent` on the host).
   * 2. Match reported public IP to `servers.host`.
   * 3. Single active local server when the agent reports loopback (dev / single-box).
   */
  async resolveServerIdForAgent(
    input: ResolveAgentServerBindingInput,
  ): Promise<string | null> {
    try {
      const explicit = input.explicitServerId?.trim();
      if (explicit) {
        const server = await this.findActiveServer(explicit);
        if (server) {
          this.logger.log(`Agent bound via install id to server ${explicit}`);
          return server.id;
        }
        this.logger.warn(
          `Agent sent server id ${explicit} but no active server was found`,
        );
      }

      const reportedIp = input.reportedPublicIp?.trim();
      if (reportedIp) {
        const byIp = await this.findServerByHost(reportedIp);
        if (byIp) {
          this.logger.log(
            `Agent bound by host match publicIp=${reportedIp} → server ${byIp.id}`,
          );
          return byIp.id;
        }
      }

      const isLocalAgent =
        !reportedIp ||
        reportedIp === "127.0.0.1" ||
        reportedIp === "::1" ||
        reportedIp === "localhost";

      if (isLocalAgent) {
        const localId = await this.resolveUniqueLocalServerId();
        if (localId) {
          this.logger.log(
            `Agent bound to local server ${localId} (no remote host match)`,
          );
          return localId;
        }
      }

      this.logger.warn(
        "Agent connected without a resolvable server binding. " +
          "Onboard the host or ensure AGENT_PUBLIC_IP matches servers.host.",
      );
      return null;
    } catch (error) {
      this.logger.error(
        `Failed to resolve agent server binding: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async resolveUniqueLocalServerId(): Promise<string | null> {
    try {
      const localServers = await this.serverRepository.find({
        where: {
          // serverType: ServerType.LOCAL,
          host: LOCAL_SERVER.HOST,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });

      if (localServers.length === 1) {
        return localServers[0].id;
      }

      if (localServers.length > 1) {
        this.logger.warn(
          "Multiple local servers exist; use install server id or match servers.host via public IP.",
        );
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Failed to resolve local server binding: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async findActiveServer(
    serverId: string,
  ): Promise<ServerEntity | null> {
    try {
      return await this.serverRepository.findOne({
        where: {
          id: serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to load server ${serverId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  private async findServerByHost(
    reportedHostOrIp: string,
  ): Promise<ServerEntity | null> {
    try {
      const normalizedReported = normalizeServerHostForUrls(reportedHostOrIp);
      const servers = await this.serverRepository.find({
        where: {
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });

      const matches = servers.filter(
        (server) =>
          normalizeServerHostForUrls(server.host) === normalizedReported,
      );

      if (matches.length === 1) {
        return matches[0];
      }

      if (matches.length > 1) {
        const remote = matches.find((s) => s.serverType !== ServerType.LOCAL);
        if (remote) {
          this.logger.warn(
            `Multiple servers share host ${normalizedReported}; using ${remote.id}`,
          );
          return remote;
        }
        return matches[0];
      }

      return null;
    } catch (error) {
      this.logger.error(
        `Failed to match server by host: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
