import type { PassThrough } from "node:stream";

import { SERVER_CONNECTIONS } from "../constants/server-connections.constants";
import { AgentInstallService } from "./agent-install.service";
import { SshTunnelService } from "./ssh-tunnel.service";

/**
 * Shared mutable state used by the mocked ssh2 Client. Class methods read this
 * lazily (at call time) so no TDZ issues with the hoisted jest.mock factory.
 */
const mockCtl: {
  forwardIn: (port: number) => { port?: number; err?: Error };
  exec: (command: string) => {
    stdout?: string;
    stderr?: string;
    code?: number | null;
  };
  runningStable: number | null;
  runningUpstream: number | null;
} = {
  forwardIn: () => ({ err: new Error("not configured") }),
  exec: () => ({ stdout: "" }),
  runningStable: null,
  runningUpstream: null,
};

jest.mock("ssh2", () => {
  const { EventEmitter } =
    jest.requireActual<typeof import("node:events")>("node:events");
  const { PassThrough } =
    jest.requireActual<typeof import("node:stream")>("node:stream");

  class MockClient extends EventEmitter {
    connectCalls: Array<Record<string, unknown>> = [];
    forwardInCalls: Array<{ host: string; port: number }> = [];
    execCalls: string[] = [];
    endCalls = 0;
    removeAllListenersCalls = 0;

    connect(config: Record<string, unknown>): void {
      this.connectCalls.push(config);
      setImmediate(() => this.emit("ready"));
    }

    forwardIn(
      host: string,
      port: number,
      cb: (err?: Error, boundPort?: number) => void,
    ): void {
      this.forwardInCalls.push({ host, port });
      const result = mockCtl.forwardIn(port);
      if (result.err) {
        cb(result.err);
      } else {
        cb(undefined, result.port);
      }
    }

    exec(command: string, cb: (err?: Error, stream?: unknown) => void): void {
      this.execCalls.push(command);
      const out = mockCtl.exec(command);
      type MockStream = PassThrough & { stderr: PassThrough };
      const stream = new PassThrough() as MockStream;
      const errStream = new PassThrough();
      stream.stderr = errStream;
      cb(undefined, stream);
      setImmediate(() => {
        if (out.stdout) stream.write(out.stdout);
        if (out.stderr) errStream.write(out.stderr);
        stream.end();
        errStream.end();
        stream.emit("close", out.code ?? 0);
      });
    }

    removeAllListeners(): this {
      this.removeAllListenersCalls++;
      return this;
    }

    end(): void {
      this.endCalls++;
      this.emit("close");
    }
  }

  return { Client: MockClient };
});

function makeServerRepo(initial: {
  id: string;
  serverType: string;
  metadata: Record<string, unknown> | null;
}) {
  const entity = { ...initial };
  const updateCalls: Array<{ id: string; patch: Record<string, unknown> }> = [];
  return {
    entity,
    updateCalls,
    findOne: jest.fn(({ where }: { where: { id: string } }) => {
      if (where.id === entity.id) {
        return { ...entity };
      }
      return null;
    }),
    update: jest.fn((id: string, patch: Record<string, unknown>) => {
      updateCalls.push({ id, patch });
      if (patch.metadata && typeof patch.metadata === "object") {
        entity.metadata = { ...(entity.metadata ?? {}), ...patch.metadata };
      }
      Object.assign(entity, patch);
    }),
  };
}

function classifyProxyCommand(command: string): {
  stdout?: string;
  stderr?: string;
  code?: number | null;
} {
  // socat presence probe (distinct from the install attempt below)
  if (
    command.includes("command -v socat") &&
    !command.includes("apt-get") &&
    !command.includes("apk add")
  ) {
    return { stdout: "READY\n" };
  }
  // socat package install attempt
  if (
    command.includes("apt-get install -y socat") ||
    command.includes("apk add --no-cache socat")
  ) {
    return { stdout: "MISSING\n" };
  }
  // proxy start/restart: parse stable + upstream ports from the command
  if (command.includes("socat TCP-LISTEN:")) {
    const stable = command.match(/socat TCP-LISTEN:(\d+)/);
    const upstream = command.match(/TCP:127\.0\.0\.1:(\d+)/);
    mockCtl.runningStable = stable ? Number(stable[1]) : null;
    mockCtl.runningUpstream = upstream ? Number(upstream[1]) : null;
    return { stdout: "STARTED\n" };
  }
  // proxy state check: OK when the running upstream matches the expected one
  if (command.includes("grep -qF")) {
    const upstream = command.match(/TCP:127\.0\.0\.1:(\d+)/);
    const expected = upstream ? Number(upstream[1]) : null;
    return mockCtl.runningUpstream === expected
      ? { stdout: "OK\n" }
      : { stdout: "STALE\n" };
  }
  // proxy stop
  if (command.includes("echo STOPPED")) {
    mockCtl.runningStable = null;
    mockCtl.runningUpstream = null;
    return { stdout: "STOPPED\n" };
  }
  return { stdout: "" };
}

function createTunnelService(serverRepo: ReturnType<typeof makeServerRepo>) {
  const credentialRepo = {
    findOne: jest.fn(() => ({
      authType: "PASSWORD",
      encryptedPassword: "enc:secret",
      encryptionIv: "iv",
    })),
  };
  const encryptionService = {
    decrypt: (value: string) => value.replace(/^enc:/, ""),
  };
  const configService = {
    get: (key: string) => (key === "PORT" ? "3410" : undefined),
  };
  return new SshTunnelService(
    serverRepo as never,
    credentialRepo as never,
    encryptionService as never,
    configService as never,
  );
}

describe("SshTunnelService stable endpoint (self-hosted)", () => {
  beforeEach(() => {
    process.env.SELF_HOSTED = "true";
    mockCtl.forwardIn = (port) => ({ port });
    mockCtl.exec = classifyProxyCommand;
    mockCtl.runningStable = null;
    mockCtl.runningUpstream = null;
  });

  afterEach(() => {
    delete process.env.SELF_HOSTED;
  });

  describe("A. initial installation", () => {
    it("exposes stablePort to the agent and never the tunnel port", async () => {
      const serverRepo = makeServerRepo({
        id: "srv1",
        serverType: "BARE_METAL",
        metadata: { tunnelPort: 27542, stablePort: 25000 },
      });
      // proxy already running on 25000 -> upstream 27542
      mockCtl.runningStable = 25000;
      mockCtl.runningUpstream = 27542;

      const service = createTunnelService(serverRepo);

      const url = await service.getStableControlPanelUrl("srv1");

      expect(url).toBe("http://host.docker.internal:25000");
      expect(url).not.toContain("27542");
      expect(service.getTunnelPort("srv1")).toBe(27542);
      // both ports persisted separately in metadata
      expect(serverRepo.entity.metadata).toMatchObject({
        stablePort: 25000,
        tunnelPort: 27542,
      });

      await service.closeTunnel("srv1");
    });

    it("allocates and persists a stable port when none exists", async () => {
      const serverRepo = makeServerRepo({
        id: "srv1",
        serverType: "BARE_METAL",
        metadata: {},
      });

      const service = createTunnelService(serverRepo);

      const url = await service.getStableControlPanelUrl("srv1");

      expect(url).toMatch(
        new RegExp(
          `^http://host\\.docker\\.internal:(${SERVER_CONNECTIONS.TUNNEL.STABLE_PORT_MIN}|${SERVER_CONNECTIONS.TUNNEL.STABLE_PORT_MAX}|[23]\\d{4})$`,
        ),
      );
      const stablePort = Number(url?.split(":").at(-1));
      expect(stablePort).toBeGreaterThanOrEqual(
        SERVER_CONNECTIONS.TUNNEL.STABLE_PORT_MIN,
      );
      expect(stablePort).toBeLessThanOrEqual(
        SERVER_CONNECTIONS.TUNNEL.STABLE_PORT_MAX,
      );
      expect(serverRepo.entity.metadata!.stablePort).toBe(stablePort);
      // stable port and tunnel port live in disjoint ranges
      const tunnelPort = service.getTunnelPort("srv1");
      expect(tunnelPort).not.toBe(stablePort);

      await service.closeTunnel("srv1");
    });
  });

  describe("B. SSH reconnect", () => {
    it("keeps stablePort and the agent URL unchanged while the tunnel port changes", async () => {
      const serverRepo = makeServerRepo({
        id: "srv1",
        serverType: "BARE_METAL",
        metadata: { tunnelPort: 27542, stablePort: 25000 },
      });
      mockCtl.runningStable = 25000;
      mockCtl.runningUpstream = 27542;

      const service = createTunnelService(serverRepo);

      // initial establishment
      expect(await service.ensureTunnel("srv1")).toBe(27542);
      expect(await service.getStableControlPanelUrl("srv1")).toBe(
        "http://host.docker.internal:25000",
      );

      // preferred tunnel port becomes unavailable; random pick succeeds
      mockCtl.forwardIn = (port) =>
        port === 27542 ? { err: new Error("EADDRINUSE") } : { port };

      // simulate the SSH connection dropping
      const record = (
        service as unknown as {
          records: Map<string, { client: { emit: (e: string) => void } }>;
        }
      ).records.get("srv1");
      record?.client.emit("close");

      // immediate reconnect
      const newTunnelPort = await service.ensureTunnel("srv1");
      expect(newTunnelPort).not.toBe(27542);

      // proxy was re-pointed to the new tunnel port
      expect(mockCtl.runningUpstream).toBe(newTunnelPort);
      expect(serverRepo.entity.metadata!.tunnelPort).toBe(newTunnelPort);

      // agent URL is unchanged and never contains the tunnel port
      const url = await service.getStableControlPanelUrl("srv1");
      expect(url).toBe("http://host.docker.internal:25000");
      expect(url).not.toContain(String(newTunnelPort));
      expect(serverRepo.entity.metadata!.stablePort).toBe(25000);

      await service.closeTunnel("srv1");
    });
  });

  describe("C. tunnel unavailable / D. tunnel restored", () => {
    it("returns null while the tunnel cannot be established", async () => {
      const serverRepo = makeServerRepo({
        id: "srv1",
        serverType: "BARE_METAL",
        metadata: { tunnelPort: 27542, stablePort: 25000 },
      });
      mockCtl.forwardIn = () => ({ err: new Error("bind failed") });

      const service = createTunnelService(serverRepo);

      expect(await service.ensureTunnel("srv1")).toBeNull();
      expect(await service.getStableControlPanelUrl("srv1")).toBeNull();
      expect(service.getTunnelPort("srv1")).toBeNull();
    });

    it("does not tunnel for LOCAL servers", async () => {
      const serverRepo = makeServerRepo({
        id: "srv1",
        serverType: "LOCAL",
        metadata: {},
      });

      const service = createTunnelService(serverRepo);

      expect(await service.ensureTunnel("srv1")).toBeNull();
      expect(await service.getStableControlPanelUrl("srv1")).toBeNull();
    });
  });

  describe("E. Cloud mode remains unchanged", () => {
    it("returns null without touching SSH or metadata", async () => {
      delete process.env.SELF_HOSTED;
      const serverRepo = makeServerRepo({
        id: "srv1",
        serverType: "BARE_METAL",
        metadata: {},
      });

      const service = createTunnelService(serverRepo);

      expect(await service.getStableControlPanelUrl("srv1")).toBeNull();
      expect(await service.ensureStableEndpoint("srv1")).toBeNull();
      expect(serverRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe("F. proxy management lifecycle", () => {
    it("stops the remote proxy when the server is removed", async () => {
      const serverRepo = makeServerRepo({
        id: "srv1",
        serverType: "BARE_METAL",
        metadata: { tunnelPort: 27542, stablePort: 25000 },
      });
      mockCtl.runningStable = 25000;
      mockCtl.runningUpstream = 27542;

      const service = createTunnelService(serverRepo);
      await service.ensureTunnel("srv1");
      expect(mockCtl.runningUpstream).toBe(27542);

      await service.closeTunnel("srv1");

      expect(mockCtl.runningStable).toBeNull();
      expect(mockCtl.runningUpstream).toBeNull();
      expect(service.hasTunnel("srv1")).toBe(false);
    });

    it("refuses the stable URL when the remote proxy cannot start (proxy before agent startup)", async () => {
      const serverRepo = makeServerRepo({
        id: "srv1",
        serverType: "BARE_METAL",
        metadata: {},
      });
      // socat is present but every socat start attempt fails
      mockCtl.exec = (command) => {
        if (
          command.includes("command -v socat") &&
          !command.includes("apt-get") &&
          !command.includes("apk add")
        ) {
          return { stdout: "READY\n" };
        }
        if (command.includes("socat TCP-LISTEN:")) {
          return { stdout: "FAILED\n" };
        }
        if (command.includes("grep -qF")) {
          return { stdout: "MISSING\n" };
        }
        return { stdout: "" };
      };

      const service = createTunnelService(serverRepo);

      const url = await service.getStableControlPanelUrl("srv1");

      expect(url).toBeNull();
      expect(service.getTunnelPort("srv1")).toBeNull();
      expect(serverRepo.entity.metadata?.stablePort).toBeUndefined();
    });
  });
});

describe("AgentInstallService env generation", () => {
  type EnvBuildFn = (
    serverId: string,
    serverHost: string,
    agentPort: number,
    controlPanelUrl?: string,
    options?: { requireExplicitUrl?: boolean },
  ) =>
    | { ok: true; content: string; agentImage: string }
    | { ok: false; error: string };

  function buildService(config: Record<string, string>) {
    const configService = {
      get: (key: string) => config[key],
    };
    return new AgentInstallService(
      configService as never,
      {} as never,
      {} as never,
      {} as never,
    ) as unknown as { buildAgentEnvFile: EnvBuildFn };
  }

  it("writes the stable URL into CONTROL_PANEL_URL and never the tunnel port", () => {
    const service = buildService({
      CONTROL_PANEL_URL: "http://fallback:3410",
      ENCRYPTION_SECRET: "secret",
      KUBEARA_AGENT_IMAGE: "kubeara/agent:prod",
    });

    const envBuild = service.buildAgentEnvFile(
      "srv1",
      "10.0.0.5",
      3001,
      "http://host.docker.internal:25000",
      { requireExplicitUrl: true },
    );

    expect(envBuild.ok).toBe(true);
    if (!envBuild.ok) {
      return;
    }
    expect(envBuild.content).toContain(
      "CONTROL_PANEL_URL=http://host.docker.internal:25000",
    );
    expect(envBuild.content).not.toContain("27542");
    expect(envBuild.content).not.toContain("127.0.0.1");
    expect(envBuild.content).not.toContain("fallback");
  });

  it("fails self-hosted install when no stable URL was resolved (never falls back to config)", () => {
    const service = buildService({
      CONTROL_PANEL_URL: "http://127.0.0.1:3410",
      ENCRYPTION_SECRET: "secret",
      KUBEARA_AGENT_IMAGE: "kubeara/agent:prod",
    });

    const envBuild = service.buildAgentEnvFile(
      "srv1",
      "10.0.0.5",
      3001,
      undefined,
      { requireExplicitUrl: true },
    );

    expect(envBuild.ok).toBe(false);
    if (envBuild.ok) {
      return;
    }
    expect(envBuild.error).toContain("stable control panel URL");
  });

  it("refuses to write a loopback CONTROL_PANEL_URL for a self-hosted remote agent", () => {
    const service = buildService({
      CONTROL_PANEL_URL: "http://127.0.0.1:3410",
      ENCRYPTION_SECRET: "secret",
      KUBEARA_AGENT_IMAGE: "kubeara/agent:prod",
    });

    const envBuild = service.buildAgentEnvFile(
      "srv1",
      "10.0.0.5",
      3001,
      "http://127.0.0.1:3410",
      { requireExplicitUrl: true },
    );

    expect(envBuild.ok).toBe(false);
    if (envBuild.ok) {
      return;
    }
    expect(envBuild.error).toContain("127.0.0.1");
  });

  it("keeps the configured CONTROL_PANEL_URL fallback in Cloud mode", () => {
    const service = buildService({
      CONTROL_PANEL_URL: "http://panel.example.com",
      ENCRYPTION_SECRET: "secret",
      KUBEARA_AGENT_IMAGE: "kubeara/agent:prod",
    });

    const envBuild = service.buildAgentEnvFile(
      "srv1",
      "10.0.0.5",
      3001,
      undefined,
    );

    expect(envBuild.ok).toBe(true);
    if (!envBuild.ok) {
      return;
    }
    expect(envBuild.content).toContain(
      "CONTROL_PANEL_URL=http://panel.example.com",
    );
  });
});
