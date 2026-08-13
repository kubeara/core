/**
 * Self-host agent socket tunnel configuration.
 *
 * When `IS_CLOUD_VERSION` is not `true`, the control panel opens an SSH reverse
 * tunnel so remote agents reach the panel at `host.docker.internal:{port}` without
 * a public URL. Port is always read from {@link AGENT_SOCKET_TUNNEL_PORT_ENV}.
 */

/** Env flag: `true` = public control panel (direct agent sockets). Unset/`false` = self-host tunnels. */
export const IS_CLOUD_VERSION_ENV = "IS_CLOUD_VERSION";

/** Env key for the reverse-tunnel listen port on each remote host (SSH `forwardIn`). Required. */
export const AGENT_SOCKET_TUNNEL_PORT_ENV = "AGENT_SOCKET_TUNNEL_PORT";

/**
 * Builds the URL the agent container uses to reach the tunneled control panel.
 * Tunnel binds on the host; `host.docker.internal` reaches it from Docker.
 *
 * @param port - Remote tunnel listen port from {@link AGENT_SOCKET_TUNNEL_PORT_ENV}.
 */
export function buildAgentSocketTunnelControlPanelUrl(port: number): string {
  return `http://host.docker.internal:${port}`;
}

/** SSH tunnel bind/forward targets and reconnect backoff for {@link AgentSocketTunnelService}. */
export const AGENT_SOCKET_TUNNEL = {
  /**
   * Remote side of `forwardIn`. Empty string = all interfaces (ssh2 / OpenSSH),
   * so Docker can reach the tunnel via `host.docker.internal` (host-gateway).
   * Loopback-only (`127.0.0.1`) is reachable from the VPS host but not from
   * bridge-network containers.
   *
   * Requires `GatewayPorts clientspecified` (or `yes`) in remote `sshd_config`.
   * Configured on a **separate** SSH session before the tunnel connection opens
   * (sshd reload must not apply to the tunnel session).
   */
  REMOTE_BIND_HOST: "",
  /** Display label for logs when {@link AGENT_SOCKET_TUNNEL.REMOTE_BIND_HOST} is empty. */
  REMOTE_BIND_HOST_LOG: "0.0.0.0/*",
  /** Local control-panel HTTP port target on the laptop running the panel. */
  LOCAL_FORWARD_HOST: "127.0.0.1",
  /** Initial reconnect delay after unexpected SSH disconnect (ms). */
  RECONNECT_DELAY_MS: 5_000,
  /** Maximum reconnect backoff cap (ms). */
  RECONNECT_DELAY_MAX_MS: 30_000,
  /**
   * Max automatic reconnect attempts after unexpected disconnect.
   * Permanent auth failures stop immediately (do not consume these).
   */
  RECONNECT_MAX_ATTEMPTS: 3,
} as const;
