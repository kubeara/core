import { ClientChannel } from "ssh2";

export interface SshTerminalSession {
  sessionId: string;
  serverId: string;
  connectionId: string;
  stream: ClientChannel;
}
