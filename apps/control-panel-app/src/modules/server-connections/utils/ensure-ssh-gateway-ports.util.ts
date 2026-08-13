/**
 * Remote OpenSSH settings required so reverse tunnels can bind on `0.0.0.0`
 * (reachable from Docker `host.docker.internal` / host-gateway).
 */
export const SSH_GATEWAY_PORTS_DROPIN_PATH =
  "/etc/ssh/sshd_config.d/99-kubeara-agent-tunnel.conf";

/**
 * Shell script run over SSH before `forwardIn` (and during agent prereqs).
 * Ensures `AllowTcpForwarding yes` and `GatewayPorts clientspecified`, then reloads sshd.
 * Idempotent when GatewayPorts is already `clientspecified` or `yes`.
 */
export const ENSURE_SSH_GATEWAY_PORTS_SCRIPT = [
  "set -euo pipefail",
  "",
  'SSHD_BIN="$(command -v sshd 2>/dev/null || true)"',
  'if [ -z "${SSHD_BIN}" ] && [ -x /usr/sbin/sshd ]; then',
  "  SSHD_BIN=/usr/sbin/sshd",
  "fi",
  'if [ -z "${SSHD_BIN}" ]; then',
  '  echo "sshd not found; cannot configure GatewayPorts." >&2',
  "  exit 1",
  "fi",
  "",
  "run_elevated() {",
  '  if [ "$(id -u)" -eq 0 ]; then',
  '    "$@"',
  "  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then",
  '    sudo -n "$@"',
  "  else",
  '    echo "Need root or passwordless sudo to configure sshd GatewayPorts for the agent socket tunnel." >&2',
  "    exit 1",
  "  fi",
  "}",
  "",
  "gatewayports_ok() {",
  "  local value",
  '  value="$("${SSHD_BIN}" -T 2>/dev/null | awk \'/^gatewayports / { print $2; exit }\' || true)"',
  '  case "${value}" in',
  "    clientspecified|yes) return 0 ;;",
  "    *) return 1 ;;",
  "  esac",
  "}",
  "",
  "if gatewayports_ok; then",
  '  value="$("${SSHD_BIN}" -T 2>/dev/null | awk \'/^gatewayports / { print $2; exit }\' || true)"',
  '  echo "SSH GatewayPorts already configured (${value})"',
  "  exit 0",
  "fi",
  "",
  `DROPIN="${SSH_GATEWAY_PORTS_DROPIN_PATH}"`,
  "run_elevated mkdir -p /etc/ssh/sshd_config.d",
  "run_elevated tee \"${DROPIN}\" >/dev/null <<'EOF'",
  "# Managed by Kubeara control panel — required for self-host agent reverse tunnels.",
  "# Allows SSH reverse forwards to bind on non-loopback addresses so Docker agents",
  "# can reach the tunnel via host.docker.internal (host-gateway).",
  "AllowTcpForwarding yes",
  "GatewayPorts clientspecified",
  "EOF",
  "",
  'if ! run_elevated "${SSHD_BIN}" -t; then',
  '  echo "sshd config test failed after writing ${DROPIN}" >&2',
  '  run_elevated rm -f "${DROPIN}" || true',
  "  exit 1",
  "fi",
  "",
  "reloaded=0",
  "if run_elevated systemctl reload ssh 2>/dev/null; then",
  "  reloaded=1",
  "elif run_elevated systemctl reload sshd 2>/dev/null; then",
  "  reloaded=1",
  "elif run_elevated service ssh reload 2>/dev/null; then",
  "  reloaded=1",
  "elif run_elevated service sshd reload 2>/dev/null; then",
  "  reloaded=1",
  "elif run_elevated rc-service sshd reload 2>/dev/null; then",
  "  reloaded=1",
  "fi",
  "",
  'if [ "${reloaded}" -ne 1 ]; then',
  '  echo "Failed to reload sshd after writing ${DROPIN}" >&2',
  "  exit 1",
  "fi",
  "",
  "sleep 1",
  "",
  "if ! gatewayports_ok; then",
  '  value="$("${SSHD_BIN}" -T 2>/dev/null | awk \'/^gatewayports / { print $2; exit }\' || true)"',
  "  echo \"GatewayPorts still '${value:-unknown}' after reload (need clientspecified or yes).\" >&2",
  "  exit 1",
  "fi",
  "",
  'value="$("${SSHD_BIN}" -T 2>/dev/null | awk \'/^gatewayports / { print $2; exit }\' || true)"',
  'echo "SSH GatewayPorts configured (${value})"',
].join("\n");

/**
 * Builds a remote command that runs {@link ENSURE_SSH_GATEWAY_PORTS_SCRIPT}.
 *
 * Uses base64 so OpenSSH's outer `bash -c` does not expand `$(...)` / `${...}`
 * in the script before the inner bash runs it.
 */
export function buildEnsureSshGatewayPortsCommand(): string {
  const encoded = Buffer.from(ENSURE_SSH_GATEWAY_PORTS_SCRIPT, "utf8").toString(
    "base64",
  );
  // Prefer base64 -d (GNU); fall back to -D (BusyBox/macOS) if needed.
  return `echo ${encoded} | (base64 -d 2>/dev/null || base64 -D 2>/dev/null) | bash`;
}
