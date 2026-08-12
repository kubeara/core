import { buildAgentSocketTunnelControlPanelUrl } from "../constants/agent-socket-tunnel.constants";
import { parseAgentSocketTunnelPort } from "./agent-socket-tunnel-port.util";
import { resolveAgentControlPanelUrl } from "./resolve-agent-control-panel-url.util";
import { isCloudVersionEnabled } from "./cloud-version.util";

describe("isCloudVersionEnabled", () => {
  it("is true only for the string true", () => {
    expect(isCloudVersionEnabled("true")).toBe(true);
    expect(isCloudVersionEnabled("TRUE")).toBe(true);
    expect(isCloudVersionEnabled("false")).toBe(false);
    expect(isCloudVersionEnabled(undefined)).toBe(false);
    expect(isCloudVersionEnabled("")).toBe(false);
  });
});

describe("parseAgentSocketTunnelPort", () => {
  it("fails when unset or invalid", () => {
    expect(parseAgentSocketTunnelPort(undefined).ok).toBe(false);
    expect(parseAgentSocketTunnelPort("").ok).toBe(false);
    expect(parseAgentSocketTunnelPort("abc").ok).toBe(false);
    expect(parseAgentSocketTunnelPort("0").ok).toBe(false);
    expect(parseAgentSocketTunnelPort("70000").ok).toBe(false);
  });

  it("accepts a valid port", () => {
    expect(parseAgentSocketTunnelPort("2222")).toEqual({
      ok: true,
      port: 2222,
    });
    expect(parseAgentSocketTunnelPort(" 1111 ")).toEqual({
      ok: true,
      port: 1111,
    });
  });
});

describe("resolveAgentControlPanelUrl", () => {
  it("uses the tunnel URL for remote self-host", () => {
    const result = resolveAgentControlPanelUrl({
      remoteHost: true,
      isCloudVersion: false,
      tunnelPort: 1111,
      configuredUrl: "https://panel.example.com",
    });
    expect(result).toEqual({
      ok: true,
      url: buildAgentSocketTunnelControlPanelUrl(1111),
    });
  });

  it("fails remote self-host when tunnelPort is missing", () => {
    const result = resolveAgentControlPanelUrl({
      remoteHost: true,
      isCloudVersion: false,
      configuredUrl: "https://panel.example.com",
    });
    expect(result.ok).toBe(false);
  });

  it("uses a custom tunnel port for remote self-host", () => {
    const result = resolveAgentControlPanelUrl({
      remoteHost: true,
      isCloudVersion: false,
      tunnelPort: 2222,
      configuredUrl: "https://panel.example.com",
    });
    expect(result).toEqual({
      ok: true,
      url: "http://host.docker.internal:2222",
    });
  });

  it("uses the configured public URL for remote cloud", () => {
    const result = resolveAgentControlPanelUrl({
      remoteHost: true,
      isCloudVersion: true,
      configuredUrl: "https://panel.example.com",
    });
    expect(result).toEqual({ ok: true, url: "https://panel.example.com" });
  });

  it("uses the configured URL for local installs", () => {
    const result = resolveAgentControlPanelUrl({
      remoteHost: false,
      isCloudVersion: false,
      configuredUrl: "http://host.docker.internal:3000",
    });
    expect(result).toEqual({
      ok: true,
      url: "http://host.docker.internal:3000",
    });
  });

  it("fails local/cloud install when CONTROL_PANEL_URL is missing", () => {
    const result = resolveAgentControlPanelUrl({
      remoteHost: false,
      isCloudVersion: false,
      configuredUrl: "  ",
    });
    expect(result.ok).toBe(false);
  });
});
