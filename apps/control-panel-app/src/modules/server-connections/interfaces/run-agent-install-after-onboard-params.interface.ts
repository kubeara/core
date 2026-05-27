import { ServerEntity } from "../entities/server.entity";
import { ServerSshCredentialEntity } from "../entities/server-ssh-credential.entity";

export interface RunAgentInstallAfterOnboardParams {
  installAgent: boolean | undefined;
  server: ServerEntity;
  credential: ServerSshCredentialEntity;
  plainPrivateKey?: string;
  logs: string[];
}
