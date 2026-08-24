export const DEFAULT_CONTROL_PANEL_PORT = 9461;

/**
 * Resolves the externally reachable base URL of the control panel.
 *
 * Precedence:
 * 1. Explicitly configured `CONTROL_PANEL_URL` (cloud, custom domains, tunnels).
 * 2. Derived from the deployed backend port (`SERVICE_PORT_KUBEARA`), so
 *    changing the published port in a deployment does not stale the default.
 *
 * The derived form assumes same-host access (`localhost`), which matches the
 * self-host template default; remote agents use SSH tunnel URLs instead and
 * never consult this fallback.
 */
export function resolveControlPanelUrl(
  configuredUrl?: string | null,
  servicePort?: string | number | null,
): string {
  const configured = configuredUrl?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const rawPort =
    servicePort == null || servicePort === ""
      ? process.env.SERVICE_PORT_KUBEARA
      : servicePort;
  const parsed = Number.parseInt(String(rawPort ?? ""), 10);
  const port =
    Number.isInteger(parsed) && parsed > 0 && parsed < 65536
      ? parsed
      : DEFAULT_CONTROL_PANEL_PORT;
  return `http://localhost:${port}`;
}
