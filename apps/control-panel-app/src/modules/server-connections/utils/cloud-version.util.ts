import { IS_CLOUD_VERSION_ENV } from "../constants/agent-socket-tunnel.constants";

/**
 * Returns whether the control panel runs in cloud mode (public agent sockets).
 *
 * Self-host is the default: unset, empty, or any value other than `true` enables
 * SSH reverse tunnels for remote agents.
 *
 * @param value - Raw `IS_CLOUD_VERSION` env string (may be undefined in self-host).
 * @returns `true` only when value is `true` (case-insensitive); otherwise `false`.
 */
export function isCloudVersionEnabled(
  value: string | undefined | null,
): boolean {
  try {
    return value?.trim().toLowerCase() === "true";
  } catch (error) {
    console.error(
      `isCloudVersionEnabled failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Reads {@link IS_CLOUD_VERSION_ENV} via a config/env accessor.
 *
 * @param getEnv - Function that returns env values (e.g. `ConfigService.get`).
 * @returns Whether cloud mode is enabled for agent socket connectivity.
 */
export function readIsCloudVersionFromEnv(
  getEnv: (key: string) => string | undefined,
): boolean {
  try {
    return isCloudVersionEnabled(getEnv(IS_CLOUD_VERSION_ENV));
  } catch (error) {
    console.error(
      `readIsCloudVersionFromEnv failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}
