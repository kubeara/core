import { ServerTerminalPanel } from "@/features/servers/components/server-terminal-panel";

type ServerTerminalTabProps = {
  serverId: string;
  serverName: string;
  serverHost: string;
  isVisible: boolean;
};

export function ServerTerminalTab({
  serverId,
  serverName,
  serverHost,
  isVisible,
}: ServerTerminalTabProps) {
  return (
    <ServerTerminalPanel
      serverId={serverId}
      serverName={serverName}
      serverHost={serverHost}
      isVisible={isVisible}
    />
  );
}
