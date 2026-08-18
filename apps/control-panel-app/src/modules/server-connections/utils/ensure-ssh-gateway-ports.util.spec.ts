import {
  buildEnsureSshGatewayPortsCommand,
  ENSURE_SSH_GATEWAY_PORTS_SCRIPT,
  SSH_GATEWAY_PORTS_DROPIN_PATH,
} from "./ensure-ssh-gateway-ports.util";

describe("ensure-ssh-gateway-ports.util", () => {
  it("embeds the drop-in path and required sshd settings", () => {
    expect(ENSURE_SSH_GATEWAY_PORTS_SCRIPT).toContain(
      SSH_GATEWAY_PORTS_DROPIN_PATH,
    );
    expect(ENSURE_SSH_GATEWAY_PORTS_SCRIPT).toContain("AllowTcpForwarding yes");
    expect(ENSURE_SSH_GATEWAY_PORTS_SCRIPT).toContain(
      "GatewayPorts clientspecified",
    );
  });

  it("builds a base64-piped bash command so remote shells do not expand $()", () => {
    const command = buildEnsureSshGatewayPortsCommand();
    expect(command).toMatch(/^echo [A-Za-z0-9+/]+=* \| /);
    expect(command).toContain("base64");
    expect(command).toContain("| bash");
    // Script dollars must not appear unencoded in the outer command.
    expect(command).not.toContain("$(id -u)");
    expect(command).not.toContain("${SSHD_BIN}");
  });
});
