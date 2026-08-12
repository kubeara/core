import { AGENT_SOCKET_TUNNEL_PORT_ENV } from "../constants/agent-socket-tunnel.constants";

export type ParseAgentSocketTunnelPortResult =
  { ok: true; port: number } | { ok: false; error: string };

/**
 * Parses {@link AGENT_SOCKET_TUNNEL_PORT_ENV} into a valid TCP port.
 *
 * Missing, empty, non-numeric, or out-of-range values are errors — the env var
 * must always be set in the control panel `.env`.
 *
 * @param value - Raw env string.
 * @returns Parsed port (1–65535) or a validation error.
 */
export function parseAgentSocketTunnelPort(
  value: string | undefined | null,
): ParseAgentSocketTunnelPortResult {
  try {
    const trimmed = value?.trim();
    if (!trimmed) {
      return {
        ok: false,
        error:
          `Missing ${AGENT_SOCKET_TUNNEL_PORT_ENV} on the control panel. ` +
          "Add it to apps/control-panel-app/.env (e.g. 1111) and restart the app.",
      };
    }
    const port = Number(trimmed);
    if (!Number.isFinite(port) || !Number.isInteger(port)) {
      return {
        ok: false,
        error: `Invalid ${AGENT_SOCKET_TUNNEL_PORT_ENV}="${trimmed}". Expected an integer port 1–65535.`,
      };
    }
    if (port < 1 || port > 65535) {
      return {
        ok: false,
        error: `Invalid ${AGENT_SOCKET_TUNNEL_PORT_ENV}=${port}. Expected an integer port 1–65535.`,
      };
    }
    return { ok: true, port };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Failed to parse ${AGENT_SOCKET_TUNNEL_PORT_ENV}: ${message}`,
    };
  }
}

/**
 * Reads {@link AGENT_SOCKET_TUNNEL_PORT_ENV} via a config/env accessor.
 *
 * @param getEnv - Function that returns env values (e.g. `ConfigService.get`).
 * @returns Parsed port or a validation error when unset/invalid.
 */
export function readAgentSocketTunnelPortFromEnv(
  getEnv: (key: string) => string | undefined,
): ParseAgentSocketTunnelPortResult {
  try {
    return parseAgentSocketTunnelPort(getEnv(AGENT_SOCKET_TUNNEL_PORT_ENV));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: `Failed to read ${AGENT_SOCKET_TUNNEL_PORT_ENV}: ${message}`,
    };
  }
}
