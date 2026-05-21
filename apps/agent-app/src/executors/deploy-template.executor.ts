import { Injectable, Logger } from "@nestjs/common";
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as net from "net";
import * as path from "path";
import { FilesystemService } from "../filesystem/filesystem.service";
import {
  DeploymentStatusPayload,
  DeploymentLogPayload,
  TemplateSchema,
} from "@shared/socket-events";
import {
  ComposeParserService,
  TemplateConfigService,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  APP_CONFIG,
  maskEnvMap,
  maskEnvContents,
  formatPortMappings,
  discoverTraefikRoutes,
  applyTraefikRoutingToCompose,
} from "@shared/common";
import {
  EnvFileInput,
  generateEnvFileDetails,
  PortFileInput,
} from "./env-file.util";
import { TraefikProxyService } from "../proxy/traefik-proxy.service";
import * as yaml from "js-yaml";

export interface ExecutionNotifier {
  sendStatus(payload: DeploymentStatusPayload): void;
  sendLog(payload: DeploymentLogPayload): void;
}

interface ComposePortObject {
  published?: number | string;
}

interface ComposeService {
  ports?: Array<string | ComposePortObject>;
  container_name?: string;
}

interface ComposeFile {
  version?: string;
  services?: Record<string, ComposeService>;
}

@Injectable()
export class DeployTemplateExecutor {
  private readonly logger = new Logger(DeployTemplateExecutor.name);

  constructor(
    private readonly fsService: FilesystemService,
    private readonly templateConfigService: TemplateConfigService,
    private readonly composeParserService: ComposeParserService,
    private readonly traefikProxy: TraefikProxyService,
  ) {}

  async execute(opts: {
    name: string;
    compose: string;
    env?:
      | {
          env?: EnvFileInput;
          ports?: PortFileInput;
        }
      | EnvFileInput;
    deploymentId: string;
    schema?: TemplateSchema;
    composeOnly?: boolean;
    useTraefik?: boolean;
    notifier: ExecutionNotifier;
  }): Promise<void> {
    const {
      name,
      compose,
      env,
      deploymentId,
      schema,
      composeOnly,
      useTraefik: useTraefikPayload,
      notifier,
    } = opts;
    const useTraefik = Boolean(
      useTraefikPayload ?? this.traefikProxy.isEnabled(),
    );

    const startedAt = new Date().toISOString();
    let dir = "";
    const projectName = this.fsService.sanitizeName(deploymentId);

    notifier.sendStatus({
      deploymentId,
      templateSlug: name,
      status: "pending",
      startedAt,
      message: SUCCESS_MESSAGES.PREPARING,
    });

    try {
      dir = await this.fsService.ensureDeploymentDir(deploymentId);
      if (!projectName) {
        throw new Error(ERROR_MESSAGES.INVALID_COMPOSE_NAME);
      }

      const envPath = path.join(dir, ".env");
      const { envValues: rawEnv, portValues: rawPorts } =
        this.normalizeEnvPayload(env);

      const resolved = this.resolveEnv(
        compose,
        schema,
        { envValues: rawEnv, portValues: rawPorts },
        notifier,
        name,
        composeOnly,
      );

      if (useTraefik && this.traefikProxy.isHttpsEnabled()) {
        resolved.envValues.N8N_PROTOCOL = "https";
        resolved.envValues.N8N_SECURE_COOKIE = "true";
      }

      let composeYaml = this.normalizeComposeForDeployment(compose);

      if (useTraefik) {
        await this.traefikProxy.ensureRunning();
        const routes = discoverTraefikRoutes(
          compose,
          this.stringifyEnvValues(resolved.envValues),
          deploymentId,
        );
        const parsedCompose = yaml.load(composeYaml) as Record<string, unknown>;
        applyTraefikRoutingToCompose(parsedCompose, routes, {
          enableHttps: this.traefikProxy.isHttpsEnabled(),
          forceHttps: this.traefikProxy.isForceHttps(),
        });
        composeYaml = yaml.dump(parsedCompose, { lineWidth: -1, noRefs: true });
        notifier.sendLog({
          deployment: name,
          type: "stdout",
          message: `Traefik routing enabled (${routes.length} route(s)) — access via http://<fqdn> on port 80`,
          timestamp: new Date().toISOString(),
        });
      }

      await this.fsService.writeFile(dir, "docker-compose.yml", composeYaml);

      const generatedEnv = generateEnvFileDetails(
        resolved.envValues,
        resolved.portValues,
      );

      const envFileContent = `${generatedEnv.content || ""}\n`;
      await this.fsService.writeFile(dir, ".env", envFileContent);

      const envFileExistsAfterWrite = await this.exists(envPath);
      if (!envFileExistsAfterWrite) {
        throw new Error(ERROR_MESSAGES.ENV_GENERATION_FAILED);
      }

      notifier.sendLog({
        deployment: name,
        type: "stdout",
        message: [
          `Deployment directory: ${dir}`,
          `Docker compose project: ${projectName}`,
          `Docker network: ${projectName}_default`,
          `Sanitized env keys: ${generatedEnv.keys.length ? generatedEnv.keys.join(", ") : "none"}`,
          `Resolved port mappings: ${formatPortMappings(generatedEnv.ports)}`,
        ].join("\n"),
        timestamp: new Date().toISOString(),
      });

      if (!useTraefik && Object.keys(generatedEnv.ports).length > 0) {
        await this.assertPortsAvailable(generatedEnv.ports);
      }

      const maskedEnv = maskEnvContents(envFileContent);
      notifier.sendLog({
        deployment: name,
        type: "stdout",
        message: `.env contents:\n${maskedEnv}`,
        timestamp: new Date().toISOString(),
      });

      notifier.sendStatus({
        deploymentId,
        templateSlug: name,
        status: "deploying",
        message: SUCCESS_MESSAGES.VALIDATING,
      });

      const validationArgs = [
        "compose",
        "--env-file",
        ".env",
        "-f",
        "docker-compose.yml",
        "-p",
        projectName,
        "config",
      ];
      const validation = await this.execCapture("docker", validationArgs, dir);

      if (validation.exitCode !== 0) {
        const errorText =
          validation.stderr ||
          validation.stdout ||
          `Exit code ${validation.exitCode}`;
        await this.handleDeploymentFailure(
          deploymentId,
          name,
          ERROR_MESSAGES.COMPOSE_VALIDATION_FAILED,
          errorText,
          projectName,
          dir,
          notifier,
        );
        return;
      }

      if (!useTraefik) {
        this.validateResolvedConfig(validation.stdout, generatedEnv.ports);
      }

      notifier.sendStatus({
        deploymentId,
        templateSlug: name,
        status: "deploying",
        message: SUCCESS_MESSAGES.DEPLOYING,
      });

      const upArgs = [
        "compose",
        "--env-file",
        ".env",
        "-f",
        "docker-compose.yml",
        "-p",
        projectName,
        "up",
        "-d",
      ];
      const upResult = await this.execCapture("docker", upArgs, dir);

      if (upResult.exitCode !== 0) {
        const dockerErr =
          upResult.stderr ||
          upResult.stdout ||
          `Exit code ${upResult.exitCode}`;
        await this.handleDeploymentFailure(
          deploymentId,
          name,
          ERROR_MESSAGES.DEPLOYMENT_FAILED,
          dockerErr,
          projectName,
          dir,
          notifier,
        );
        return;
      }

      notifier.sendStatus({
        deploymentId,
        templateSlug: name,
        status: "running",
        message: SUCCESS_MESSAGES.RUNNING,
      });

      try {
        await this.streamLogs(
          dir,
          projectName,
          name,
          notifier,
          APP_CONFIG.DEFAULT_LOG_STREAM_DURATION,
        );
      } catch (err) {
        this.logger.warn(
          `Log streaming ended with: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }

      notifier.sendStatus({
        deploymentId,
        templateSlug: name,
        status: "success",
        message: SUCCESS_MESSAGES.COMPLETED,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.handleDeploymentFailure(
        deploymentId,
        name,
        ERROR_MESSAGES.DEPLOYMENT_FAILED,
        msg,
        projectName,
        dir,
        notifier,
      );
    }
  }

  /**
   * Tears down a deployment: stops containers, removes volumes, and deletes agent files.
   */
  async removeDeployment(opts: {
    deploymentId: string;
    templateSlug: string;
    notifier: ExecutionNotifier;
  }): Promise<void> {
    const { deploymentId, templateSlug, notifier } = opts;
    const projectName = this.fsService.sanitizeName(deploymentId);
    const dir = this.fsService.getDeploymentDir(deploymentId);
    const startedAt = new Date().toISOString();

    if (!projectName) {
      notifier.sendStatus({
        deploymentId,
        templateSlug,
        status: "failed",
        message: ERROR_MESSAGES.INVALID_COMPOSE_NAME,
        error: ERROR_MESSAGES.INVALID_COMPOSE_NAME,
        startedAt,
        completedAt: new Date().toISOString(),
      });
      return;
    }

    notifier.sendStatus({
      deploymentId,
      templateSlug,
      status: "removing",
      message: SUCCESS_MESSAGES.REMOVING,
      startedAt,
    });

    try {
      const dirExists = await this.exists(dir);
      const composePath = path.join(dir, "docker-compose.yml");
      const composeExists = dirExists && (await this.exists(composePath));

      if (composeExists) {
        await this.teardownComposeProject(
          projectName,
          dir,
          templateSlug,
          notifier,
        );
      } else {
        await this.forceRemoveComposeProject(
          projectName,
          templateSlug,
          notifier,
        );
      }

      if (dirExists) {
        await this.fsService.removeDeploymentDir(deploymentId);
      }

      notifier.sendLog({
        deployment: templateSlug,
        type: "stdout",
        message: `Removed deployment directory for ${projectName}`,
        timestamp: new Date().toISOString(),
      });

      notifier.sendStatus({
        deploymentId,
        templateSlug,
        status: "removed",
        message: SUCCESS_MESSAGES.REMOVAL_COMPLETED,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`${ERROR_MESSAGES.REMOVAL_FAILED}: ${msg}`);

      notifier.sendStatus({
        deploymentId,
        templateSlug,
        status: "failed",
        message: ERROR_MESSAGES.REMOVAL_FAILED,
        error: msg,
        completedAt: new Date().toISOString(),
      });
    }
  }

  private async handleDeploymentFailure(
    deploymentId: string,
    name: string,
    message: string,
    error: string,
    projectName: string,
    dir: string,
    notifier: ExecutionNotifier,
  ): Promise<void> {
    this.logger.error(`${message}: ${error}`);
    if (dir && projectName) {
      await this.cleanupDeployment(projectName, dir, name, notifier);
    }

    notifier.sendStatus({
      deploymentId,
      templateSlug: name,
      status: "failed",
      message,
      error,
      completedAt: new Date().toISOString(),
    });
  }

  private validateResolvedConfig(
    resolvedConfig: string,
    expectedPorts: Record<string, number>,
  ): void {
    try {
      const parsed = yaml.load(resolvedConfig) as ComposeFile | undefined;

      const hostPortsFound = new Set<number>();

      if (parsed?.services) {
        for (const service of Object.values(parsed.services)) {
          const ports = service.ports;

          if (!Array.isArray(ports)) {
            continue;
          }

          for (const entry of ports) {
            if (typeof entry === "string") {
              const parts = entry.split(":");

              if (parts.length >= 2) {
                const hostPort = Number(parts[parts.length - 2]);

                if (Number.isFinite(hostPort)) {
                  hostPortsFound.add(hostPort);
                }
              }

              continue;
            }

            if (
              entry &&
              typeof entry === "object" &&
              entry.published !== undefined
            ) {
              const hostPort = Number(entry.published);

              if (Number.isFinite(hostPort)) {
                hostPortsFound.add(hostPort);
              }
            }
          }
        }
      }

      for (const expectedPort of Object.values(expectedPorts)) {
        if (!hostPortsFound.has(expectedPort)) {
          throw new Error(
            `Resolved compose config does not expose expected host port ${expectedPort}`,
          );
        }
      }
    } catch (err) {
      throw new Error(
        `Config validation failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async exists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  private normalizeComposeForDeployment(compose: string): string {
    const parsed = yaml.load(compose) as ComposeFile | undefined;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return compose;
    }

    delete parsed.version;

    if (parsed.services) {
      for (const service of Object.values(parsed.services)) {
        delete service.container_name;
      }
    }

    return yaml.dump(parsed, {
      lineWidth: -1,
      noRefs: true,
    });
  }

  private normalizeEnvPayload(
    payload:
      | {
          env?: EnvFileInput;
          ports?: PortFileInput;
        }
      | EnvFileInput
      | undefined,
  ): {
    envValues: EnvFileInput;
    portValues: PortFileInput;
  } {
    if (!payload || typeof payload !== "object") {
      return { envValues: {}, portValues: {} };
    }

    const payloadWithConfig = payload as {
      env?: EnvFileInput;
      ports?: PortFileInput;
    };

    if ("env" in payloadWithConfig || "ports" in payloadWithConfig) {
      return {
        envValues: payloadWithConfig.env ?? {},
        portValues: payloadWithConfig.ports ?? {},
      };
    }

    return {
      envValues: payload as EnvFileInput,
      portValues: {},
    };
  }

  private resolveEnv(
    compose: string,
    schema: TemplateSchema | undefined,
    userInput: { envValues: EnvFileInput; portValues: PortFileInput },
    notifier: ExecutionNotifier,
    templateName: string,
    composeOnly = false,
  ): { envValues: EnvFileInput; portValues: PortFileInput } {
    const portSchemaKeys = Object.keys(schema?.port_schema ?? {});
    const parsedFromCompose = this.composeParserService.resolveFromCompose({
      compose,
      userEnv: userInput.envValues,
      userPorts: userInput.portValues,
      portSchemaKeys: composeOnly ? [] : portSchemaKeys,
    });

    if (parsedFromCompose.generatedKeys.length > 0) {
      notifier.sendLog({
        deployment: templateName,
        type: "stdout",
        message: `Auto-generated variables: ${parsedFromCompose.generatedKeys.join(", ")}`,
        timestamp: new Date().toISOString(),
      });
    }

    let mergedEnv: Record<string, string>;
    let mergedPorts: Record<string, number>;

    if (composeOnly) {
      const missing = this.composeParserService.findMissingVariables(
        compose,
        parsedFromCompose,
      );
      if (missing.length > 0) {
        const errorMsg = ERROR_MESSAGES.MISSING_COMPOSE_VARS(
          missing.join(", "),
        );
        notifier.sendLog({
          deployment: templateName,
          type: "stderr",
          message: errorMsg,
          timestamp: new Date().toISOString(),
        });
        throw new Error(errorMsg);
      }

      mergedEnv = parsedFromCompose.env;
      mergedPorts = parsedFromCompose.ports;
    } else {
      const validated = this.templateConfigService.mergeAndValidate(schema, {
        env: parsedFromCompose.env,
        ports: parsedFromCompose.ports,
      });
      mergedEnv = validated.env;
      mergedPorts = validated.ports;
    }

    const composeVars = new Set<string>();
    for (const match of compose.matchAll(
      APP_CONFIG.REGEX.COMPOSE_PLACEHOLDER,
    )) {
      composeVars.add(match[1] || match[2]);
    }

    const mergedResults = { ...mergedEnv, ...mergedPorts };
    const unresolvedComposeVars = Array.from(composeVars).filter(
      (v) => mergedResults[v] === undefined && process.env[v] === undefined,
    );

    if (unresolvedComposeVars.length > 0) {
      const errorMsg = ERROR_MESSAGES.MISSING_COMPOSE_VARS(
        unresolvedComposeVars.join(", "),
      );
      notifier.sendLog({
        deployment: templateName,
        type: "stderr",
        message: errorMsg,
        timestamp: new Date().toISOString(),
      });
      throw new Error(errorMsg);
    }

    notifier.sendLog({
      deployment: templateName,
      type: "stdout",
      message: `Resolved environment map (masked):\n${JSON.stringify(maskEnvMap({ ...mergedEnv, ...mergedPorts }), null, 2)}`,
      timestamp: new Date().toISOString(),
    });

    return { envValues: mergedEnv, portValues: mergedPorts };
  }

  private async assertPortsAvailable(
    ports: Record<string, number>,
  ): Promise<void> {
    for (const port of Object.values(ports)) {
      const available = await this.isPortAvailable(port);
      if (!available) {
        throw new Error(ERROR_MESSAGES.PORT_OCCUPIED(port));
      }
    }
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => server.close(() => resolve(true)));
      server.listen(port, "0.0.0.0");
    });
  }

  private async cleanupDeployment(
    projectName: string,
    cwd: string,
    name: string,
    notifier: ExecutionNotifier,
  ): Promise<void> {
    notifier.sendLog({
      deployment: name,
      type: "stdout",
      message: `Cleaning up deployment for ${projectName}`,
      timestamp: new Date().toISOString(),
    });

    const cleanup = await this.execCapture(
      "docker",
      [
        "compose",
        "-f",
        "docker-compose.yml",
        "-p",
        projectName,
        "down",
        "--volumes",
        "--remove-orphans",
      ],
      cwd,
    );

    if (cleanup.exitCode !== 0) {
      notifier.sendLog({
        deployment: name,
        type: "stderr",
        message: `${ERROR_MESSAGES.CLEANUP_FAILED}:\n${cleanup.stderr || cleanup.stdout}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    notifier.sendLog({
      deployment: name,
      type: "stdout",
      message: SUCCESS_MESSAGES.CLEANUP_COMPLETED,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Runs docker compose down for a deployment project when compose files are present.
   */
  private async teardownComposeProject(
    projectName: string,
    cwd: string,
    name: string,
    notifier: ExecutionNotifier,
  ): Promise<void> {
    notifier.sendLog({
      deployment: name,
      type: "stdout",
      message: `Cleaning up deployment for ${projectName}`,
      timestamp: new Date().toISOString(),
    });

    const envPath = path.join(cwd, ".env");
    const hasEnv = await this.exists(envPath);
    const downArgs = hasEnv
      ? [
          "compose",
          "--env-file",
          ".env",
          "-f",
          "docker-compose.yml",
          "-p",
          projectName,
          "down",
          "--volumes",
          "--remove-orphans",
        ]
      : [
          "compose",
          "-f",
          "docker-compose.yml",
          "-p",
          projectName,
          "down",
          "--volumes",
          "--remove-orphans",
        ];

    const cleanup = await this.execCapture("docker", downArgs, cwd);

    if (cleanup.exitCode !== 0) {
      notifier.sendLog({
        deployment: name,
        type: "stderr",
        message: `${ERROR_MESSAGES.CLEANUP_FAILED}:\n${cleanup.stderr || cleanup.stdout}`,
        timestamp: new Date().toISOString(),
      });

      await this.forceRemoveComposeProject(projectName, name, notifier);
      return;
    }

    notifier.sendLog({
      deployment: name,
      type: "stdout",
      message: SUCCESS_MESSAGES.CLEANUP_COMPLETED,
      timestamp: new Date().toISOString(),
    });
  }
  /**
   * Removes compose-managed containers, volumes, and networks by project label
   * when compose files are unavailable.
   */
  private async forceRemoveComposeProject(
    projectName: string,
    name: string,
    notifier: ExecutionNotifier,
  ): Promise<void> {
    notifier.sendLog({
      deployment: name,
      type: "stdout",
      message: `Force-removing Docker resources for project ${projectName}`,
      timestamp: new Date().toISOString(),
    });

    const containerIds = await this.execCapture(
      "docker",
      [
        "ps",
        "-aq",
        "--filter",
        `label=com.docker.compose.project=${projectName}`,
      ],
      process.cwd(),
    );

    const ids = containerIds.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (ids.length > 0) {
      const removeContainers = await this.execCapture(
        "docker",
        ["rm", "-f", ...ids],
        process.cwd(),
      );
      if (removeContainers.exitCode !== 0) {
        throw new Error(
          removeContainers.stderr ||
            removeContainers.stdout ||
            "Failed to remove containers",
        );
      }
    }

    const volumeIds = await this.execCapture(
      "docker",
      [
        "volume",
        "ls",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${projectName}`,
      ],
      process.cwd(),
    );

    const volumes = volumeIds.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (volumes.length > 0) {
      const removeVolumes = await this.execCapture(
        "docker",
        ["volume", "rm", "-f", ...volumes],
        process.cwd(),
      );
      if (removeVolumes.exitCode !== 0) {
        this.logger.warn(
          `Volume removal for ${projectName} reported: ${removeVolumes.stderr || removeVolumes.stdout}`,
        );
      }
    }

    const networkIds = await this.execCapture(
      "docker",
      [
        "network",
        "ls",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${projectName}`,
      ],
      process.cwd(),
    );

    const networks = networkIds.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const networkId of networks) {
      const removeNetwork = await this.execCapture(
        "docker",
        ["network", "rm", networkId],
        process.cwd(),
      );
      if (removeNetwork.exitCode !== 0) {
        this.logger.warn(
          `Network removal for ${projectName} reported: ${removeNetwork.stderr || removeNetwork.stdout}`,
        );
      }
    }
  }

  private stringifyEnvValues(env: EnvFileInput): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined && value !== null && value !== "") {
        result[key] = String(value);
      }
    }

    return result;
  }

  private execCapture(
    cmd: string,
    args: string[],
    cwd: string,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args.filter(Boolean), { cwd });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => (stdout += String(chunk)));
      child.stderr.on("data", (chunk) => (stderr += String(chunk)));
      child.on(
        "error",
        (err) => (stderr += `Failed to start process: ${err.message}`),
      );
      child.on("close", (code) =>
        resolve({ exitCode: code ?? 1, stdout, stderr }),
      );
    });
  }

  private streamLogs(
    cwd: string,
    projectName: string,
    name: string,
    notifier: ExecutionNotifier,
    maxDurationMs: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const child = spawn(
        "docker",
        [
          "compose",
          "-f",
          "docker-compose.yml",
          "-p",
          projectName,
          "logs",
          "-f",
          "--no-color",
        ],
        { cwd },
      );
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch (err) {
          this.logger.debug(
            `Failed to kill log stream: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
        resolve();
      }, maxDurationMs);

      child.stdout.on("data", (chunk) => {
        notifier.sendLog({
          deployment: name,
          type: "stdout",
          message: String(chunk),
          timestamp: new Date().toISOString(),
        });
      });
      child.stderr.on("data", (chunk) => {
        notifier.sendLog({
          deployment: name,
          type: "stderr",
          message: String(chunk),
          timestamp: new Date().toISOString(),
        });
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve();
      });
      child.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}
