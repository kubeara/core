import {
  AGENT_SOCKET_TUNNEL_PORT_ENV,
  buildAgentSocketTunnelControlPanelUrl,
} from "../constants/agent-socket-tunnel.constants";
import { AGENT_INSTALL_ENV_KEYS } from "../constants/agent-install.constants";

export interface ResolveAgentControlPanelUrlInput {
  /** True when installing on a remote SSH host (not the local machine). */
  remoteHost: boolean;
  /** True when `IS_CLOUD_VERSION=true` on the control panel. */
  isCloudVersion: boolean;
  /** Control panel `CONTROL_PANEL_URL` from config (public or local direct URL). */
  configuredUrl?: string | null;
  /**
   * Remote SSH reverse-tunnel port from `AGENT_SOCKET_TUNNEL_PORT`.
   * Required for remote self-host installs.
   */
  tunnelPort?: number | null;
}

export type ResolveAgentControlPanelUrlResult =
  { ok: true; url: string } | { ok: false; error: string };

/**
 * Chooses the `CONTROL_PANEL_URL` written into the remote agent `.env.agent`.
 *
 * | Mode | Remote host | Result |
 * |------|-------------|--------|
 * | Self-host | yes | `http://host.docker.internal:{tunnelPort}` (SSH tunnel on host) |
 * | Cloud | yes | configured public `CONTROL_PANEL_URL` |
 * | Local | no | configured URL (e.g. `host.docker.internal:3000`) |
 *
 * @param input.remoteHost - Whether the agent runs on a remote SSH server.
 * @param input.isCloudVersion - Whether cloud mode skips tunnels.
 * @param input.configuredUrl - Panel env `CONTROL_PANEL_URL` (required except remote self-host).
 * @param input.tunnelPort - Remote tunnel port from `AGENT_SOCKET_TUNNEL_PORT` (required for remote self-host).
 * @returns Resolved URL or a validation error when config is missing.
 */
export function resolveAgentControlPanelUrl(
  input: ResolveAgentControlPanelUrlInput,
): ResolveAgentControlPanelUrlResult {
  try {
    if (input.remoteHost && !input.isCloudVersion) {
      const port = input.tunnelPort;
      if (
        port == null ||
        !Number.isFinite(port) ||
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
      ) {
        return {
          ok: false,
          error:
            `Missing or invalid ${AGENT_SOCKET_TUNNEL_PORT_ENV} on the control panel. ` +
            "Add a port 1–65535 to apps/control-panel-app/.env and restart the app.",
        };
      }
      return { ok: true, url: buildAgentSocketTunnelControlPanelUrl(port) };
    }

    const configured = input.configuredUrl?.trim();
    if (configured) {
      return { ok: true, url: configured };
    }

    return {
      ok: false,
      error:
        `Missing ${AGENT_INSTALL_ENV_KEYS.CONTROL_PANEL_URL} on the control panel. ` +
        "Add it to apps/control-panel-app/.env (e.g. http://host.docker.internal:3000 for local agent, or your public URL for cloud) and restart the app.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Failed to resolve agent CONTROL_PANEL_URL: ${message}`,
    };
  }
}
