import { Injectable } from "@nestjs/common";

import {
  AgentInstallResult,
  AgentInstallService,
  RemoteAgentInstallInput,
} from "./agent-install.service";

export type { AgentInstallResult, RemoteAgentInstallInput };

@Injectable()
export class RemoteAgentInstallService {
  constructor(private readonly agentInstall: AgentInstallService) {}

  install(input: RemoteAgentInstallInput): Promise<AgentInstallResult> {
    return this.agentInstall.installOnRemote(input);
  }
}
