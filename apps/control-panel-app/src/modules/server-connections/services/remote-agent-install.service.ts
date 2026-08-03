import { Injectable, Logger } from "@nestjs/common";
import { toErrorMessage } from "@control-panel/common/utils/error.util";
import {
  AgentInstallLogCallback,
  AgentInstallResult,
  RemoteAgentInstallInput,
} from "../interfaces/agent-install.interfaces";
import { AgentInstallService } from "./agent-install.service";

export type { AgentInstallResult, RemoteAgentInstallInput };

@Injectable()
export class RemoteAgentInstallService {
  private readonly logger = new Logger(RemoteAgentInstallService.name);

  constructor(private readonly agentInstall: AgentInstallService) {}

  async install(
    input: RemoteAgentInstallInput,
    options?: { onLogLine?: AgentInstallLogCallback },
  ): Promise<AgentInstallResult> {
    try {
      return await this.agentInstall.installOnRemote(input, options);
    } catch (error) {
      this.logger.error(
        `Remote agent install failed for server '${input.connection.serverId}': ${toErrorMessage(error)}`,
      );
      throw error;
    }
  }
}
