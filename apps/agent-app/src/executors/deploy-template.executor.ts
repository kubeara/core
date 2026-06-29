import { Injectable, Logger } from "@nestjs/common";
import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "node:crypto";
import * as fs from "fs/promises";
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
  discoverTraefikRoutes,
  applyTraefikRoutingToCompose,
  extractOccupiedPortFromError,
  formatDeploymentPortInUseMessage,
  maskEnvContents,
  sumComposeResourceLimitsFromYaml,
} from "@shared/common";
import {
  EnvFileInput,
  generateEnvFileDetails,
  PortFileInput,
} from "./env-file.util";
import { TraefikProxyService } from "../proxy/traefik-proxy.service";
import {
  InsufficientCpuError,
  InsufficientRamError,
  PortUnavailableError,
  ResourceAvailabilityService,
} from "../resource-availability/resource-availability.service";
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
  private readonly containerLogSessions = new Map<
    string,
    { abort: AbortController; children: ChildProcess[] }
  >();
  private readonly activeDeployments = new Set<string>();
  private readonly streamLineBuffers = new Map<string, string>();

  constructor(
    private readonly fsService: FilesystemService,
    private readonly templateConfigService: TemplateConfigService,
    private readonly composeParserService: ComposeParserService,
    private readonly traefikProxy: TraefikProxyService,
    private readonly resourceAvailabilityService: ResourceAvailabilityService,
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
    skipResourceValidation?: boolean;
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
      skipResourceValidation,
      notifier,
    } = opts;
    const useTraefik = Boolean(
      useTraefikPayload ?? this.traefikProxy.isEnabled(),
    );

    if (this.activeDeployments.has(deploymentId)) {
      this.logger.warn(
        `Deployment ${deploymentId} is already running; ignoring duplicate execute`,
      );
      notifier.sendLog({
        deployment: name,
        deploymentId,
        type: "stderr",
        message: `Deployment ${deploymentId} is already running on this agent; skipping duplicate execute.`,
        timestamp: new Date().toISOString(),
        source: "deployment",
      });
      return;
    }

    this.activeDeployments.add(deploymentId);

    const startedAt = new Date().toISOString();
    const projectName = this.fsService.sanitizeName(deploymentId);

    this.logger.log(
      `[DEPLOY_TRACE] executor.execute deploymentId=${deploymentId} project=${projectName}`,
    );

    try {
      await this.runDeployment(deploymentId, {
        name,
        compose,
        env,
        schema,
        composeOnly,
        useTraefik,
        skipResourceValidation,
        notifier,
        startedAt,
        projectName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Unexpected deployment error deploymentId=${deploymentId}: ${msg}`,
      );
      notifier.sendStatus({
        deploymentId,
        templateSlug: name,
        status: "failed",
        message: ERROR_MESSAGES.DEPLOYMENT_FAILED,
        error: msg,
        completedAt: new Date().toISOString(),
      });
    } finally {
      this.activeDeployments.delete(deploymentId);
      this.clearDeploymentStreamLineBuffers(deploymentId);
    }
  }

  /**
   * Validates RAM, ports, and CPU using the same resolution path as deployment,
   * without starting containers.
   */
  async validateBeforeDeploy(opts: {
    name: string;
    compose: string;
    env?:
      | {
          env?: EnvFileInput;
          ports?: PortFileInput;
        }
      | EnvFileInput;
    schema?: TemplateSchema;
    composeOnly?: boolean;
    useTraefik?: boolean;
  }): Promise<void> {
    const deploymentId = `validate-${randomUUID()}`;
    const projectName = this.fsService.sanitizeName(deploymentId);
    const noopNotifier: ExecutionNotifier = {
      sendStatus: () => undefined,
      sendLog: () => undefined,
    };
    const useTraefik = Boolean(
      opts.useTraefik ?? this.traefikProxy.isEnabled(),
    );

    try {
      const dir = await this.fsService.ensureDeploymentDir(deploymentId);
      const { envValues: rawEnv, portValues: rawPorts } =
        this.normalizeEnvPayload(opts.env);

      const resolved = this.resolveEnv(
        opts.compose,
        opts.schema,
        { envValues: rawEnv, portValues: rawPorts },
        noopNotifier,
        opts.name,
        deploymentId,
        opts.composeOnly,
      );

      if (useTraefik && this.traefikProxy.isHttpsEnabled()) {
        resolved.envValues.N8N_PROTOCOL = "https";
        resolved.envValues.N8N_SECURE_COOKIE = "true";
      }

      const composeYaml = this.normalizeComposeForDeployment(opts.compose);

      const traefikRoutes = useTraefik
        ? discoverTraefikRoutes(
            opts.compose,
            this.stringifyEnvValues(resolved.envValues),
            deploymentId,
          )
        : [];
      const applyTraefikRouting = useTraefik && traefikRoutes.length > 0;

      await this.fsService.writeFile(dir, "docker-compose.yml", composeYaml);

      const generatedEnv = generateEnvFileDetails(
        resolved.envValues,
        resolved.portValues,
      );
      await this.fsService.writeFile(
        dir,
        ".env",
        `${generatedEnv.content || ""}\n`,
      );

      const validation = await this.execCapture(
        "docker",
        [
          "compose",
          "--env-file",
          ".env",
          "-f",
          "docker-compose.yml",
          "-p",
          projectName,
          "config",
        ],
        dir,
      );

      if (validation.exitCode !== 0) {
        const errorText =
          validation.stderr ||
          validation.stdout ||
          `Exit code ${validation.exitCode}`;
        throw new Error(errorText);
      }

      await this.validateResolvedComposeBeforeDeploy({
        resolvedConfig: validation.stdout,
        applyTraefikRouting,
        portValues: resolved.portValues,
      });
    } finally {
      await this.fsService.removeDeploymentDir(deploymentId).catch((error) => {
        this.logger.warn(
          `Failed to remove temporary validation directory for ${deploymentId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }
  }

  private async runDeployment(
    deploymentId: string,
    opts: {
      name: string;
      compose: string;
      env?:
        | {
            env?: EnvFileInput;
            ports?: PortFileInput;
          }
        | EnvFileInput;
      schema?: TemplateSchema;
      composeOnly?: boolean;
      useTraefik: boolean;
      skipResourceValidation?: boolean;
      notifier: ExecutionNotifier;
      startedAt: string;
      projectName: string;
    },
  ): Promise<void> {
    const {
      name,
      compose,
      env,
      schema,
      composeOnly,
      useTraefik,
      skipResourceValidation,
      notifier,
      startedAt,
      projectName,
    } = opts;
    let dir = "";

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
        deploymentId,
        composeOnly,
      );

      if (useTraefik && this.traefikProxy.isHttpsEnabled()) {
        resolved.envValues.N8N_PROTOCOL = "https";
        resolved.envValues.N8N_SECURE_COOKIE = "true";
      }

      let composeYaml = this.normalizeComposeForDeployment(compose);

      const traefikRoutes = useTraefik
        ? discoverTraefikRoutes(
            compose,
            this.stringifyEnvValues(resolved.envValues),
            deploymentId,
          )
        : [];
      const applyTraefikRouting = useTraefik && traefikRoutes.length > 0;

      if (useTraefik && !applyTraefikRouting) {
        notifier.sendLog({
          deployment: name,
          deploymentId,
          type: "stdout",
          message:
            "Traefik is enabled but this template has no SERVICE_URL_* routes — using direct host ports.",
          timestamp: new Date().toISOString(),
          source: "deployment",
        });
      }

      if (applyTraefikRouting) {
        await this.traefikProxy.ensureRunning();
        const parsedCompose = yaml.load(composeYaml) as Record<string, unknown>;
        applyTraefikRoutingToCompose(parsedCompose, traefikRoutes, {
          enableHttps: this.traefikProxy.isHttpsEnabled(),
          forceHttps: this.traefikProxy.isForceHttps(),
        });
        composeYaml = yaml.dump(parsedCompose, { lineWidth: -1, noRefs: true });
        notifier.sendLog({
          deployment: name,
          deploymentId,
          type: "stdout",
          message: `Traefik routing enabled (${traefikRoutes.length} route(s)) — access via http://<fqdn> on port 80`,
          timestamp: new Date().toISOString(),
          source: "deployment",
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
        deploymentId,
        type: "stdout",
        message: [
          `Deployment directory: ${dir}`,
          `Docker compose project: ${projectName}`,
          `Docker network: ${projectName}_default`,
        ].join("\n"),
        timestamp: new Date().toISOString(),
        source: "deployment",
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

      // Validate RAM, ports, and CPU before starting containers.
      try {
        await this.validateResolvedComposeBeforeDeploy({
          resolvedConfig: validation.stdout,
          applyTraefikRouting,
          portValues: resolved.portValues,
          expectedPorts: generatedEnv.ports,
          skipResourceChecks: skipResourceValidation,
        });
      } catch (err) {
        if (err instanceof PortUnavailableError) {
          this.handlePortUnavailableFailure(deploymentId, name, notifier, err);
          return;
        }
        if (
          err instanceof InsufficientRamError ||
          err instanceof InsufficientCpuError
        ) {
          this.handleResourceUnavailableFailure(
            deploymentId,
            name,
            notifier,
            err,
          );
          return;
        }
        throw err;
      }

      notifier.sendStatus({
        deploymentId,
        templateSlug: name,
        status: "deploying",
        message: SUCCESS_MESSAGES.DEPLOYING,
      });

      try {
        this.logger.log(
          `[DEPLOY_TRACE] compose execution starting deploymentId=${deploymentId} cwd=${dir}`,
        );
        await this.executeComposeWithLiveLogs(
          dir,
          projectName,
          name,
          deploymentId,
          notifier,
        );
        this.logger.log(
          `[DEPLOY_TRACE] compose execution finished deploymentId=${deploymentId}`,
        );
      } catch (err) {
        const dockerErr = err instanceof Error ? err.message : String(err);
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
        status: "success",
        message: SUCCESS_MESSAGES.COMPLETED,
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      if (err instanceof PortUnavailableError) {
        this.handlePortUnavailableFailure(deploymentId, name, notifier, err);
        return;
      }

      if (
        err instanceof InsufficientRamError ||
        err instanceof InsufficientCpuError
      ) {
        this.handleResourceUnavailableFailure(
          deploymentId,
          name,
          notifier,
          err,
        );
        return;
      }

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

    this.stopContainerLogStreaming(deploymentId);

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
        source: "deployment",
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

  /**
   * Handles a port unavailable failure.
   */
  private handlePortUnavailableFailure(
    deploymentId: string,
    name: string,
    notifier: ExecutionNotifier,
    err: PortUnavailableError,
  ): void {
    const message = err.message;
    this.logger.error(message);
    notifier.sendLog({
      deployment: name,
      deploymentId,
      type: "stderr",
      message,
      timestamp: new Date().toISOString(),
      source: "deployment",
    });
    notifier.sendStatus({
      deploymentId,
      templateSlug: name,
      status: "failed",
      message,
      error: message,
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * Validates the resolved compose before deploying.
   */
  private async validateResolvedComposeBeforeDeploy(opts: {
    resolvedConfig: string;
    applyTraefikRouting: boolean;
    portValues: PortFileInput;
    expectedPorts?: Record<string, number>;
    skipResourceChecks?: boolean;
  }): Promise<void> {
    try {
      if (!opts.applyTraefikRouting) {
        if (Object.keys(opts.portValues).length > 0) {
          await this.resourceAvailabilityService.assertPortsAvailable(
            opts.portValues,
          );
        }

        const hostPorts = this.extractHostPortsFromComposeConfig(
          opts.resolvedConfig,
        );
        if (hostPorts.length > 0) {
          await this.resourceAvailabilityService.assertHostPortsAvailable(
            hostPorts,
          );
        }

        if (opts.expectedPorts) {
          this.validateResolvedConfig(opts.resolvedConfig, opts.expectedPorts);
        }
      } else {
        this.logger.log(
          "Port availability check skipped: Traefik routing enabled",
        );
      }

      if (!opts.skipResourceChecks) {
        const requirements = sumComposeResourceLimitsFromYaml(
          opts.resolvedConfig,
        );

        await this.resourceAvailabilityService.assertRamAvailable(
          requirements.memoryBytes,
        );

        await this.resourceAvailabilityService.assertCpuAvailable(
          requirements.cpuCores,
        );
      } else {
        this.logger.warn(
          "RAM and CPU availability checks skipped: user confirmed resource override",
        );
      }
    } catch (error) {
      this.logger.error(
        `Validation before deploy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Handles a RAM or CPU resource unavailable failure.
   */
  private handleResourceUnavailableFailure(
    deploymentId: string,
    name: string,
    notifier: ExecutionNotifier,
    err: InsufficientRamError | InsufficientCpuError,
  ): void {
    const message = err.message;
    this.logger.error(message);
    notifier.sendLog({
      deployment: name,
      deploymentId,
      type: "stderr",
      message,
      timestamp: new Date().toISOString(),
      source: "deployment",
    });
    notifier.sendStatus({
      deploymentId,
      templateSlug: name,
      status: "failed",
      message,
      error: message,
      completedAt: new Date().toISOString(),
    });
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
    this.stopContainerLogStreaming(deploymentId);
    const resolved = this.resolvePortConflictFailure(message, error);
    this.logger.error(
      `${resolved.message}: ${this.sanitizeDockerOutput(resolved.error)}`,
    );
    if (dir && projectName) {
      try {
        await this.cleanupDeployment(projectName, dir, name, notifier);
      } catch (cleanupErr) {
        this.logger.warn(
          `Cleanup after failure failed deploymentId=${deploymentId}: ${
            cleanupErr instanceof Error
              ? cleanupErr.message
              : String(cleanupErr)
          }`,
        );
      }
    }

    notifier.sendStatus({
      deploymentId,
      templateSlug: name,
      status: "failed",
      message: resolved.message,
      error: resolved.error,
      completedAt: new Date().toISOString(),
    });
  }

  /**
   * Resolves a port conflict failure by extracting the occupied port and formatting the message.
   */
  private resolvePortConflictFailure(
    message: string,
    error: string,
  ): { message: string; error: string } {
    if (!this.isPortAllocationError(`${message}\n${error}`)) {
      return { message, error };
    }

    const port = extractOccupiedPortFromError(`${message}\n${error}`);
    const portMessage = formatDeploymentPortInUseMessage(port);
    return { message: portMessage, error: portMessage };
  }

  private isPortAllocationError(text: string): boolean {
    const normalized = text.toLowerCase();

    return (
      normalized.includes("port is already allocated") ||
      normalized.includes("port is already in use") ||
      normalized.includes("already running on this port") ||
      normalized.includes("address already in use") ||
      (normalized.includes("bind for") && normalized.includes("failed"))
    );
  }

  private extractHostPortsFromComposeConfig(resolvedConfig: string): number[] {
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

      return [...hostPortsFound];
    } catch {
      return [];
    }
  }

  /**
   * Validates a resolved config by checking if the expected ports are exposed.
   */
  private validateResolvedConfig(
    resolvedConfig: string,
    expectedPorts: Record<string, number>,
  ): void {
    try {
      const hostPortsFound = new Set(
        this.extractHostPortsFromComposeConfig(resolvedConfig),
      );

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
    deploymentId: string,
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
        deploymentId,
        type: "stdout",
        message: `Auto-generated variables: ${parsedFromCompose.generatedKeys.join(", ")}`,
        timestamp: new Date().toISOString(),
        source: "deployment",
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
          deploymentId,
          type: "stderr",
          message: errorMsg,
          timestamp: new Date().toISOString(),
          source: "deployment",
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
        deploymentId,
        type: "stderr",
        message: errorMsg,
        timestamp: new Date().toISOString(),
        source: "deployment",
      });
      throw new Error(errorMsg);
    }

    return { envValues: mergedEnv, portValues: mergedPorts };
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
      source: "deployment",
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
        source: "deployment",
      });
      return;
    }

    notifier.sendLog({
      deployment: name,
      type: "stdout",
      message: SUCCESS_MESSAGES.CLEANUP_COMPLETED,
      timestamp: new Date().toISOString(),
      source: "deployment",
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
      source: "deployment",
    });

    const containerIds = await this.listProjectContainerIds(projectName);
    const collectedImages = await this.collectContainerImageRefs(containerIds);

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
          "--rmi",
          "all",
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
          "--rmi",
          "all",
          "--remove-orphans",
        ];

    const cleanup = await this.execCapture("docker", downArgs, cwd);

    if (cleanup.exitCode !== 0) {
      notifier.sendLog({
        deployment: name,
        type: "stderr",
        message: `${ERROR_MESSAGES.CLEANUP_FAILED}:\n${cleanup.stderr || cleanup.stdout}`,
        timestamp: new Date().toISOString(),
        source: "deployment",
      });

      await this.forceRemoveComposeProject(projectName, name, notifier);
      return;
    }

    await this.removeCollectedImages(
      projectName,
      collectedImages.imageRefs,
      collectedImages.imageIds,
    );

    await this.removeProjectNetworks(projectName, name, notifier);

    notifier.sendLog({
      deployment: name,
      type: "stdout",
      message: SUCCESS_MESSAGES.CLEANUP_COMPLETED,
      timestamp: new Date().toISOString(),
      source: "deployment",
    });
  }

  /**
   * Parses Docker output lines.
   */
  private parseDockerOutputLines(stdout: string): string[] {
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  /**
   * Lists container IDs by project label.
   */
  private async listProjectContainerIds(
    projectName: string,
  ): Promise<string[]> {
    try {
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

      return this.parseDockerOutputLines(containerIds.stdout);
    } catch (error) {
      this.logger.error(
        `Failed to list project container IDs for ${projectName}: ${String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Collects container image references and IDs.
   */
  private async collectContainerImageRefs(containerIds: string[]): Promise<{
    imageRefs: Set<string>;
    imageIds: Set<string>;
  }> {
    try {
      const imageRefs = new Set<string>();
      const imageIds = new Set<string>();

      for (const id of containerIds) {
        const refResult = await this.execCapture(
          "docker",
          ["inspect", "-f", "{{.Config.Image}}", id],
          process.cwd(),
        );
        const idResult = await this.execCapture(
          "docker",
          ["inspect", "-f", "{{.Image}}", id],
          process.cwd(),
        );

        const imageRef = refResult.stdout.trim();
        const imageId = idResult.stdout.trim();
        if (imageRef) {
          imageRefs.add(imageRef);
        }
        if (imageId) {
          imageIds.add(imageId);
        }
      }

      return { imageRefs, imageIds };
    } catch (error) {
      this.logger.error(
        `Failed to collect container image refs: ${String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Removes collected container images.
   */
  private async removeCollectedImages(
    projectName: string,
    imageRefs: Set<string>,
    imageIds: Set<string>,
  ): Promise<void> {
    for (const imageRef of imageRefs) {
      const removeImage = await this.execCapture(
        "docker",
        ["rmi", "-f", imageRef],
        process.cwd(),
      );
      if (removeImage.exitCode !== 0) {
        this.logger.warn(
          `Image ref removal for ${projectName} (${imageRef}): ${removeImage.stderr || removeImage.stdout}`,
        );
      }
    }

    for (const imageId of imageIds) {
      const removeImage = await this.execCapture(
        "docker",
        ["rmi", "-f", imageId],
        process.cwd(),
      );
      if (removeImage.exitCode !== 0) {
        this.logger.warn(
          `Image ID removal for ${projectName} (${imageId}): ${removeImage.stderr || removeImage.stdout}`,
        );
      }
    }

    const labeledImages = await this.execCapture(
      "docker",
      [
        "images",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${projectName}`,
      ],
      process.cwd(),
    );

    for (const imageId of this.parseDockerOutputLines(labeledImages.stdout)) {
      const removeImage = await this.execCapture(
        "docker",
        ["rmi", "-f", imageId],
        process.cwd(),
      );
      if (removeImage.exitCode !== 0) {
        this.logger.warn(
          `Labeled image removal for ${projectName} reported: ${removeImage.stderr || removeImage.stdout}`,
        );
      }
    }
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
    try {
      notifier.sendLog({
        deployment: name,
        type: "stdout",
        message: `Force-removing Docker resources for project ${projectName}`,
        timestamp: new Date().toISOString(),
        source: "deployment",
      });

      const ids = await this.listProjectContainerIds(projectName);
      const { imageRefs, imageIds } = await this.collectContainerImageRefs(ids);

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

      await this.removeProjectNetworks(projectName, name, notifier);

      await this.removeCollectedImages(projectName, imageRefs, imageIds);
    } catch (error) {
      this.logger.error(
        `Failed to force remove compose project ${projectName}: ${String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Removes compose project networks by label and common default naming.
   */
  private async removeProjectNetworks(
    projectName: string,
    name: string,
    notifier: ExecutionNotifier,
  ): Promise<void> {
    try {
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

      const networks = new Set(this.parseDockerOutputLines(networkIds.stdout));

      const defaultNetwork = `${projectName}_default`;
      const defaultInspect = await this.execCapture(
        "docker",
        ["network", "inspect", "-f", "{{.Id}}", defaultNetwork],
        process.cwd(),
      );
      if (defaultInspect.exitCode === 0) {
        const defaultId = defaultInspect.stdout.trim();
        if (defaultId) {
          networks.add(defaultId);
        }
      }

      if (networks.size === 0) {
        return;
      }

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
          continue;
        }

        notifier.sendLog({
          deployment: name,
          type: "stdout",
          message: `Network removed for ${projectName}`,
          timestamp: new Date().toISOString(),
          source: "deployment",
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to remove project networks for ${projectName}: ${String(error)}`,
      );
      throw error;
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
      let settled = false;

      const finish = (exitCode: number) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve({ exitCode, stdout, stderr });
      };

      child.stdout.on("data", (chunk) => (stdout += String(chunk)));
      child.stderr.on("data", (chunk) => (stderr += String(chunk)));
      child.on("error", (err) => {
        stderr += `Failed to start process: ${err.message}`;
        finish(1);
      });
      child.on("close", (code) => finish(code ?? 1));
    });
  }

  private sanitizeDockerOutput(text: string, maxLen = 500): string {
    return maskEnvContents(text).slice(0, maxLen);
  }

  private clearDeploymentStreamLineBuffers(deploymentId: string): void {
    for (const key of this.streamLineBuffers.keys()) {
      if (key.startsWith(`${deploymentId}:deployment:`)) {
        this.streamLineBuffers.delete(key);
      }
    }
  }

  private emitRawChunk(
    chunk: Buffer,
    type: "stdout" | "stderr",
    templateSlug: string,
    deploymentId: string,
    source: "deployment" | "container",
    notifier: ExecutionNotifier,
    debugLabel: string,
    containerId?: string,
  ): void {
    const text = chunk.toString();
    if (text.length === 0) return;

    if (source === "container") {
      const bufferKey = `${deploymentId}:container:${debugLabel}`;
      const combined = `${this.streamLineBuffers.get(bufferKey) ?? ""}${text}`;
      const normalized = combined.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const parts = normalized.split("\n");
      const remainder = parts.pop() ?? "";
      this.streamLineBuffers.set(bufferKey, remainder);

      for (const line of parts) {
        if (line.length === 0) continue;
        const display =
          line.startsWith("[") || line.includes(" | ")
            ? line
            : `[${containerId ?? "container"}] ${line}`;
        notifier.sendLog({
          deployment: templateSlug,
          deploymentId,
          containerId: containerId ?? "container",
          type,
          message: `${display}\n`,
          timestamp: new Date().toISOString(),
          source: "container",
        });
      }
      return;
    }

    const bufferKey = `${deploymentId}:deployment:${debugLabel}`;
    const combined = `${this.streamLineBuffers.get(bufferKey) ?? ""}${text}`;
    const normalized = combined.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const parts = normalized.split("\n");
    const remainder = parts.pop() ?? "";
    this.streamLineBuffers.set(bufferKey, remainder);

    for (const line of parts) {
      const trimmed = line.trimEnd();
      if (!trimmed) continue;

      notifier.sendLog({
        deployment: templateSlug,
        deploymentId,
        containerId,
        type,
        message: `${trimmed}\n`,
        timestamp: new Date().toISOString(),
        source: "deployment",
      });
    }
  }

  private flushContainerStreamBuffer(
    deploymentId: string,
    debugLabel: string,
    templateSlug: string,
    notifier: ExecutionNotifier,
    containerId?: string,
    type: "stdout" | "stderr" = "stdout",
  ): void {
    const bufferKey = `${deploymentId}:container:${debugLabel}`;
    const remainder = this.streamLineBuffers.get(bufferKey);
    if (!remainder?.trim()) return;

    const display =
      remainder.startsWith("[") || remainder.includes(" | ")
        ? remainder
        : `[${containerId ?? "container"}] ${remainder}`;

    notifier.sendLog({
      deployment: templateSlug,
      deploymentId,
      containerId: containerId ?? "container",
      type,
      message: `${display}\n`,
      timestamp: new Date().toISOString(),
      source: "container",
    });
    this.streamLineBuffers.delete(bufferKey);
  }

  private flushDeploymentStreamBuffer(
    deploymentId: string,
    debugLabel: string,
    templateSlug: string,
    notifier: ExecutionNotifier,
    type: "stdout" | "stderr" = "stdout",
  ): void {
    const bufferKey = `${deploymentId}:deployment:${debugLabel}`;
    const remainder = this.streamLineBuffers.get(bufferKey);
    if (!remainder) return;

    notifier.sendLog({
      deployment: templateSlug,
      deploymentId,
      type,
      message: `${remainder}\n`,
      timestamp: new Date().toISOString(),
      source: "deployment",
    });
    this.streamLineBuffers.delete(bufferKey);
  }

  private dockerComposeEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      COMPOSE_PROGRESS: "plain",
      DOCKER_CLI_HINTS: "false",
      BUILDKIT_PROGRESS: "plain",
    };
  }

  private composeBaseArgs(projectName: string): string[] {
    return [
      "compose",
      "--env-file",
      ".env",
      "-f",
      "docker-compose.yml",
      "-p",
      projectName,
    ];
  }

  /** Runs docker compose without forwarding orchestration output to the log stream. */
  private runComposeProcessSilent(cwd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("docker", args, {
        cwd,
        env: this.dockerComposeEnv(),
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.on("error", (error) => {
        reject(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`docker ${args.join(" ")} exited with code ${code}`));
      });
    });
  }

  private stopContainerLogStreaming(deploymentId: string): void {
    const session = this.containerLogSessions.get(deploymentId);
    if (!session) {
      return;
    }

    session.abort.abort();
    for (const child of session.children) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore kill errors during cleanup
      }
    }
    this.containerLogSessions.delete(deploymentId);
  }

  private async listComposeContainerIds(
    cwd: string,
    projectName: string,
  ): Promise<string[]> {
    const composeArgs = [
      "compose",
      "--env-file",
      ".env",
      "-f",
      "docker-compose.yml",
      "-p",
      projectName,
    ];

    for (const psArgs of [["-q"], ["-a", "-q"]] as const) {
      const result = await this.execCapture(
        "docker",
        [...composeArgs, "ps", ...psArgs],
        cwd,
      );

      if (result.exitCode === 0) {
        const ids = result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        if (ids.length > 0) {
          return ids;
        }
      }
    }

    const byLabel = await this.execCapture(
      "docker",
      [
        "ps",
        "-q",
        "--filter",
        `label=com.docker.compose.project=${projectName}`,
      ],
      cwd,
    );

    if (byLabel.exitCode !== 0) {
      return [];
    }

    return byLabel.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private async waitForComposeContainerIds(
    cwd: string,
    projectName: string,
    maxAttempts = 20,
    delayMs = 1500,
  ): Promise<string[]> {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const containerIds = await this.listComposeContainerIds(cwd, projectName);
      if (containerIds.length > 0) {
        return containerIds;
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return [];
  }

  private async startContainerLogStreaming(
    cwd: string,
    projectName: string,
    templateSlug: string,
    deploymentId: string,
    notifier: ExecutionNotifier,
  ): Promise<void> {
    this.stopContainerLogStreaming(deploymentId);

    const abort = new AbortController();
    const children: ChildProcess[] = [];
    this.containerLogSessions.set(deploymentId, { abort, children });

    const containerIds = await this.waitForComposeContainerIds(
      cwd,
      projectName,
      10,
      1000,
    );

    this.logger.log(
      `[DEPLOY_TRACE] starting docker compose logs -f deploymentId=${deploymentId} project=${projectName} containers=${containerIds.length}`,
    );

    notifier.sendLog({
      deployment: templateSlug,
      deploymentId,
      type: "stdout",
      message:
        containerIds.length > 0
          ? `Streaming container logs (${containerIds.length} container(s))…`
          : "Streaming container logs (waiting for containers)…",
      timestamp: new Date().toISOString(),
      source: "container",
    });

    this.followComposeProjectLogs(
      cwd,
      projectName,
      templateSlug,
      deploymentId,
      notifier,
      abort.signal,
      children,
    );
  }

  private followComposeProjectLogs(
    cwd: string,
    projectName: string,
    templateSlug: string,
    deploymentId: string,
    notifier: ExecutionNotifier,
    abortSignal: AbortSignal,
    trackedChildren: ChildProcess[],
  ): void {
    const debugLabel = "compose-logs";
    const child = spawn(
      "docker",
      [
        ...this.composeBaseArgs(projectName),
        "logs",
        "-f",
        "--no-color",
        "--tail",
        "200",
      ],
      { cwd, env: this.dockerComposeEnv(), stdio: ["ignore", "pipe", "pipe"] },
    );
    trackedChildren.push(child);

    child.stdout.on("data", (chunk: Buffer) => {
      this.emitRawChunk(
        chunk,
        "stdout",
        templateSlug,
        deploymentId,
        "container",
        notifier,
        debugLabel,
        projectName,
      );
    });

    child.stderr.on("data", (chunk: Buffer) => {
      this.emitRawChunk(
        chunk,
        "stderr",
        templateSlug,
        deploymentId,
        "container",
        notifier,
        debugLabel,
        projectName,
      );
    });

    child.on("error", (error) => {
      notifier.sendLog({
        deployment: templateSlug,
        deploymentId,
        type: "stderr",
        message: `Compose log stream error: ${error.message}`,
        timestamp: new Date().toISOString(),
        source: "container",
      });
    });

    child.on("close", () => {
      this.flushContainerStreamBuffer(
        deploymentId,
        debugLabel,
        templateSlug,
        notifier,
        projectName,
      );
      if (!abortSignal.aborted) {
        setTimeout(() => {
          if (!abortSignal.aborted) {
            this.followComposeProjectLogs(
              cwd,
              projectName,
              templateSlug,
              deploymentId,
              notifier,
              abortSignal,
              trackedChildren,
            );
          }
        }, 2000);
      }
    });
  }

  private runComposeUpStreaming(
    cwd: string,
    projectName: string,
    templateSlug: string,
    deploymentId: string,
    notifier: ExecutionNotifier,
    onReady: () => void | Promise<void>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          ...this.composeBaseArgs(projectName),
          "up",
          "--build",
          "--detach",
          "--no-color",
        ],
        {
          cwd,
          env: this.dockerComposeEnv(),
          stdio: ["ignore", "pipe", "pipe"],
        },
      );

      let settled = false;
      const debugLabel = "compose-up";
      let composeStderr = "";

      const handleChunk = (chunk: Buffer, streamType: "stdout" | "stderr") => {
        if (streamType === "stderr") {
          composeStderr += chunk.toString("utf8");
        }

        this.emitRawChunk(
          chunk,
          streamType,
          templateSlug,
          deploymentId,
          "deployment",
          notifier,
          debugLabel,
        );
      };

      child.stdout.on("data", (chunk: Buffer) => handleChunk(chunk, "stdout"));
      child.stderr.on("data", (chunk: Buffer) => handleChunk(chunk, "stderr"));

      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;

        child.stdout?.removeAllListeners("data");
        child.stderr?.removeAllListeners("data");

        this.flushDeploymentStreamBuffer(
          deploymentId,
          debugLabel,
          templateSlug,
          notifier,
        );

        if (error) {
          try {
            child.kill("SIGTERM");
          } catch {
            // ignore kill errors on failed deploy
          }
          reject(error);
          return;
        }

        child.unref();
        resolve();
      };

      child.on("error", (error) => {
        notifier.sendLog({
          deployment: templateSlug,
          deploymentId,
          type: "stderr",
          message: `Compose process error: ${error.message}`,
          timestamp: new Date().toISOString(),
          source: "deployment",
        });
        settle(error);
      });

      child.on("close", (code) => {
        if (settled) return;

        if (code === 0) {
          this.logger.log(
            `[DEPLOY_TRACE] compose up exited 0, starting container logs deploymentId=${deploymentId}`,
          );
          void (async () => {
            try {
              await onReady();
            } catch (error) {
              notifier.sendLog({
                deployment: templateSlug,
                deploymentId,
                type: "stderr",
                message: `Failed to start container log streaming: ${error instanceof Error ? error.message : String(error)}`,
                timestamp: new Date().toISOString(),
                source: "container",
              });
            }
            settle();
          })();
          return;
        }

        this.flushDeploymentStreamBuffer(
          deploymentId,
          debugLabel,
          templateSlug,
          notifier,
        );

        const error = new Error(
          composeStderr.trim() || `docker compose exited with code ${code}`,
        );
        notifier.sendLog({
          deployment: templateSlug,
          deploymentId,
          type: "stderr",
          message: error.message,
          timestamp: new Date().toISOString(),
          source: "deployment",
        });
        settle(error);
      });
    });
  }

  private async executeComposeWithLiveLogs(
    cwd: string,
    projectName: string,
    templateSlug: string,
    deploymentId: string,
    notifier: ExecutionNotifier,
  ): Promise<void> {
    try {
      await this.runComposeProcessSilent(cwd, [
        ...this.composeBaseArgs(projectName),
        "pull",
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.sendLog({
        deployment: templateSlug,
        deploymentId,
        type: "stderr",
        message: `Image pull failed: ${message}\n`,
        timestamp: new Date().toISOString(),
        source: "deployment",
      });
      throw error;
    }

    await this.runComposeUpStreaming(
      cwd,
      projectName,
      templateSlug,
      deploymentId,
      notifier,
      async () => {
        notifier.sendStatus({
          deploymentId,
          templateSlug,
          status: "running",
          message: SUCCESS_MESSAGES.RUNNING,
        });

        await this.startContainerLogStreaming(
          cwd,
          projectName,
          templateSlug,
          deploymentId,
          notifier,
        );
      },
    );
  }

  /**
   * Collects agent container image refs before teardown (used in the socket ack payload).
   */
  async collectAgentRemovalTargets(opts: {
    agentImage?: string;
  }): Promise<string[]> {
    try {
      const containerName = "kubeara-agent";
      const configuredImage =
        opts.agentImage?.trim() ||
        process.env.KUBEARA_AGENT_IMAGE?.trim() ||
        "kubeara/agent:prod";

      const imageRefs: string[] = [];

      const refResult = await this.execCapture(
        "docker",
        ["inspect", "-f", "{{.Config.Image}}", containerName],
        process.cwd(),
      );
      if (refResult.exitCode === 0 && refResult.stdout.trim()) {
        imageRefs.push(refResult.stdout.trim());
      }

      const idResult = await this.execCapture(
        "docker",
        ["inspect", "-f", "{{.Image}}", containerName],
        process.cwd(),
      );
      if (idResult.exitCode === 0 && idResult.stdout.trim()) {
        imageRefs.push(idResult.stdout.trim());
      }

      if (configuredImage) {
        imageRefs.push(configuredImage);
      }

      return [...new Set(imageRefs)];
    } catch (error) {
      this.logger.error(
        `Failed to collect agent removal targets: ${String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Tears down the Kubeara agent on the host using existing Docker CLI (no extra images).
   * Must run after the socket ack is sent — compose down stops this container.
   */
  async runAgentRemovalAfterAck(opts: {
    installDir: string;
    imageRefs: string[];
  }): Promise<void> {
    try {
      const installMount = "/opt/kubeara/agent-install";
      const composePath = `${installMount}/docker-compose.agent.yml`;
      const envPath = `${installMount}/.env.agent`;
      const projectName = this.resolveAgentComposeProjectName(opts.installDir);

      this.logger.log(
        `[AGENT_REMOVE] starting host teardown installMount=${installMount} project=${projectName}`,
      );

      const composeAvailable =
        (await this.exists(composePath)) && (await this.exists(envPath));

      if (composeAvailable) {
        const composeDown = await this.execCapture(
          "docker",
          [
            "compose",
            "-f",
            composePath,
            "--env-file",
            envPath,
            "-p",
            projectName,
            "down",
            "--volumes",
            "--rmi",
            "all",
            "--remove-orphans",
          ],
          installMount,
        );

        if (composeDown.exitCode !== 0) {
          this.logger.warn(
            `[AGENT_REMOVE] compose down reported: ${composeDown.stderr.trim() || composeDown.stdout.trim()}`,
          );
        }
      } else {
        this.logger.warn(
          `[AGENT_REMOVE] install mount unavailable at ${installMount}; using direct docker cleanup`,
        );
      }

      await this.forceRemoveAgentHostArtifacts({
        imageRefs: opts.imageRefs,
        projectName,
      });
    } catch (error) {
      this.logger.error(
        `Failed to run agent removal after ack: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private resolveAgentComposeProjectName(installDir: string): string {
    const base = installDir
      .replace(/\/+$/, "")
      .split("/")
      .filter(Boolean)
      .pop();
    const normalized = (base ?? "agent")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "");
    return normalized || "agent";
  }

  /**
   * Forces removal of agent host artifacts.
   */
  private async forceRemoveAgentHostArtifacts(opts: {
    imageRefs: string[];
    projectName: string;
  }): Promise<void> {
    try {
      const containerName = "kubeara-agent";
      const { projectName, imageRefs } = opts;

      await this.execCapture(
        "docker",
        ["update", "--restart=no", containerName],
        process.cwd(),
      );

      await this.execCapture(
        "docker",
        ["rm", "-f", containerName],
        process.cwd(),
      );

      const projectContainers = await this.execCapture(
        "docker",
        [
          "ps",
          "-aq",
          "--filter",
          `label=com.docker.compose.project=${projectName}`,
        ],
        process.cwd(),
      );
      const containerIds = this.parseDockerOutputLines(
        projectContainers.stdout,
      );
      if (containerIds.length > 0) {
        await this.execCapture(
          "docker",
          ["rm", "-f", ...containerIds],
          process.cwd(),
        );
      }

      const volumes = await this.execCapture(
        "docker",
        ["volume", "ls", "-q", "--filter", "name=agent_deployments"],
        process.cwd(),
      );
      const volumeIds = this.parseDockerOutputLines(volumes.stdout);
      if (volumeIds.length > 0) {
        await this.execCapture(
          "docker",
          ["volume", "rm", "-f", ...volumeIds],
          process.cwd(),
        );
      }

      const networks = await this.execCapture(
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
      for (const networkId of this.parseDockerOutputLines(networks.stdout)) {
        await this.execCapture(
          "docker",
          ["network", "rm", networkId],
          process.cwd(),
        );
      }

      const imagesToRemove = [...new Set(imageRefs.filter(Boolean))];
      for (const imageRef of imagesToRemove) {
        await this.execCapture(
          "docker",
          ["rmi", "-f", imageRef],
          process.cwd(),
        );
      }

      const taggedImages = await this.execCapture(
        "docker",
        ["images", "kubeara/agent", "-q"],
        process.cwd(),
      );
      for (const imageId of this.parseDockerOutputLines(taggedImages.stdout)) {
        await this.execCapture("docker", ["rmi", "-f", imageId], process.cwd());
      }

      this.logger.log("[AGENT_REMOVE] force host cleanup finished");
    } catch (error) {
      this.logger.error(
        `Failed to force remove agent host artifacts: ${String(error)}`,
      );
      throw error;
    }
  }
}
