import { Injectable } from "@nestjs/common";

import {
  AgentInstallLogCallback,
  AgentInstallResult,
  AgentInstallService,
  RemoteAgentInstallInput,
} from "./agent-install.service";

export type { AgentInstallResult, RemoteAgentInstallInput };

@Injectable()
export class RemoteAgentInstallService {
  constructor(private readonly agentInstall: AgentInstallService) {}

  install(
    input: RemoteAgentInstallInput,
    options?: { onLogLine?: AgentInstallLogCallback },
  ): Promise<AgentInstallResult> {
    return this.agentInstall.installOnRemote(input, options);
  }
}
