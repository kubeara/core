import { TerminalTransport } from "../enums/terminal-transport.enum";

export class TerminalConnectResponseDto {
  sessionId!: string;
  serverId!: string;
  transport!: TerminalTransport;
}
