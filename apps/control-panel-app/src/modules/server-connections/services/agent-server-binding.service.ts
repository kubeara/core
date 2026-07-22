import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";

import { EntityStatus } from "@control-panel/common/entity/base.entity";
import { normalizeServerHostForUrls } from "@control-panel/modules/deployments/utils/deployment-server.util";
import { logStructured, logStructuredError } from "@shared/common";

import { LOCAL_SERVER } from "../constants/local-server.constants";
import { ServerEntity } from "../entities/server.entity";

export interface ResolveAgentServerBindingInput {
  /** Install-written server UUID from agent env. */
  explicitServerId?: string | null;
  /** Public IP/host reported by the agent handshake. */
  reportedPublicIp?: string | null;
}

/**
 * Maps an agent connection to control-panel `servers` rows.
 * Multiple users on the same host share one agent socket.
 */
@Injectable()
export class AgentServerBindingService {
  private readonly logger = new Logger(AgentServerBindingService.name);

  constructor(
    @InjectRepository(ServerEntity)
    private readonly serverRepository: Repository<ServerEntity>,
  ) {}

  /**
   * Resolves every active server id this agent should serve.
   * Preference: install id → reported host → local loopback host.
   */
  async resolveSharedHostServerIds(
    input: ResolveAgentServerBindingInput,
  ): Promise<string[]> {
    try {
      const explicit = input.explicitServerId?.trim();
      if (explicit) {
        const server = await this.findActiveServerById(explicit);
        if (server) {
          const serverIds = await this.listActiveServerIdsForHost(server.host);
          logStructured(
            this.logger,
            "log",
            "agent.server_binding",
            "succeeded",
            {
              module: "AgentServerBindingService",
              serverId: explicit,
              reason: "install_id",
            },
          );
          return serverIds;
        }
        logStructured(this.logger, "warn", "agent.server_binding", "failed", {
          module: "AgentServerBindingService",
          serverId: explicit,
          reason: "no_active_server_for_install_id",
        });
      }

      const reportedIp = input.reportedPublicIp?.trim();
      if (reportedIp) {
        const byHost = await this.listActiveServerIdsForHost(reportedIp);
        if (byHost.length > 0) {
          logStructured(
            this.logger,
            "log",
            "agent.server_binding",
            "succeeded",
            {
              module: "AgentServerBindingService",
              serverId: byHost[0],
              reason: "host_match",
            },
          );
          return byHost;
        }
      }

      const isLocalAgent =
        !reportedIp ||
        reportedIp === "127.0.0.1" ||
        reportedIp === "::1" ||
        reportedIp === "localhost";

      if (isLocalAgent) {
        const localIds = await this.listActiveServerIdsForHost(
          LOCAL_SERVER.HOST,
        );
        if (localIds.length > 0) {
          logStructured(
            this.logger,
            "log",
            "agent.server_binding",
            "succeeded",
            {
              module: "AgentServerBindingService",
              serverId: localIds[0],
              reason: "local_server_fallback",
            },
          );
        }
        return localIds;
      }

      logStructured(this.logger, "warn", "agent.server_binding", "failed", {
        module: "AgentServerBindingService",
        reason: "unresolvable_binding",
      });
      return [];
    } catch (error) {
      logStructuredError(this.logger, "agent.server_binding", error, {
        module: "AgentServerBindingService",
      });
      return [];
    }
  }

  /**
   * Lists active server ids for a host (indexed `host` lookup).
   */
  async listActiveServerIdsForHost(hostOrIp: string): Promise<string[]> {
    try {
      const trimmed = hostOrIp.trim();
      if (!trimmed) {
        return [];
      }

      const normalized = normalizeServerHostForUrls(trimmed);
      const hosts = normalized === trimmed ? [trimmed] : [trimmed, normalized];

      const servers = await this.serverRepository.find({
        where: {
          host: In(hosts),
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
        select: {
          id: true,
        },
      });

      return servers.map((server) => server.id);
    } catch (error) {
      logStructuredError(
        this.logger,
        "agent.server_binding.list_by_host",
        error,
        {
          module: "AgentServerBindingService",
        },
      );
      return [];
    }
  }

  /** Loads an active server by id (id + host only). */
  private async findActiveServerById(
    serverId: string,
  ): Promise<ServerEntity | null> {
    try {
      return await this.serverRepository.findOne({
        where: {
          id: serverId,
          status: EntityStatus.ACTIVE,
          deletedAt: IsNull(),
        },
        select: {
          id: true,
          host: true,
        },
      });
    } catch (error) {
      logStructuredError(
        this.logger,
        "agent.server_binding.load_server",
        error,
        {
          module: "AgentServerBindingService",
          serverId,
        },
      );
      return null;
    }
  }
}
