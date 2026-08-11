export const SERVER_CONNECTIONS = {
  /** Expected upper bound for POST /servers/:id/delete (matches console client timeout). */
  SERVER_DELETE_OPERATION_TIMEOUT_MS: 120_000,
  SOCKET_RESOURCES_ATTEMPT_MS: 5_000,
  SOCKET_CONTAINER_DISCOVER_ATTEMPT_MS: 15_000,
  AGENT_IMAGE_REMOVE_TIMEOUT_MS: 60_000,
  AGENT_TEARDOWN_SETTLE_MS: 5_000,
  /** Reverse SSH tunnel for self-hosted agent connectivity. */
  TUNNEL: {
    /**
     * Bind address for the reverse-forwarded port on the remote host.
     * 0.0.0.0 keeps bridge-networked agent containers (host.docker.internal)
     * able to reach the tunnel; only a random, unadvertised port is exposed,
     * and it forwards to the local control panel socket server, never the agent.
     */
    BIND_HOST: "0.0.0.0",
    /** Local control panel socket server host used as the tunnel destination. */
    LOCAL_HOST: "127.0.0.1",
    /** Inclusive range for dynamically selected tunnel bind ports. */
    PORT_MIN: 20_000,
    PORT_MAX: 29_999,
    PORT_PICK_ATTEMPTS: 40,
    /** Metadata key persisting the chosen bind port per server (no DB migration). */
    METADATA_PORT_KEY: "tunnelPort",

    STABLE_PORT_MIN: 30_000,
    STABLE_PORT_MAX: 39_999,
    STABLE_PORT_PICK_ATTEMPTS: 40,
    /**
     * Metadata key persisting the stable, Agent-facing endpoint port per server.
     * This port never changes across SSH tunnel reconnects and is the only port
     * ever written into CONTROL_PANEL_URL.
     */
    METADATA_STABLE_PORT_KEY: "stablePort",

    /**
     * Remote TCP proxy (socat) managed on the Agent's Docker host. It listens on
     * 0.0.0.0:<stablePort> and forwards to 127.0.0.1:<tunnelPort>, so the stable
     * port keeps working even when the SSH tunnel rebinds a new tunnel port.
     */
    STABLE_PROXY: {
      /** Remote pidfile path prefix (per server) so the control panel can manage the proxy. */
      PID_FILE_PREFIX: "/tmp/kubeara-proxy-",
      /** Per remote command timeout for proxy/socat management. */
      EXEC_TIMEOUT_MS: 20_000,
      /** How long to wait after launching socat before verifying it stayed up. */
      START_SETTLE_MS: 2_000,
    },

    /** Delay before re-establishing a dropped tunnel. */
    RETRY_DELAY_MS: 5_000,
  },
} as const;

/**
 * True when the control panel runs in self-hosted mode, where remote agents
 * cannot dial the control panel directly and must connect through reverse
 * SSH tunnels. Absent/unset (or any value other than true/1) means Cloud mode.
 */
export function isSelfHosted(): boolean {
  return process.env.SELF_HOSTED === "true" || process.env.SELF_HOSTED === "1";
}
